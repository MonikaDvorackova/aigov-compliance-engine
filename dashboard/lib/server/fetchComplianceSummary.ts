/**
 * Server-only: loads `GET /compliance-summary` from the Rust audit service.
 * Set `AIGOV_AUDIT_URL` (e.g. http://127.0.0.1:8088) on the dashboard process.
 * See docs/strong-core-contract-note.md — UI must not re-derive projection logic.
 */

export type ComplianceSummaryResult =
  | { available: false; reason: "no_audit_url" | "fetch_failed"; detail?: string }
  | { available: true; body: unknown };

export async function fetchComplianceSummary(
  runId: string
): Promise<ComplianceSummaryResult> {
  const base = (process.env.AIGOV_AUDIT_URL ?? "").trim();
  if (!base) {
    return { available: false, reason: "no_audit_url" };
  }

  const url = `${base.replace(/\/$/, "")}/compliance-summary?run_id=${encodeURIComponent(runId)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return {
        available: false,
        reason: "fetch_failed",
        detail: "invalid JSON from audit service",
      };
    }
    return { available: true, body };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { available: false, reason: "fetch_failed", detail };
  }
}
