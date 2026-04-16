import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getNextPublicSupabaseKey, getNextPublicSupabaseUrl } from "@/lib/supabase/publicEnv";

export async function createSupabaseServerClient() {
  const url = getNextPublicSupabaseUrl();
  const key = getNextPublicSupabaseKey();

  const store = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          /* Server Components often cannot set cookies; Route Handlers + proxy refresh the session. */
        }
      },
    },
  });
}
