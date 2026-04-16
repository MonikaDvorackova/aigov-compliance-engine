import { Badge } from "@/app/_ui/console/primitives";
import type { ComplianceSummaryModel } from "@/lib/compliance/summaryModel";
import { approvalDisplay, evaluationDisplay, promotionDisplay } from "@/lib/compliance/complianceDisplay";

function evaluationBadge(ep: boolean | null): { kind: "ok" | "error" | "neutral"; label: string } {
  const d = evaluationDisplay(ep);
  const label = `Evaluation: ${d}`;
  if (d === "passed") return { kind: "ok", label };
  if (d === "failed") return { kind: "error", label };
  return { kind: "neutral", label };
}

function approvalBadge(human: string | null): { kind: "ok" | "issue" | "neutral"; label: string } {
  const d = approvalDisplay(human);
  const label = `Approval: ${d}`;
  if (d === "granted") return { kind: "ok", label };
  if (d === "blocked") return { kind: "issue", label };
  return { kind: "neutral", label };
}

function promotionBadge(state: string | null): { kind: "ok" | "issue" | "neutral"; label: string } {
  const d = promotionDisplay(state);
  const label =
    d === "dash" ? "Promotion: —" : d === "cleared" ? "Promotion: allowed" : `Promotion: ${d}`;
  if (d === "cleared") return { kind: "ok", label };
  if (d === "held") return { kind: "issue", label };
  return { kind: "neutral", label };
}

function primaryRiskLabel(id: string | null): string | null {
  const t = (id ?? "").trim();
  if (!t) return null;
  if (t.length <= 36) return t;
  return `${t.slice(0, 33)}…`;
}

function noPayloadMessage(model: ComplianceSummaryModel & { kind: "no_payload" }) {
  return model.reason === "no_audit_url"
    ? "Compliance data is not available for this run yet."
    : `Compliance data could not be loaded${model.detail ? ` (${model.detail})` : ""}.`;
}

/**
 * Compact gate signals: evaluation → approval → promotion (plus primary risk when set).
 * Same normalization as the run hero; labels are decision-oriented, not raw payload text.
 */
type ComplianceReviewPanelProps = {
  model: ComplianceSummaryModel;
  /** Optional hint id (e.g. rule order) for screen readers on the badge row. */
  "aria-describedby"?: string;
};

export function ComplianceReviewPanel({ model, "aria-describedby": ariaDescribedBy }: ComplianceReviewPanelProps) {
  const describedBy = ariaDescribedBy ? { "aria-describedby": ariaDescribedBy } : {};

  if (model.kind === "no_payload") {
    return (
      <div className="govai-compliance-summary govai-compliance-summary--error" {...describedBy}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--govai-text-tertiary)" }}>{noPayloadMessage(model)}</p>
      </div>
    );
  }

  if (model.kind === "invalid") {
    return (
      <div className="govai-compliance-summary govai-compliance-summary--error" {...describedBy}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--govai-text-secondary)" }}>
          This summary could not be read for display.
        </p>
      </div>
    );
  }

  if (model.kind === "audit_error") {
    return (
      <div className="govai-compliance-summary govai-compliance-summary--error" {...describedBy}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--govai-text-secondary)" }}>
          Compliance returned an error: {model.err.error}
        </p>
      </div>
    );
  }

  const cs = model.summary.current_state;
  const ev = evaluationBadge(cs.model.evaluation_passed);
  const ap = approvalBadge(cs.approval.human_approval_decision);
  const pr = promotionBadge(cs.model.promotion.state);
  const riskId = primaryRiskLabel(cs.identifiers.primary_risk_id);

  return (
    <div className="govai-compliance-summary" {...describedBy}>
      <div className="govai-compliance-summary__row">
        <Badge kind={ev.kind} style={{ padding: "4px 10px", fontSize: 12 }}>
          {ev.label}
        </Badge>
        <Badge kind={ap.kind} style={{ padding: "4px 10px", fontSize: 12 }}>
          {ap.label}
        </Badge>
        <Badge kind={pr.kind} style={{ padding: "4px 10px", fontSize: 12 }}>
          {pr.label}
        </Badge>
        {riskId ? (
          <span className="govai-compliance-summary__risk" title={(cs.identifiers.primary_risk_id ?? "").trim() || undefined}>
            <Badge kind="neutral" style={{ padding: "4px 10px", fontSize: 12 }}>
              Risk: {riskId}
            </Badge>
          </span>
        ) : null}
      </div>
    </div>
  );
}
