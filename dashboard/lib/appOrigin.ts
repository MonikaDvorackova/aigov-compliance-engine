import type { NextRequest } from "next/server";

/**
 * Derives the app origin strictly from the incoming request.
 * Never reads environment variables — prevents any production fallback leak.
 */
export function getAppOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host");

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");

  return `${proto}://${host}`;
}

/** Sanitize the OAuth `next` param to a same-site relative path. */
export function safeAuthNextPath(raw: string | null): string {
  if (!raw) return "/runs";
  const v = raw.trim();
  if (!v.startsWith("/")) return "/runs";
  if (v.startsWith("//")) return "/runs";
  return v || "/runs";
}
