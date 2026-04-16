import { deriveDiscoveryTargetStatuses } from "./deriveDiscoveryTargetStatus.server";
import { discoveryTargetKey } from "./discoveryTargetKey";
import type { DiscoveryInboxItem } from "./discoveryInboxTypes";
import type { DiscoveryTargetCurrentStatus } from "./discoveryTargetStatusTypes";
import type { StoredDiscoveryScan } from "./scanHistoryTypes";

function compareCreatedAtDesc(a: StoredDiscoveryScan, b: StoredDiscoveryScan): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * Whether this target should appear in the action-required inbox.
 * Keep conditions explicit so product can evolve independently of tags.
 */
export function isDiscoveryTargetActionable(t: DiscoveryTargetCurrentStatus): boolean {
  return (
    t.hasOpenChanges ||
    t.lastScanReviewStatus === "unreviewed" ||
    t.lastScanReviewStatus === "needs_follow_up" ||
    t.lastAlertDeliveryStatus === "failed"
  );
}

export function buildDiscoveryInboxReasonTags(t: DiscoveryTargetCurrentStatus): string[] {
  const tags: string[] = [];
  if (t.hasOpenChanges) tags.push("Open changes");
  if (t.lastScanReviewStatus === "unreviewed") tags.push("Unreviewed");
  if (t.lastScanReviewStatus === "needs_follow_up") tags.push("Needs follow up");
  if (t.lastAlertDeliveryStatus === "failed") tags.push("Alert failed");
  return tags;
}

function latestScanIdByTarget(scans: StoredDiscoveryScan[]): Map<string, string> {
  const buckets = new Map<string, StoredDiscoveryScan[]>();
  for (const s of scans) {
    const k = discoveryTargetKey(s);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(s);
  }
  const out = new Map<string, string>();
  for (const [k, arr] of buckets) {
    const sorted = [...arr].sort(compareCreatedAtDesc);
    out.set(k, sorted[0].id);
  }
  return out;
}

function toInboxItem(
  t: DiscoveryTargetCurrentStatus,
  latestScanId: string
): DiscoveryInboxItem {
  return {
    targetId: t.targetId,
    scanRoot: t.scanRoot,
    repoUrl: t.repoUrl,
    projectId: t.projectId,
    lastScanAt: t.lastScanAt,
    reasonTags: buildDiscoveryInboxReasonTags(t),
    reviewStatus: t.lastScanReviewStatus,
    decision: t.lastScanDecision,
    alertStatus: t.lastAlertDeliveryStatus,
    latestCounts: t.latestCounts,
    linkTarget: t.targetId,
    latestScanId,
    hasOpenChanges: t.hasOpenChanges,
  };
}

/**
 * Derives inbox rows from raw history: same grouping as target status, then filters to actionable targets.
 */
export function deriveDiscoveryInboxFromScans(scans: StoredDiscoveryScan[]): DiscoveryInboxItem[] {
  const targets = deriveDiscoveryTargetStatuses(scans);
  const idByTarget = latestScanIdByTarget(scans);
  const items: DiscoveryInboxItem[] = [];
  for (const t of targets) {
    if (!isDiscoveryTargetActionable(t)) continue;
    const scanId = idByTarget.get(t.targetId);
    if (!scanId) continue;
    items.push(toInboxItem(t, scanId));
  }
  items.sort((a, b) => {
    const ta = a.lastScanAt ? new Date(a.lastScanAt).getTime() : 0;
    const tb = b.lastScanAt ? new Date(b.lastScanAt).getTime() : 0;
    return tb - ta;
  });
  return items;
}
