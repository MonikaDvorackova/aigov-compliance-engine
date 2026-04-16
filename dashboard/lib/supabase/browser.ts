import { createClient } from "@supabase/supabase-js";
import { getNextPublicSupabaseKey, getNextPublicSupabaseUrl } from "@/lib/supabase/publicEnv";

export function createSupabaseBrowserClient() {
  const url = getNextPublicSupabaseUrl();
  const key = getNextPublicSupabaseKey();

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
