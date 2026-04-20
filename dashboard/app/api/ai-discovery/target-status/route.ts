import { NextResponse } from "next/server";

import {
  filterAndSortTargetStatuses,
  parseTargetStatusQuery,
} from "@/lib/ai-discovery/aiDiscoveryListQuery.server";
import { requireAiDiscoverySession } from "@/lib/ai-discovery/aiDiscoveryRouteAuth.server";
import { deriveDiscoveryTargetStatuses } from "@/lib/ai-discovery/deriveDiscoveryTargetStatus.server";
import { listStoredScans } from "@/lib/ai-discovery/scanHistoryPersistence.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAiDiscoverySession();
  if (!auth.ok) return auth.response;

  const scans = listStoredScans();
  const derived = deriveDiscoveryTargetStatuses(scans);
  const url = new URL(request.url);
  const q = parseTargetStatusQuery(url.searchParams);
  const targets = filterAndSortTargetStatuses(derived, q);
  return NextResponse.json({ ok: true, targets }, { status: 200 });
}
