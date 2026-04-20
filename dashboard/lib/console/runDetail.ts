export type DominantRunLabel = "VALID" | "INVALID" | "BLOCKED";

export function deriveDominantRunStatus(status: string | null): {
  label: DominantRunLabel;
  explanation: string;
  variant: "valid" | "invalid" | "blocked";
} {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "valid") {
    return {
      label: "VALID",
      explanation:
        "Recorded validation status is valid; downstream compliance signals apply to this run as stored.",
      variant: "valid",
    };
  }
  if (s === "invalid") {
    return {
      label: "INVALID",
      explanation:
        "Validation did not pass; do not treat this run as release-ready until findings are resolved.",
      variant: "invalid",
    };
  }
  if (!s) {
    return {
      label: "BLOCKED",
      explanation: "No validation status is recorded; the run cannot be classified as passing.",
      variant: "blocked",
    };
  }
  return {
    label: "BLOCKED",
    explanation: `Status “${String(status).trim()}” is not treated as passing validation for this ledger row.`,
    variant: "blocked",
  };
}

export function deriveIntegritySummary(
  r: {
    bundle_sha256: string | null;
    evidence_sha256: string | null;
    report_sha256: string | null;
  },
  statusNorm: string,
): string {
  const hasB = Boolean(r.bundle_sha256 && r.bundle_sha256.trim().length > 0);
  const hasE = Boolean(r.evidence_sha256 && r.evidence_sha256.trim().length > 0);
  const hasR = Boolean(r.report_sha256 && r.report_sha256.trim().length > 0);

  if (!hasB && !hasE && !hasR) {
    return "No artifact hashes on record";
  }
  if (!hasB) {
    return "Missing bundle hash";
  }
  if (!hasE) {
    return "Missing evidence hash";
  }
  if (!hasR) {
    return "Missing report hash";
  }
  if (statusNorm === "invalid") {
    return "Bundle integrity failed";
  }
  return "All required artifacts present";
}
