import type { StoredDiscoveryScan } from "./scanHistoryTypes";

/**
 * Stable key for grouping history into logical targets.
 * Scheduled runs use `scheduledTargetId`; manual runs use `root:<scanRoot>`.
 */
export function discoveryTargetKey(
  scan: Pick<StoredDiscoveryScan, "scheduledTargetId" | "scanRoot">
): string {
  const id = scan.scheduledTargetId?.trim();
  if (id) return id;
  return `root:${scan.scanRoot}`;
}
