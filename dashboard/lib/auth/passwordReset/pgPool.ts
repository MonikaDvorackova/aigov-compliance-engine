import { readFileSync } from "node:fs";
import { Pool } from "pg";
import type { ConnectionOptions } from "node:tls";

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

function resolvePoolTls(rawUrl: string):
  | { connectionString: string; ssl: ConnectionOptions }
  | { connectionString: string; ssl?: undefined } {
  const caPath = (process.env.GOVAI_CONSOLE_PG_CA_CERT_PATH ?? "").trim();
  if (caPath) {
    const ca = readFileSync(caPath, "utf8");
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

function getPasswordResetDatabaseUrl(): string {
  const explicit = (process.env.PASSWORD_RESET_DATABASE_URL ?? "").trim();
  if (explicit) return explicit;
  const fromGovai = (process.env.GOVAI_DATABASE_URL ?? "").trim();
  if (fromGovai) return fromGovai;
  return (process.env.DATABASE_URL ?? "").trim();
}

type G = typeof globalThis & { __aigovPasswordResetPool?: Pool };

export function getPasswordResetPool(): Pool {
  const url = getPasswordResetDatabaseUrl();
  if (!url) {
    throw new Error(
      "Password reset requires a Postgres URL: PASSWORD_RESET_DATABASE_URL, GOVAI_DATABASE_URL, or DATABASE_URL"
    );
  }

  const g = globalThis as G;
  if (!g.__aigovPasswordResetPool) {
    const tls = resolvePoolTls(url);
    g.__aigovPasswordResetPool = new Pool({
      connectionString: tls.connectionString,
      max: 3,
      ...(tls.ssl ? { ssl: tls.ssl } : {}),
    });
  }
  return g.__aigovPasswordResetPool;
}
