/**
 * GovAI hosted HTTP API helpers for the dashboard billing page.
 *
 * Configure `NEXT_PUBLIC_GOVAI_API_BASE_URL` (no trailing slash), e.g. `https://govai.example.com`.
 * The dashboard stores the operator-provided GovAI API secret in **sessionStorage** under
 * `govai_dashboard_api_key` when the user saves it from the billing page (browser session only).
 */
const STORAGE_KEY = "govai_dashboard_api_key";

export function govaiApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_GOVAI_API_BASE_URL?.trim() ?? "";
  return raw.replace(/\/$/, "");
}

export function readSessionApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return (sessionStorage.getItem(STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function writeSessionApiKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = key.trim();
    if (!t) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

export async function govaiFetchJson(
  path: string,
  init: RequestInit & { method?: string }
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const base = govaiApiBaseUrl();
  if (!base) {
    return { ok: false, status: 0, json: { error: "NEXT_PUBLIC_GOVAI_API_BASE_URL is not set" } };
  }
  const token = readSessionApiKey();
  if (!token) {
    return { ok: false, status: 0, json: { error: "missing_api_key" } };
  }
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}
