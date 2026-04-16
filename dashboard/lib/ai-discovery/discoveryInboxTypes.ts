import type { DiscoveryScanCounts } from "./scanHistoryCounts";
import type { DiscoveryScanDecision, DiscoveryScanReviewStatus } from "./scanReviewTypes";
import type { DiscoveryTargetAlertDeliveryStatus } from "./discoveryTargetStatusTypes";

/** One actionable queue row derived from scan history (no extra persistence). */
export type DiscoveryInboxItem = {
  targetId: string;
  scanRoot: string;
  repoUrl: string | null;
  projectId: string | null;
  lastScanAt: string | null;
  reasonTags: string[];
  reviewStatus: DiscoveryScanReviewStatus;
  decision: DiscoveryScanDecision | null;
  alertStatus: DiscoveryTargetAlertDeliveryStatus | null;
  latestCounts: DiscoveryScanCounts;
  /** Raw value for `?target=` (history filter). */
  linkTarget: string;
  /** Newest scan for this target; used as URL fragment anchor. */
  latestScanId: string;
  /** Same semantics as target status (open change scan not reviewed). */
  hasOpenChanges: boolean;
};
