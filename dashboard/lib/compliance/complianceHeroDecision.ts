import type { ComplianceSummaryModel } from "./summaryModel";
import {
  approvalDisplay,
  evaluationDisplay,
  promotionDisplay,
} from "./complianceDisplay";

export type ComplianceHeroDecision = {
  status: "valid" | "invalid" | "blocked";
  headline: string;
  /** Single-line hero copy under VALID / INVALID / BLOCKED (scannable decision). */
  explanation: string;
};

/**
 * Answers “Can this model be promoted to production?” from the ledger-derived summary only
 * (`GET /compliance-summary` → `current_state`). Order: evaluation → approval → promotion.
 * Does not consult `runs.status`, `compliance_workflow`, or any other DB decision mirror.
 * Missing or invalid audit data never yields VALID.
 */
export function complianceHeroDecision(model: ComplianceSummaryModel): ComplianceHeroDecision {
  if (model.kind === "no_payload") {
    return {
      status: "blocked",
      headline: "Compliance unavailable",
      explanation:
        model.reason === "no_audit_url"
          ? "Compliance summary unavailable. Connect the audit service before deciding on promotion."
          : "Compliance summary could not be loaded. Do not promote until signals are complete.",
    };
  }

  if (model.kind === "invalid") {
    return {
      status: "blocked",
      headline: "Summary unreadable",
      explanation: "Compliance summary is unreadable. Do not promote until the payload can be normalized.",
    };
  }

  if (model.kind === "audit_error") {
    return {
      status: "blocked",
      headline: "Compliance error",
      explanation: "Compliance service returned an error. Do not promote until the audit succeeds.",
    };
  }

  const cs = model.summary.current_state;
  const ev = evaluationDisplay(cs.model.evaluation_passed);
  const ap = approvalDisplay(cs.approval.human_approval_decision);
  const pr = promotionDisplay(cs.model.promotion.state);

  if (ev === "failed") {
    return {
      status: "invalid",
      headline: "Evaluation failed",
      explanation: "Evaluation failed. Do not promote.",
    };
  }

  if (ev === "pending") {
    return {
      status: "blocked",
      headline: "Evaluation pending",
      explanation: "Evaluation is not complete or did not pass yet. Wait before promoting.",
    };
  }

  if (ap === "blocked") {
    return {
      status: "blocked",
      headline: "Approval blocked",
      explanation: "Approval is denied or blocked. Do not promote.",
    };
  }

  if (ap === "needed") {
    return {
      status: "blocked",
      headline: "Awaiting approval",
      explanation: "Approval required before promotion.",
    };
  }

  if (ap === "review") {
    return {
      status: "blocked",
      headline: "Approval open",
      explanation: "Approval is incomplete or unclear. Resolve it before promotion.",
    };
  }

  if (pr === "held") {
    return {
      status: "blocked",
      headline: "Promotion held",
      explanation: "Promotion is on hold or denied. Do not promote until cleared.",
    };
  }

  if (pr === "review") {
    return {
      status: "blocked",
      headline: "Promotion open",
      explanation: "Promotion decision is still open. Clarify it before promoting.",
    };
  }

  if (pr === "dash") {
    return {
      status: "blocked",
      headline: "Promotion unset",
      explanation: "Promotion state is unset. Confirm readiness before promoting.",
    };
  }

  return {
    status: "valid",
    headline: "Review cleared",
    explanation: "All requirements met. Promotion is allowed.",
  };
}
