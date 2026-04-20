import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AiDiscoverySessionResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

/**
 * Session check for dashboard AI Discovery API routes (same shape everywhere).
 */
export async function requireAiDiscoverySession(): Promise<AiDiscoverySessionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "auth_error", message: userErr.message },
        { status: 401 }
      ),
    };
  }

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "unauthorized", message: "Not signed in." },
        { status: 401 }
      ),
    };
  }

  return { ok: true, user };
}
