import type { RunRow } from "./runTypes";
import { hasTrimmed } from "./runFormat";

export type ArtifactCoverage = {
  bundle: boolean;
  evidence: boolean;
  report: boolean;
  /** 0–3 */
  presentCount: number;
  tier: "complete" | "partial" | "none";
};

export function runArtifactCoverage(r: RunRow): ArtifactCoverage {
  const bundle = hasTrimmed(r.bundle_sha256);
  const evidence = hasTrimmed(r.evidence_sha256);
  const report = hasTrimmed(r.report_sha256);
  const presentCount = [bundle, evidence, report].filter(Boolean).length;
  const tier: ArtifactCoverage["tier"] =
    presentCount === 3 ? "complete" : presentCount === 0 ? "none" : "partial";
  return { bundle, evidence, report, presentCount, tier };
}
