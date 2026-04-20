import { NextResponse } from "next/server";

import {
  filterAndSortStoredScans,
  pageHistoryScanResults,
  parseHistoryQuery,
} from "@/lib/ai-discovery/aiDiscoveryListQuery.server";
import { requireAiDiscoverySession } from "@/lib/ai-discovery/aiDiscoveryRouteAuth.server";
import { listStoredScans } from "@/lib/ai-discovery/scanHistoryPersistence.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAiDiscoverySession();
  if (!auth.ok) return auth.response;

  const scans = listStoredScans();
  const url = new URL(request.url);
  const q = parseHistoryQuery(url.searchParams);
  const ordered = filterAndSortStoredScans(scans, q);
  const { page, totalFiltered, hasMore } = pageHistoryScanResults(ordered, q);
  return NextResponse.json(
    { ok: true, scans: page, totalFiltered, hasMore },
    { status: 200 }
  );
}
