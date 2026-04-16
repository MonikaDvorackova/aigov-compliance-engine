export type DiscoveryScanReviewStatus = "unreviewed" | "reviewed" | "needs_follow_up";

export type DiscoveryScanDecision =
  | "informational"
  | "needs_follow_up"
  | "confirmed_local_model_signal";

export type DiscoveryScanReviewFields = {
  reviewStatus: DiscoveryScanReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  decision: DiscoveryScanDecision | null;
};

export const DEFAULT_DISCOVERY_SCAN_REVIEW: DiscoveryScanReviewFields = {
  reviewStatus: "unreviewed",
  reviewNote: null,
  reviewedAt: null,
  reviewedBy: null,
  decision: null,
};

export function isValidReviewStatus(x: unknown): x is DiscoveryScanReviewStatus {
  return x === "unreviewed" || x === "reviewed" || x === "needs_follow_up";
}
