import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "./lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const res = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createSupabaseRouteClient(request, res);
  if (supabase) await supabase.auth.getClaims();
  return res;
}
