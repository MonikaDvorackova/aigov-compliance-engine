import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getNextPublicSupabaseKey, getNextPublicSupabaseUrl } from "@/lib/supabase/publicEnv";

function getSupabaseUrlAndKey(): { url: string; key: string } | null {
  try {
    return { url: getNextPublicSupabaseUrl(), key: getNextPublicSupabaseKey() };
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const cfg = getSupabaseUrlAndKey();
  if (!cfg) return response;

  try {
    const supabase = createServerClient(cfg.url, cfg.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    console.log("[supabase/proxy]", request.nextUrl.pathname, { hasUser: Boolean(user) });
    return response;
  } catch {
    return response;
  }
}
