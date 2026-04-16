import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import type { ConnectionOptions } from "node:tls";
import type { RunRow } from "./runTypes";

const RUN_SELECT_LIST =
  "id, created_at, mode, status, policy_version, bundle_sha256, evidence_sha256, report_sha256, evidence_source, closed_at";

/**
 * When `node-postgres` is given an explicit `ssl` object, libpq-style query parameters on the
 * connection string can still influence or fight TLS behavior. Strip these before connecting so
 * `ssl: { ca, rejectUnauthorized: true }` is authoritative.
 *
 * Production: use `GOVAI_CONSOLE_PG_CA_CERT_PATH` and a connection string **without** these params
 * (or rely on this strip when they are present for compatibility).
 */
const LIBPQ_SSL_QUERY_KEYS = new Set([
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslcrl",
  "ssl_min_protocol_version",
]);

function stripLibpqSslQueryParamsFromDatabaseUrl(urlString: string): string {
  try {
    const u = new URL(urlString);
    for (const key of [...u.searchParams.keys()]) {
      if (LIBPQ_SSL_QUERY_KEYS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return urlString;
  }
}

function isTruthyEnv(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * Resolves TLS for the GovAI console `pg` pool.
 *
 * Precedence (first match wins):
 * 1. `GOVAI_CONSOLE_PG_CA_CERT_PATH` — verify server cert against this PEM (production-safe).
 * 2. `GOVAI_CONSOLE_PG_SSL_NO_VERIFY=true` — **dev/local only**; disables verification.
 * 3. Default — no explicit `ssl` object; URL + Node defaults (e.g. `sslmode=require` in URL only).
 */
function resolveConsolePoolTls(rawUrl: string):
  | { connectionString: string; ssl: ConnectionOptions }
  | { connectionString: string; ssl?: undefined } {
  const caPath = (process.env.GOVAI_CONSOLE_PG_CA_CERT_PATH ?? "").trim();
  if (caPath) {
    let ca: string;
    try {
      ca = readFileSync(caPath, "utf8");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`GOVAI_CONSOLE_PG_CA_CERT_PATH: cannot read "${caPath}": ${msg}`);
    }
    return {
      connectionString: stripLibpqSslQueryParamsFromDatabaseUrl(rawUrl),
      ssl: { ca, rejectUnauthorized: true },
    };
  }

  if (isTruthyEnv(process.env.GOVAI_CONSOLE_PG_SSL_NO_VERIFY)) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "GOVAI: SSL no-verify is enabled in production. This is insecure and should only be used for local development."
      );
    }
    return {
      connectionString: stripLibpqSslQueryParamsFromDatabaseUrl(rawUrl),
      ssl: { rejectUnauthorized: false },
    };
  }

  return { connectionString: rawUrl };
}

function getConsoleDatabaseUrl(): string {
  const fromGovai = (process.env.GOVAI_DATABASE_URL ?? "").trim();
  if (fromGovai) return fromGovai;
  return (process.env.DATABASE_URL ?? "").trim();
}

/** When true, dashboard run metadata reads use GovAI Postgres (`console` schema), not Supabase PostgREST. */
export function isConsoleRunsReadEnabled(): boolean {
  const v = (process.env.GOVAI_CONSOLE_RUNS_ENABLED ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") {
    return Boolean(getConsoleDatabaseUrl());
  }
  return false;
}

type GlobalWithPool = typeof globalThis & { __govaiConsoleRunsPool?: Pool };

function getPool(): Pool {
  const url = getConsoleDatabaseUrl();
  if (!url) {
    throw new Error("GOVAI_CONSOLE_RUNS_ENABLED is set but neither GOVAI_DATABASE_URL nor DATABASE_URL is set");
  }
  const g = globalThis as GlobalWithPool;
  if (!g.__govaiConsoleRunsPool) {
    const tls = resolveConsolePoolTls(url);
    g.__govaiConsoleRunsPool = new Pool({
      connectionString: tls.connectionString,
      max: Number(process.env.GOVAI_CONSOLE_PG_POOL_MAX ?? 5),
      ...(tls.ssl ? { ssl: tls.ssl } : {}),
    });
  }
  return g.__govaiConsoleRunsPool;
}

function asIsoString(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  return s.length ? s : null;
}

function mapRunRow(row: Record<string, unknown>): RunRow {
  return {
    id: String(row.id ?? ""),
    created_at: asIsoString(row.created_at) ?? "",
    mode: row.mode == null ? null : String(row.mode),
    status: row.status == null ? null : String(row.status),
    policy_version: row.policy_version == null ? null : String(row.policy_version),
    bundle_sha256: row.bundle_sha256 == null ? null : String(row.bundle_sha256),
    evidence_sha256: row.evidence_sha256 == null ? null : String(row.evidence_sha256),
    report_sha256: row.report_sha256 == null ? null : String(row.report_sha256),
    evidence_source: row.evidence_source == null ? null : String(row.evidence_source),
    closed_at: row.closed_at == null ? null : asIsoString(row.closed_at),
  };
}

export async function fetchRecentRunsFromGovai(
  limit: number
): Promise<{ runs: RunRow[]; error: Error | null }> {
  try {
    const pool = getPool();
    const lim = Math.min(Math.max(1, Math.floor(limit)), 2000);
    const res = await pool.query(
      `select ${RUN_SELECT_LIST}
       from console.runs
       order by created_at desc
       limit $1`,
      [lim]
    );
    return { runs: res.rows.map((r) => mapRunRow(r as Record<string, unknown>)), error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { runs: [], error: err };
  }
}

/** Uses `console.compliance_runs` view so the Supabase-era name stays exercised in SQL. */
export async function fetchRecentComplianceRunsFromGovai(
  limit: number
): Promise<{ runs: RunRow[]; error: Error | null }> {
  try {
    const pool = getPool();
    const lim = Math.min(Math.max(1, Math.floor(limit)), 2000);
    const res = await pool.query(
      `select ${RUN_SELECT_LIST}
       from console.compliance_runs
       order by created_at desc
       limit $1`,
      [lim]
    );
    return { runs: res.rows.map((r) => mapRunRow(r as Record<string, unknown>)), error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { runs: [], error: err };
  }
}

export async function fetchRunByIdFromGovai(
  id: string
): Promise<{ run: RunRow | null; error: Error | null }> {
  try {
    const pool = getPool();
    const res = await pool.query(
      `select ${RUN_SELECT_LIST}
       from console.runs
       where id = $1
       limit 1`,
      [id.trim()]
    );
    if ((res.rowCount ?? 0) === 0) return { run: null, error: null };
    return { run: mapRunRow(res.rows[0] as Record<string, unknown>), error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { run: null, error: err };
  }
}
