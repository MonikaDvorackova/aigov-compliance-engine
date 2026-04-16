import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAppOrigin, safeAuthNextPath } from "@/lib/appOrigin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getNextPublicSupabaseKeySource, getNextPublicSupabaseUrl } from "@/lib/supabase/publicEnv";

export const dynamic = "force-dynamic";

function logExchangeError(error: { message: string; name?: string; status?: number; code?: string }) {
  console.log("[auth:callback] exchange error detail", {
    message: error.message,
    name: error.name ?? null,
    status: error.status ?? null,
    code: error.code ?? null,
  });
}

export async function GET(request: NextRequest) {
  console.log("[auth:callback] start");

  let projectHost: string | null = null;
  try {
    projectHost = new URL(getNextPublicSupabaseUrl()).host;
  } catch {
    projectHost = null;
  }
  console.log("[auth:callback] supabase project", {
    urlHost: projectHost,
    keySource: getNextPublicSupabaseKeySource(),
  });

  const origin = getAppOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  console.log(
    "[auth:callback] code:",
    code ? `${code.slice(0, 6)}… (len ${code.length})` : null,
  );

  const nextFromCookie = request.cookies.get("oauth_next")?.value ?? null;
  const nextFromParam = request.nextUrl.searchParams.get("next");
  const next = safeAuthNextPath(nextFromCookie || nextFromParam);

  const allCookies = request.cookies.getAll();
  const names = allCookies.map((c) => c.name).sort();
  const duplicateCookieNames = names.length !== new Set(names).size;
  const sbRelated = names.filter((n) => n.includes("sb-") || n.toLowerCase().includes("supabase"));
  console.log("[auth:callback] cookies", {
    count: names.length,
    duplicateNames: duplicateCookieNames,
    sbRelatedCount: sbRelated.length,
    names,
  });

  console.log("[auth:flow] 3-callback ctx", { next, origin });

  if (!code) {
    console.log("[auth:callback] NO CODE → /login");
    return NextResponse.redirect(new URL("/login?message=MissingOAuthCode", origin));
  }

  const target = new URL(next, origin);
  const res = NextResponse.redirect(target);
  const supabase = createSupabaseRouteClient(request, res);

  res.cookies.set("oauth_next", "", { path: "/", maxAge: 0 });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const e = error as { message: string; name?: string; status?: number; code?: string };
    logExchangeError(e);
    console.log("[auth:callback] exchange error stack", (error as Error).stack ?? null);

    const msg = encodeURIComponent(error.message || "OAuthExchangeFailed");
    return NextResponse.redirect(new URL(`/login?oauth_err=1&message=${msg}`, origin));
  }

  console.log("[auth:flow] 4-exchange OK → layout should see session on next request");
  console.log("[auth:callback] exchange OK", {
    hasSession: Boolean(data?.session),
    redirectTo: target.pathname,
  });
  return res;
}
