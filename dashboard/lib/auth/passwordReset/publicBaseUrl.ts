import type { NextRequest } from "next/server";
import { getAppOrigin } from "@/lib/appOrigin";

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

/**
 * Public base URL for password reset links. Prefer explicit env in production so links never
 * depend on proxy headers. Falls back to the incoming request origin for local development.
 */
export function resolvePasswordResetPublicBase(request?: NextRequest): string {
  const envBase = (
    process.env.PASSWORD_RESET_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  )
    .trim()
    .replace(/\/+$/, "");

  if (envBase) return trimTrailingSlashes(envBase);
  if (request) return trimTrailingSlashes(getAppOrigin(request));
  throw new Error(
    "Password reset links need PASSWORD_RESET_APP_URL or NEXT_PUBLIC_SITE_URL (or pass the request for dev fallback)."
  );
}
