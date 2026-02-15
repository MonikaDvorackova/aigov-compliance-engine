import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getSupabaseUrlAndKey(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
}

// Middleware helper: refresh session on requests
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const cfg = getSupabaseUrlAndKey();

  // Fail open: never break the request because of auth
  if (!cfg) return response;

  try {
    const supabase = createServerClient(cfg.url, cfg.key, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          response.cookies.set(name, value, options);
        },
        remove(name: string, options: any) {
          response.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    });

    await supabase.auth.getClaims();
    return response;
  } catch {
    return response;
  }
}

// Route handler helper: writes auth cookies into the provided response
export function createSupabaseRouteClient(request: NextRequest, response: NextResponse) {
  const cfg = getSupabaseUrlAndKey();
  if (!cfg) return null;

  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        response.cookies.set(name, value, options);
      },
      remove(name: string, options: any) {
        response.cookies.set(name, "", { ...options, maxAge: 0 });
      },
    },
  });
}
