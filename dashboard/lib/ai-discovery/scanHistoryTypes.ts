import type { AIDetection, DiscoveryGroupedSummary, DiscoveryNote } from "./apiTypes";
import type { DiscoveryScanChangeSummary } from "./scanChangeSummary";
import type { DiscoveryScanReviewFields } from "./scanReviewTypes";

export type DiscoveryScanTriggerType = "manual" | "scheduled";

/** Optional repo / actor context for attributing a scan to a concrete state. */
export type DiscoveryScanContextFields = {
  projectId: string | null;
  repoUrl: string | null;
  branch: string | null;
  commitSha: string | null;
  triggeredBy: string | null;
  triggerType: DiscoveryScanTriggerType | null;
};

export const EMPTY_DISCOVERY_SCAN_CONTEXT: DiscoveryScanContextFields = {
  projectId: null,
  repoUrl: null,
  branch: null,
  commitSha: null,
  triggeredBy: null,
  triggerType: null,
};

export type { DiscoveryScanChangeSummary } from "./scanChangeSummary";

/** One persisted successful scan row (JSON store), including optional review metadata. */
export type StoredDiscoveryScan = {
  id: string;
  createdAt: string;
  scanRoot: string;
  detections: AIDetection[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
  /** Set for scheduled runs from config; used for prior-run matching. */
  scheduledTargetId: string | null;
  /** Populated for scheduled runs: diff vs prior for the same target. */
  changeSummary: DiscoveryScanChangeSummary | null;
} & DiscoveryScanReviewFields &
  DiscoveryScanContextFields;
