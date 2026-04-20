import { NextResponse } from "next/server";

import {
  filterAndSortInboxItems,
  parseInboxQuery,
} from "@/lib/ai-discovery/aiDiscoveryListQuery.server";
import { requireAiDiscoverySession } from "@/lib/ai-discovery/aiDiscoveryRouteAuth.server";
import { deriveDiscoveryInboxFromScans } from "@/lib/ai-discovery/deriveDiscoveryInbox.server";
import { listStoredScans } from "@/lib/ai-discovery/scanHistoryPersistence.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAiDiscoverySession();
  if (!auth.ok) return auth.response;

  const scans = listStoredScans();
  const derived = deriveDiscoveryInboxFromScans(scans);
  const url = new URL(request.url);
  const q = parseInboxQuery(url.searchParams);
  const items = filterAndSortInboxItems(derived, q);
  return NextResponse.json({ ok: true, items }, { status: 200 });
}
