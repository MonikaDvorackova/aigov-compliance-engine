import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

function safeNextPath(raw: string | null, fallback: string = "/runs"): string {
  if (!raw) return fallback;

  const v = raw.trim();
  if (!v) return fallback;

  if (v.startsWith("/")) return v;

  return fallback;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/runs");

  if (!code) {
    const redirectUrl = new URL("/login", url.origin);
    redirectUrl.searchParams.set("message", "Missing OAuth code.");
    return NextResponse.redirect(redirectUrl);
  }

  const res = NextResponse.redirect(new URL(next, url.origin));
  const supabase = createSupabaseRouteClient(request, res);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const redirectUrl = new URL("/login", url.origin);
    redirectUrl.searchParams.set("message", `exchange:${error.message}`);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}
