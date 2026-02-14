import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/runs";

  if (!code) {
    const redirectUrl = new URL("/login", url.origin);
    redirectUrl.searchParams.set("message", "Missing OAuth code.");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const redirectUrl = new URL("/login", url.origin);
    redirectUrl.searchParams.set("message", error.message || "OAuth exchange failed.");
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
