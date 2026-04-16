import type { PolicyAggregateRow } from "@/lib/console/aggregates";

export type PolicyDiagnosticInput = {
  rows: PolicyAggregateRow[];
  runsSampleCount: number;
  activeCount: number;
  staleCount: number;
  attentionCount: number;
  unknownCount: number;
};

/** One-sentence system read for the top of Policies (not raw counts alone). */
export function systemInterpretation(i: PolicyDiagnosticInput): string {
  const { rows, runsSampleCount, activeCount, staleCount, attentionCount, unknownCount } = i;

  if (runsSampleCount === 0) {
    return "";
  }
  if (rows.length === 0) {
    return "No distinct policy_version values appeared in the sampled runs.";
  }

  if (attentionCount > 0) {
    return attentionCount === 1
      ? "One policy version has production runs that are not valid — that needs review before anything else."
      : `${attentionCount} policy versions have production runs that are not valid — address those before trusting overall health.`;
  }

  if (activeCount === 0 && staleCount > 0) {
    return "No active policies detected in the last ~14 days — every version in this sample only shows older activity.";
  }

  if (staleCount === rows.length) {
    return "All policies are stale in this window — last activity for each version is older than ~14 days.";
  }

  if (unknownCount === rows.length && rows.length > 0) {
    return "No production policies found in this sample — the ledger has no prod runs to score, so health is indeterminate.";
  }

  if (activeCount > 0 && attentionCount === 0) {
    return "Production policies look healthy in this sample — no invalid production runs tied to these versions.";
  }

  return "Policy versions mix recent and older activity — use per-row status to see prod signal and staleness.";
}

/** Short footer line: what to do next. */
export function nextStepLine(i: PolicyDiagnosticInput): string {
  const { rows, runsSampleCount, activeCount, staleCount, attentionCount, unknownCount } = i;

  if (runsSampleCount === 0) {
    return "";
  }
  if (rows.length === 0) {
    return "Ensure new runs set policy_version, then refresh.";
  }

  if (attentionCount > 0) {
    return "Open Runs for those versions and fix prod validation.";
  }

  if (unknownCount === rows.length) {
    return "No prod signal in sample — confirm prod traffic or widen the window.";
  }

  if (activeCount === 0 && staleCount > 0) {
    return "Stale-only sample — check schedules or retired versions.";
  }

  if (staleCount === rows.length) {
    return "All versions stale here — confirm scope or refresh ingestion.";
  }

  return "Use Runs for manifests; this view uses the latest 500 runs.";
}
