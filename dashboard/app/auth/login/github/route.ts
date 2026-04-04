import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAppOrigin, safeAuthNextPath } from "@/lib/appOrigin";
import { createSupabaseRouteClientBuffered } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request);
  const next = safeAuthNextPath(request.nextUrl.searchParams.get("next"));
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  console.log("[auth:start] github", { requestUrl: request.url, origin, redirectTo });

  const { client: supabase, applyBufferedCookies, debugCookies } =
    createSupabaseRouteClientBuffered(request);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.log("[auth:start] github FAILED", error?.message);
    return NextResponse.redirect(new URL("/login?message=OAuthStartFailed", origin));
  }

  debugCookies("auth:start github");

  const response = NextResponse.redirect(data.url);
  applyBufferedCookies(response);

  const setCookieHeaders = response.headers.getSetCookie();
  console.log("[auth:start] github final Set-Cookie count:", setCookieHeaders.length);
  for (const h of setCookieHeaders) {
    console.log("[auth:start] github Set-Cookie:", h);
  }

  return response;
}
