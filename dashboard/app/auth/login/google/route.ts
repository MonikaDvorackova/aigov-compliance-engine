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
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const res = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, res);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/login?message=OAuthStartFailed", origin));
  }

  return NextResponse.redirect(data.url);
}
