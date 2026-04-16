import type { ComplianceHeroDecision } from "./complianceHeroDecision";
import type { ComplianceSummaryModel } from "./summaryModel";

export type RunDetailDecisionInput = {
  runId: string;
  modeNorm: string;
  statusNorm: string;
  isValid: boolean;
  hasClosed: boolean;
  prodGateOk: boolean;
  hero: ComplianceHeroDecision;
  model: ComplianceSummaryModel;
  integrityLine: string;
};

export type GroupedStatusRow = { label: string; value: string };

/** Human-readable grouped status (replaces flat ci/valid/closed chips). */
export function buildGroupedStatusRows(input: RunDetailDecisionInput): GroupedStatusRow[] {
  const mode = input.modeNorm || "—";
  const modeDisplay = mode === "prod" ? "Production" : mode === "ci" ? "CI" : mode.length ? mode : "—";
  const runStatus = !input.statusNorm ? "unset" : input.statusNorm;
  const lifecycle = input.hasClosed ? "closed" : "open";
  const gate =
    input.modeNorm !== "prod" ? "not required" : input.prodGateOk ? "passed" : "blocked";
  const compliance =
    input.hero.status === "valid" ? "cleared" : input.hero.status === "invalid" ? "failed" : "blocked";

  return [
    { label: "Run status", value: runStatus },
    { label: "Mode", value: modeDisplay },
    { label: "Lifecycle", value: lifecycle },
    { label: "Gate", value: gate },
    { label: "Compliance", value: compliance },
  ];
}

/**
 * When ledger and gate look healthy but compliance review is not cleared,
 * explain the split so users do not assume a bug.
 */
export function buildSignalConflictNote(input: RunDetailDecisionInput): string | null {
  const complianceNotCleared = input.hero.status !== "valid";
  const ledgerAndGateOk = input.isValid && input.prodGateOk;

  if (ledgerAndGateOk && complianceNotCleared) {
    const summaryUnavailable =
      input.model.kind === "no_payload" || input.model.kind === "invalid" || input.model.kind === "audit_error";
    if (summaryUnavailable) {
      return "Run is valid and passed gates, but compliance summary is unavailable.";
    }
    return "Run is valid and passed gates, but compliance review is still blocked or incomplete.";
  }

  if (!input.isValid && complianceNotCleared) {
    return "Ledger validation did not pass; treat compliance signals as additional context, not a substitute for fixing validation.";
  }

  if (input.isValid && !input.prodGateOk && complianceNotCleared) {
    return "Production gate did not pass; compliance review is also not cleared.";
  }

  return null;
}

export type RunNextActionBlock = {
  title: string;
  why: string;
  nextStep: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** When false, render a quieter inline treatment (e.g. cleared runs). */
  prominent: boolean;
};

export function buildNextAction(input: RunDetailDecisionInput): RunNextActionBlock {
  const { hero, model, runId } = input;
  const selfHref = `/runs/${encodeURIComponent(runId)}`;

  if (hero.status === "valid") {
    return {
      title: "Next action",
      why: "This run meets evaluation, approval, and promotion gates for production readiness.",
      nextStep: "No compliance follow-up is required on this run.",
      primary: { label: "Back to runs", href: "/runs" },
      prominent: false,
    };
  }

  if (model.kind === "no_payload" && model.reason === "no_audit_url") {
    return {
      title: "Next action",
      why: "Compliance data never reached the dashboard — there is no audit URL on file for this run.",
      nextStep: "Connect the compliance service and ensure manifests publish a reachable summary endpoint, then open this run again.",
      primary: { label: "Connect service", href: "/evidence" },
      secondary: { label: "Back to runs", href: "/runs" },
      prominent: true,
    };
  }

  if (model.kind === "no_payload" && model.reason === "fetch_failed") {
    return {
      title: "Next action",
      why: hero.explanation,
      nextStep: "Retry after confirming network access and credentials, then reload this run.",
      primary: { label: "Retry audit", href: selfHref },
      secondary: { label: "Technical details", href: "#run-technical-details" },
      prominent: true,
    };
  }

  if (model.kind === "audit_error") {
    return {
      title: "Next action",
      why: hero.explanation,
      nextStep: "Inspect the audit response in technical details, fix the upstream service, and re-run the compliance job.",
      primary: { label: "Retry audit", href: selfHref },
      secondary: { label: "Technical details", href: "#run-technical-details" },
      prominent: true,
    };
  }

  if (model.kind === "invalid") {
    return {
      title: "Next action",
      why: hero.explanation,
      nextStep: "Download the audit manifest, confirm the payload matches the expected schema, then re-run ingestion.",
      primary: { label: "Retry audit", href: selfHref },
      secondary: { label: "Audit manifest", href: `/api/raw/audit/${encodeURIComponent(runId)}` },
      prominent: true,
    };
  }

  return {
    title: "Next action",
    why: hero.explanation,
    nextStep: `Address “${hero.headline}” in your approval or promotion workflow, then refresh this page.`,
    primary: { label: "Review readiness signals", href: "#run-compliance-summary" },
    secondary: { label: "Back to runs", href: "/runs" },
    prominent: true,
  };
}

export function buildRunChecklist(input: RunDetailDecisionInput): string[] {
  const { model, hero } = input;
  const out: string[] = [];

  if (model.kind === "no_payload" && model.reason === "no_audit_url") {
    out.push("Configure workspace compliance / audit URL settings.");
    out.push("Confirm CI publishes an audit manifest for this run id.");
    out.push("Reload this page after the service is reachable.");
    return out;
  }

  if (model.kind === "no_payload" && model.reason === "fetch_failed") {
    out.push("Verify outbound network and service credentials.");
    out.push("Check dashboard logs for fetch errors.");
    out.push(`Retry loading this run (${input.runId.slice(0, 8)}…).`);
    return out;
  }

  if (model.kind === "audit_error") {
    out.push("Read the error payload under Technical details.");
    out.push("Fix the compliance service response contract.");
    out.push("Re-run the audit job from your pipeline.");
    return out;
  }

  if (model.kind === "invalid") {
    out.push("Open the raw audit manifest and validate JSON against the expected schema.");
    out.push("Regenerate the summary from a known-good template.");
    return out;
  }

  out.push("Read Evaluation, Approval, and Promotion in the readiness signals above.");
  if (hero.headline) out.push(`Resolve: ${hero.headline}.`);
  out.push("Compare ledger timestamps with CI and approval tools.");
  out.push("Re-run or refresh once upstream state changes.");

  return out.slice(0, 5);
}

export type CompactStatusPanel = {
  stateLabel: string;
  reason: string;
  interpretation: string;
  variant: "valid" | "invalid" | "blocked";
};

export function buildCompactStatusPanel(
  hero: ComplianceHeroDecision,
  conflictNote: string | null,
  integrityLine: string,
): CompactStatusPanel {
  const stateLabel =
    hero.status === "valid" ? "Cleared" : hero.status === "invalid" ? "Failed" : "Blocked";
  return {
    stateLabel,
    reason: hero.headline,
    interpretation: conflictNote ?? integrityLine,
    variant: hero.status,
  };
}
