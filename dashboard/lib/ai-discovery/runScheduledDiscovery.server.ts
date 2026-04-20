import { relative } from "node:path";

import { compareDiscoveryRuns } from "./compareDiscoveryRuns";
import { findPriorScanForScheduledTarget } from "./findPriorScheduledScan";
import { gatherScanContextFromEnvironment } from "./scanContextMetadata.server";
import { loadRunDiscovery } from "./loadEngine";
import { appendSuccessfulScan, listStoredScans } from "./scanHistoryPersistence.server";
import { loadScheduledScanConfig } from "./scheduledScanConfig.server";
import { buildChangeSummaryFromDiff, ZERO_CATEGORY_COUNTS } from "./scanChangeSummary";
import { getDiscoveryRepoRoot, safeResolveScanPath } from "./safeScanPath";

export type ScheduledDiscoveryRunResult = {
  targetId: string;
  scanRoot: string;
  ok: boolean;
  error?: string;
  scanId?: string;
};

/**
 * Runs discovery for each enabled schedule target, persists like manual scans with
 * `triggerType: "scheduled"`, and attaches `changeSummary` vs the prior run for that target.
 */
export async function runScheduledDiscoveryForAllEnabledTargets(): Promise<{
  results: ScheduledDiscoveryRunResult[];
}> {
  const config = loadScheduledScanConfig();
  const runDiscovery = await loadRunDiscovery();
  const repoRoot = getDiscoveryRepoRoot();
  const envCtx = gatherScanContextFromEnvironment();
  let scansNewestFirst = listStoredScans();
  const results: ScheduledDiscoveryRunResult[] = [];

  for (const target of config.targets) {
    if (!target.enabled) continue;

    const resolved = safeResolveScanPath(repoRoot, target.scanRoot);
    if (!resolved.ok) {
      results.push({
        targetId: target.id,
        scanRoot: target.scanRoot,
        ok: false,
        error: resolved.error,
      });
      continue;
    }

    try {
      const result = runDiscovery(resolved.absolutePath);
      const scanRootDisplay = relative(repoRoot, resolved.absolutePath) || ".";

      const prior = findPriorScanForScheduledTarget(
        scansNewestFirst,
        target.id,
        scanRootDisplay
      );

      const changeSummary = prior
        ? buildChangeSummaryFromDiff(
            compareDiscoveryRuns(
              {
                groupedSummary: prior.groupedSummary,
                notes: prior.notes,
              },
              {
                groupedSummary: result.groupedSummary,
                notes: result.notes,
              }
            )
          )
        : {
            hasChanges: false,
            addedCounts: { ...ZERO_CATEGORY_COUNTS },
            removedCounts: { ...ZERO_CATEGORY_COUNTS },
          };

      const projectId =
        target.projectId != null && target.projectId !== ""
          ? target.projectId.trim()
          : envCtx.projectId;
      const repoUrl =
        target.repoUrl != null && target.repoUrl !== ""
          ? target.repoUrl.trim()
          : envCtx.repoUrl;

      const row = appendSuccessfulScan({
        scanRoot: scanRootDisplay,
        detections: result.detections,
        groupedSummary: result.groupedSummary,
        notes: result.notes,
        projectId,
        repoUrl,
        branch: envCtx.branch,
        commitSha: envCtx.commitSha,
        triggeredBy: null,
        triggerType: "scheduled",
        scheduledTargetId: target.id,
        changeSummary,
      });

      scansNewestFirst = [row, ...scansNewestFirst];

      results.push({
        targetId: target.id,
        scanRoot: scanRootDisplay,
        ok: true,
        scanId: row.id,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Scan failed.";
      results.push({
        targetId: target.id,
        scanRoot: target.scanRoot,
        ok: false,
        error: message,
      });
    }
  }

  return { results };
}
