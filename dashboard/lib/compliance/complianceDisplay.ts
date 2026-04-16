/**
 * Shared compliance surface labels — keep hero, badges, and rules aligned.
 *
 * Approval and promotion strings are classified by explicit token lists (whole
 * words after lowercasing), not ad-hoc substring scans.
 */

export type EvaluationDisplay = "passed" | "failed" | "pending";

export function evaluationDisplay(evaluation_passed: boolean | null): EvaluationDisplay {
  if (evaluation_passed === true) return "passed";
  if (evaluation_passed === false) return "failed";
  return "pending";
}

/** Normalized approval gate for UI (badges, hero). */
export type ApprovalDisplay = "granted" | "blocked" | "needed" | "review";

/** Normalized promotion gate for UI (badges, hero). */
export type PromotionDisplay = "cleared" | "held" | "review" | "dash";

function tokenizeHumanLabel(raw: string | null): string[] {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return [];
  return t.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Whole-word tokens → granted (any match wins after blocked/review passes). */
const APPROVAL_GRANTED_TOKENS = new Set([
  "approve",
  "approved",
  "granted",
]);

/** Whole-word tokens → blocked (highest precedence among non-empty). */
const APPROVAL_BLOCKED_TOKENS = new Set([
  "reject",
  "rejected",
  "withhold",
  "withheld",
  "block",
  "blocked",
  "deny",
  "denied",
  "revoke",
  "revoked",
]);

/** Whole-word tokens → review (between blocked and granted). */
const APPROVAL_REVIEW_TOKENS = new Set(["pending", "review", "open", "unclear"]);

export function approvalDisplay(human_approval_decision: string | null): ApprovalDisplay {
  const tokens = tokenizeHumanLabel(human_approval_decision);
  if (tokens.length === 0) return "needed";
  if (tokens.some((w) => APPROVAL_BLOCKED_TOKENS.has(w))) return "blocked";
  if (tokens.some((w) => APPROVAL_REVIEW_TOKENS.has(w))) return "review";
  if (tokens.some((w) => APPROVAL_GRANTED_TOKENS.has(w))) return "granted";
  return "review";
}

const PROMOTION_CLEARED_TOKENS = new Set(["allow", "allowed", "cleared"]);

const PROMOTION_HELD_TOKENS = new Set([
  "hold",
  "held",
  "block",
  "blocked",
  "deny",
  "denied",
]);

const PROMOTION_REVIEW_TOKENS = new Set(["review", "pending", "open"]);

export function promotionDisplay(promotion_state: string | null): PromotionDisplay {
  const tokens = tokenizeHumanLabel(promotion_state);
  if (tokens.length === 0) return "dash";
  if (tokens.some((w) => PROMOTION_HELD_TOKENS.has(w))) return "held";
  if (tokens.some((w) => PROMOTION_REVIEW_TOKENS.has(w))) return "review";
  if (tokens.some((w) => PROMOTION_CLEARED_TOKENS.has(w))) return "cleared";
  return "review";
}
