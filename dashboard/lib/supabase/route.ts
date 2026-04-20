import { type NextRequest, type NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

type BufferedCookie = { name: string; value: string; options: Record<string, unknown> };

function isLocalhostRequest(request: NextRequest): boolean {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function fixCookieOptionsForLocalhost(
  options: Record<string, unknown>,
  isLocalhost: boolean,
): Record<string, unknown> {
  if (!isLocalhost) return options;
  return {
    ...options,
    secure: false,
    sameSite: "lax" as const,
  };
}

/**
 * Creates a Supabase client bound to request cookies for reads
 * and to a response object for writes.
 */
export function createSupabaseRouteClient(req: NextRequest, res: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing Supabase key");

  const localhost = isLocalhostRequest(req);

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          const fixed = fixCookieOptionsForLocalhost(options, localhost);
          res.cookies.set(name, value, fixed);
        }
      },
    },
  });
}

/**
 * Creates a Supabase client that buffers all cookie writes
 * so they can be applied to any response later.
 * Use this in login start routes where the final response
 * (redirect to Supabase) is not known until after signInWithOAuth.
 */
export function createSupabaseRouteClientBuffered(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing Supabase key");

  const localhost = isLocalhostRequest(req);
  const bufferedCookies: BufferedCookie[] = [];

  const client = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          bufferedCookies.push({
            name,
            value,
            options: fixCookieOptionsForLocalhost(options, localhost),
          });
        }
      },
    },
  });

  function applyBufferedCookies(res: NextResponse) {
    for (const { name, value, options } of bufferedCookies) {
      res.cookies.set(name, value, options);
    }
  }

  function debugCookies(label: string) {
    console.log(`[${label}] buffered cookies (${bufferedCookies.length}):`);
    for (const { name, options } of bufferedCookies) {
      console.log(`  ${name}`, {
        path: options.path,
        secure: options.secure,
        sameSite: options.sameSite,
        httpOnly: options.httpOnly,
        maxAge: options.maxAge,
      });
    }
  }

  return { client, applyBufferedCookies, debugCookies };
}
