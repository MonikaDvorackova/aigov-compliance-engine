import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAppOrigin, safeAuthNextPath } from "@/lib/appOrigin";
import { createSupabaseRouteClientBuffered } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("[auth:flow] 1-google-route");
  const origin = getAppOrigin(request);
  const next = safeAuthNextPath(request.nextUrl.searchParams.get("next"));
  const redirectTo = `${origin}/auth/callback`;

  console.log("[auth:start] google", { requestUrl: request.url, origin, redirectTo, next });

  const { client: supabase, applyBufferedCookies, debugCookies } =
    createSupabaseRouteClientBuffered(request);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.log("[auth:start] google FAILED", error?.message);
    return NextResponse.redirect(new URL("/login?message=OAuthStartFailed", origin));
  }

  debugCookies("auth:start google");

  const response = NextResponse.redirect(data.url);
  applyBufferedCookies(response);

  response.cookies.set("oauth_next", next, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: !origin.startsWith("http://localhost"),
    maxAge: 600,
  });

  console.log("[auth:start] google data.url:", data.url);

  return response;
}
