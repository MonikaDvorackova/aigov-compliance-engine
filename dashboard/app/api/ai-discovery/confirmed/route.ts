import { NextResponse } from "next/server";

import { requireAiDiscoverySession } from "@/lib/ai-discovery/aiDiscoveryRouteAuth.server";
import { loadConfirmedStore } from "@/lib/ai-discovery/loadConfirmedStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAiDiscoverySession();
  if (!auth.ok) return auth.response;

  const { listConfirmedSystems } = await loadConfirmedStore();
  const systems = listConfirmedSystems();
  return NextResponse.json({ ok: true, systems }, { status: 200 });
}
