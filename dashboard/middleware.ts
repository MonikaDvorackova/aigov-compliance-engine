import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail open: nikdy nerozbíjej request kvůli auth klientovi
  if (!url || !anon) return res;

  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          // Next cookies API v middleware je citlivé na tvar options
          res.cookies.set(name, value, options);
        },
        remove(name: string, options: any) {
          res.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    });

    // Tohle stačí pouze pro "refresh session" flow
    await supabase.auth.getUser();
  } catch {
    // Fail open: ignoruj chybu a pusť request dál
    return res;
  }

  return res;
}

export const config = {
  matcher: [
    // Vylouč interní assets + API + auth callbacky
    "/((?!_next/static|_next/image|favicon.ico|api|auth).*)",
  ],
};
