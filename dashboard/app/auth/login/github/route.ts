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

function copySetCookie(from: NextResponse, to: NextResponse) {
  const anyHeaders = from.headers as any;

  if (typeof anyHeaders.getSetCookie === "function") {
    const cookies: string[] = anyHeaders.getSetCookie();
    for (const c of cookies) to.headers.append("set-cookie", c);
    return;
  }

  const single = from.headers.get("set-cookie");
  if (single) to.headers.set("set-cookie", single);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;

  const next = safeNext(url.searchParams.get("next"));
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const res = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, res);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo },
  });

  if (error || !data?.url) {
    const fail = NextResponse.redirect(new URL("/login?message=OAuthStartFailed", origin));
    copySetCookie(res, fail);
    return fail;
  }

  const redirect = NextResponse.redirect(data.url);
  copySetCookie(res, redirect);
  return redirect;
}