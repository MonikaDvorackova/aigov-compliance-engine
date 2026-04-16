import type { DiscoveryScanCounts } from "./scanHistoryCounts";
import type { DiscoveryScanDecision, DiscoveryScanReviewStatus } from "./scanReviewTypes";
import type { DiscoveryScanTriggerType } from "./scanHistoryTypes";

export type DiscoveryTargetAlertDeliveryStatus = "not_attempted" | "sent" | "failed";

/** Derived operational snapshot per target from stored scan history (no new persistence). */
export type DiscoveryTargetCurrentStatus = {
  targetId: string;
  scanRoot: string;
  repoUrl: string | null;
  projectId: string | null;
  lastScanAt: string | null;
  lastScanTriggerType: DiscoveryScanTriggerType | null;
  lastScanReviewStatus: DiscoveryScanReviewStatus;
  lastScanDecision: DiscoveryScanDecision | null;
  lastAlertDeliveryStatus: DiscoveryTargetAlertDeliveryStatus | null;
  lastChangeAt: string | null;
  hasOpenChanges: boolean;
  latestCounts: DiscoveryScanCounts;
  /** Newest stored scan for this target (for inline review actions). */
  latestScanId: string;
};
