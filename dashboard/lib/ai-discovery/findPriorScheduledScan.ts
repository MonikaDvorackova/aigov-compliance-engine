import type { StoredDiscoveryScan } from "./scanHistoryTypes";

/**
 * Newest-first history. Returns the most recent prior run to compare against:
 * 1) same `scheduledTargetId`, or
 * 2) same `scanRoot` with a non-scheduled trigger (manual / unknown legacy) as baseline —
 *    avoids using a different scheduled target that shares the same path.
 */
export function findPriorScanForScheduledTarget(
  scansNewestFirst: StoredDiscoveryScan[],
  targetId: string,
  scanRoot: string
): StoredDiscoveryScan | null {
  for (const s of scansNewestFirst) {
    if (s.scheduledTargetId === targetId) return s;
  }
  for (const s of scansNewestFirst) {
    if (s.scanRoot !== scanRoot) continue;
    if (s.triggerType === "scheduled") continue;
    return s;
  }
  return null;
}
