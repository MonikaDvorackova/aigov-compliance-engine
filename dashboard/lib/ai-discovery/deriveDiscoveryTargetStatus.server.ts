import { discoveryTargetKey } from "./discoveryTargetKey";
import type {
  DiscoveryTargetAlertDeliveryStatus,
  DiscoveryTargetCurrentStatus,
} from "./discoveryTargetStatusTypes";
import { countsFromDiscoveryResult } from "./scanHistoryCounts";
import type { StoredDiscoveryScan } from "./scanHistoryTypes";

function compareCreatedAtDesc(a: StoredDiscoveryScan, b: StoredDiscoveryScan): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * Reads optional Slack alert fields if present on persisted JSON (backward compatible).
 */
function pickAlertDeliveryStatus(scan: StoredDiscoveryScan): DiscoveryTargetAlertDeliveryStatus | null {
  const raw = (scan as Record<string, unknown>).alertDeliveryStatus;
  if (raw === "sent" || raw === "failed" || raw === "not_attempted") return raw;
  return null;
}

/**
 * `hasOpenChanges`: true when the most recent scan that reported `changeSummary.hasChanges`
 * is not reviewed with status `reviewed`. Easy to adjust later.
 */
function computeHasOpenChanges(latestScanWithChanges: StoredDiscoveryScan | null): boolean {
  if (!latestScanWithChanges) return false;
  return latestScanWithChanges.reviewStatus !== "reviewed";
}

/**
 * Builds one row per distinct target that appears in history (at least one scan).
 * Targets are newest-first by `lastScanAt`.
 */
export function deriveDiscoveryTargetStatuses(
  scans: StoredDiscoveryScan[]
): DiscoveryTargetCurrentStatus[] {
  const buckets = new Map<string, StoredDiscoveryScan[]>();
  for (const s of scans) {
    const k = discoveryTargetKey(s);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(s);
  }

  const out: DiscoveryTargetCurrentStatus[] = [];

  for (const [targetId, arr] of buckets) {
    const sorted = [...arr].sort(compareCreatedAtDesc);
    const latest = sorted[0];
    const withChanges = sorted.filter((x) => x.changeSummary?.hasChanges === true);
    withChanges.sort(compareCreatedAtDesc);
    const latestChange = withChanges[0] ?? null;

    out.push({
      targetId,
      scanRoot: latest.scanRoot,
      repoUrl: latest.repoUrl,
      projectId: latest.projectId,
      lastScanAt: latest.createdAt,
      lastScanTriggerType: latest.triggerType,
      lastScanReviewStatus: latest.reviewStatus,
      lastScanDecision: latest.decision,
      lastAlertDeliveryStatus: pickAlertDeliveryStatus(latest),
      lastChangeAt: latestChange?.createdAt ?? null,
      hasOpenChanges: computeHasOpenChanges(latestChange),
      latestCounts: countsFromDiscoveryResult(latest.groupedSummary, latest.notes),
      latestScanId: latest.id,
    });
  }

  out.sort((a, b) => {
    const ta = a.lastScanAt ? new Date(a.lastScanAt).getTime() : 0;
    const tb = b.lastScanAt ? new Date(b.lastScanAt).getTime() : 0;
    return tb - ta;
  });

  return out;
}
