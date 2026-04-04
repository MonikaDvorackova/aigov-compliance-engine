import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAppOrigin, safeAuthNextPath } from "@/lib/appOrigin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const next = safeAuthNextPath(request.nextUrl.searchParams.get("next"));

  const allCookies = request.cookies.getAll();
  const cookieNames = allCookies.map((c) => c.name);
  const hasVerifier = allCookies.some(
    (c) => c.name.includes("code-verifier") || c.name.includes("code_verifier"),
  );

  console.log("[auth:callback]", {
    requestUrl: request.url,
    origin,
    next,
    hasCode: Boolean(code),
    cookieCount: allCookies.length,
    cookieNames,
    hasVerifier,
  });

  if (!code) {
    console.log("[auth:callback] NO CODE → /login");
    return NextResponse.redirect(new URL("/login?message=MissingOAuthCode", origin));
  }

  const target = new URL(next, origin);
  const res = NextResponse.redirect(target);
  const supabase = createSupabaseRouteClient(request, res);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  console.log("[auth:callback] exchange", {
    ok: !error,
    hasSession: Boolean(data?.session),
    error: error?.message ?? null,
  });

  if (error) {
    const msg = encodeURIComponent(error.message || "OAuthExchangeFailed");
    console.log("[auth:callback] EXCHANGE ERROR → /login");
    return NextResponse.redirect(new URL(`/login?message=${msg}`, origin));
  }

  console.log("[auth:callback] SUCCESS → redirect", target.toString());
  return res;
}
