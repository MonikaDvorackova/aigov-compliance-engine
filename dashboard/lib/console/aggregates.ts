import type { RunRow } from "./runTypes";
import { activityTierFromLastSeen, hasTrimmed, norm } from "./runFormat";

export type PolicyAggregateRow = {
  policyVersion: string;
  runCount: number;
  /** Runs with mode prod (within aggregation window). */
  prodRunCount: number;
  lastActivityIso: string;
  /** Production signal: attention if any prod run is not valid; unknown if no prod runs; ok if prod runs exist and none need attention. */
  status: "attention" | "ok" | "unknown";
  /** Recency bucket for register layout: active/recent vs stale (~14d). */
  tier: "active" | "stale";
};

export function aggregatePoliciesFromRuns(runs: RunRow[]): PolicyAggregateRow[] {
  const map = new Map<string, { count: number; lastIso: string; attention: boolean; prodCount: number }>();

  for (const r of runs) {
    const key = hasTrimmed(r.policy_version) ? String(r.policy_version).trim() : "(unspecified)";
    const prev = map.get(key) ?? { count: 0, lastIso: "", attention: false, prodCount: 0 };
    prev.count += 1;
    const ca = r.created_at ?? "";
    if (!prev.lastIso || ca > prev.lastIso) prev.lastIso = ca;
    const mode = norm(r.mode);
    const status = norm(r.status);
    if (mode === "prod") {
      prev.prodCount += 1;
      if (status !== "valid") prev.attention = true;
    }
    map.set(key, prev);
  }

  return [...map.entries()]
    .map(([policyVersion, v]) => {
      let status: PolicyAggregateRow["status"];
      if (v.attention) status = "attention";
      else if (v.prodCount === 0) status = "unknown";
      else status = "ok";

      const act = activityTierFromLastSeen(v.lastIso);
      const tier: PolicyAggregateRow["tier"] = act === "stale" ? "stale" : "active";

      return {
        policyVersion,
        runCount: v.count,
        prodRunCount: v.prodCount,
        lastActivityIso: v.lastIso,
        status,
        tier,
      };
    })
    .sort((a, b) => b.lastActivityIso.localeCompare(a.lastActivityIso));
}

export type EvidenceIntegritySnapshot = {
  sampleSize: number;
  withBundle: number;
  withEvidenceJson: number;
  withReport: number;
  fullTriad: number;
  invalidStatus: number;
  prodNotValid: number;
  uniqueBundles: number;
};

export function buildEvidenceSnapshot(runs: RunRow[]): EvidenceIntegritySnapshot {
  const bundleKeys = new Set<string>();
  let withBundle = 0;
  let withEvidenceJson = 0;
  let withReport = 0;
  let fullTriad = 0;
  let invalidStatus = 0;
  let prodNotValid = 0;

  for (const r of runs) {
    const b = hasTrimmed(r.bundle_sha256);
    const e = hasTrimmed(r.evidence_sha256);
    const rep = hasTrimmed(r.report_sha256);
    if (b) {
      withBundle++;
      bundleKeys.add(String(r.bundle_sha256).trim());
    }
    if (e) withEvidenceJson++;
    if (rep) withReport++;
    if (b && e && rep) fullTriad++;

    const st = norm(r.status);
    if (st === "invalid") invalidStatus++;
    if (norm(r.mode) === "prod" && st !== "valid") prodNotValid++;
  }

  return {
    sampleSize: runs.length,
    withBundle,
    withEvidenceJson,
    withReport,
    fullTriad,
    invalidStatus,
    prodNotValid,
    uniqueBundles: bundleKeys.size,
  };
}
