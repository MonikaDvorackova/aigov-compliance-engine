import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

function safeNext(raw: string | null): string {
  if (!raw) return "/runs";
  const v = raw.trim();
  if (!v) return "/runs";
  if (v.startsWith("/")) return v;
  return "/runs";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;

  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");

  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  if (oauthError) {
    const msg = encodeURIComponent(oauthErrorDescription || oauthError);
    return NextResponse.redirect(new URL(`/login?message=${msg}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?message=MissingOAuthCode", origin));
  }

  const res = NextResponse.redirect(new URL(next, origin));
  const supabase = createSupabaseRouteClient(request, res);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const msg = encodeURIComponent(error.message || "OAuthExchangeFailed");
    return NextResponse.redirect(new URL(`/login?message=${msg}`, origin));
  }

  return NextResponse.redirect(new URL(next, origin), { headers: res.headers });
}