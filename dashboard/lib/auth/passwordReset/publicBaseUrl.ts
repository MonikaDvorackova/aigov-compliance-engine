import type { NextRequest } from "next/server";
import { getAppOrigin } from "@/lib/appOrigin";

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

/** Request-derived origin only when not a production deployment (local dev, preview, etc.). */
function allowRequestOriginFallback(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const vercel = (process.env.VERCEL_ENV ?? "").trim();
  return vercel === "development" || vercel === "preview";
}

/**
 * Public base URL for password reset links. Env wins in all environments; request origin is only
 * used when no env base is set and the process is clearly non-production.
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

  if (request && allowRequestOriginFallback()) {
    return trimTrailingSlashes(getAppOrigin(request));
  }

  throw new Error(
    "Password reset requires PASSWORD_RESET_APP_URL or NEXT_PUBLIC_SITE_URL in production (request-origin fallback is disabled)."
  );
}
