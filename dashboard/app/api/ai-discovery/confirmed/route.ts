import { NextResponse } from "next/server";

import { loadConfirmedStore } from "@/lib/ai-discovery/loadConfirmedStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { listConfirmedSystems } = await loadConfirmedStore();
  const systems = listConfirmedSystems();
  return NextResponse.json({ ok: true, systems }, { status: 200 });
}
