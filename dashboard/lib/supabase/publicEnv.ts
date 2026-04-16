/**
 * Single source for browser + server public Supabase config.
 * Must match everywhere or OAuth exchange and session reads can disagree.
 */
export function getNextPublicSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

/** Prefer publishable key when set (Supabase newer naming); else anon — same as route.ts / server.ts */
export function getNextPublicSupabaseKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  return key;
}

export function getNextPublicSupabaseKeySource(): "publishable" | "anon" {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "publishable" : "anon";
}
