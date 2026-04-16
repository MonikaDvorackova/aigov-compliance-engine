import { relative } from "node:path";

import { compareDiscoveryRuns } from "./compareDiscoveryRuns";
import { findPriorScanForScheduledTarget } from "./findPriorScheduledScan";
import { gatherScanContextFromEnvironment } from "./scanContextMetadata.server";
import { loadRunDiscovery } from "./loadEngine";
import {
  appendSuccessfulScan,
  listStoredScans,
  updateScanAlertFields,
} from "./scanHistoryPersistence.server";
import { sendAiDiscoveryChangeAlertToSlack } from "./slackChangeAlert.server";
import { loadScheduledScanConfig } from "./scheduledScanConfig.server";
import { buildChangeSummaryFromDiff, ZERO_CATEGORY_COUNTS } from "./scanChangeSummary";
import { getDiscoveryRepoRoot, safeResolveScanPath } from "./safeScanPath";
import type { StoredDiscoveryScan } from "./scanHistoryTypes";

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

      await maybeDeliverScheduledChangeAlert(row);

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

async function maybeDeliverScheduledChangeAlert(row: StoredDiscoveryScan): Promise<void> {
  if (row.triggerType !== "scheduled") return;
  if (!row.changeSummary || row.changeSummary.hasChanges !== true) return;

  const webhook = process.env.AI_DISCOVERY_SLACK_WEBHOOK_URL?.trim();
  if (!webhook) return;

  const attemptedAt = new Date().toISOString();
  try {
    const out = await sendAiDiscoveryChangeAlertToSlack(webhook, row);
    if (!out.ok) {
      const errMsg = out.errorText?.trim() || `HTTP ${out.status}`;
      updateScanAlertFields(row.id, {
        alertAttemptedAt: attemptedAt,
        alertDeliveredAt: null,
        alertDeliveryStatus: "failed",
        alertDeliveryError: errMsg,
      });
      console.error("[ai-discovery] Slack change alert failed:", errMsg);
      return;
    }
    updateScanAlertFields(row.id, {
      alertAttemptedAt: attemptedAt,
      alertDeliveredAt: new Date().toISOString(),
      alertDeliveryStatus: "sent",
      alertDeliveryError: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ai-discovery] Slack change alert error:", e);
    updateScanAlertFields(row.id, {
      alertAttemptedAt: attemptedAt,
      alertDeliveredAt: null,
      alertDeliveryStatus: "failed",
      alertDeliveryError: msg,
    });
  }
}
