import fs from "node:fs";
import path from "node:path";

import type { AIDetection, DiscoveryGroupedSummary, DiscoveryNote } from "./apiTypes";
import type { DiscoveryCategoryCounts, DiscoveryScanChangeSummary } from "./scanChangeSummary";
import { ZERO_CATEGORY_COUNTS } from "./scanChangeSummary";
import {
  DEFAULT_DISCOVERY_SCAN_ALERT,
  EMPTY_DISCOVERY_SCAN_CONTEXT,
  type DiscoveryScanAlertDeliveryStatus,
  type DiscoveryScanAlertFields,
  type DiscoveryScanContextFields,
  type StoredDiscoveryScan,
} from "./scanHistoryTypes";
import {
  DEFAULT_DISCOVERY_SCAN_REVIEW,
  type DiscoveryScanDecision,
  type DiscoveryScanReviewFields,
  type DiscoveryScanReviewStatus,
  isValidReviewStatus,
} from "./scanReviewTypes";

import { getDiscoveryRepoRoot } from "./safeScanPath";

export type { StoredDiscoveryScan } from "./scanHistoryTypes";

type HistoryFileV1 = {
  version: 1;
  scans: StoredDiscoveryScan[];
};

const MAX_SCANS = 200;

function newScanId(): string {
  return `ads_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getScanHistoryFilePath(): string {
  const fromEnv = process.env.AI_DISCOVERY_HISTORY_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const root = getDiscoveryRepoRoot();
  return path.join(root, ".govai", "ai-discovery-history.json");
}

function normalizeOptionalString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function normalizeTriggerType(
  v: unknown
): DiscoveryScanContextFields["triggerType"] {
  if (v === "manual" || v === "scheduled") return v;
  return null;
}

function normalizeCategoryCountsObj(raw: unknown): DiscoveryCategoryCounts {
  if (!raw || typeof raw !== "object") return { ...ZERO_CATEGORY_COUNTS };
  const o = raw as Record<string, unknown>;
  const n = (k: keyof DiscoveryCategoryCounts): number => {
    const v = o[k];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  };
  return {
    openai: n("openai"),
    transformers: n("transformers"),
    modelArtifacts: n("modelArtifacts"),
    combinedFolders: n("combinedFolders"),
  };
}

function normalizeChangeSummary(raw: unknown): DiscoveryScanChangeSummary | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const addedCounts = normalizeCategoryCountsObj(o.addedCounts);
  const removedCounts = normalizeCategoryCountsObj(o.removedCounts);
  const hasChanges = o.hasChanges === true;
  return { hasChanges, addedCounts, removedCounts };
}

function normalizeAlertDeliveryStatus(v: unknown): DiscoveryScanAlertDeliveryStatus {
  if (v === "not_attempted" || v === "sent" || v === "failed") return v;
  return "not_attempted";
}

function normalizeStoredScan(raw: StoredDiscoveryScan): StoredDiscoveryScan {
  const r = raw as Record<string, unknown>;
  const statusRaw = r.reviewStatus;
  const reviewStatus: DiscoveryScanReviewStatus = isValidReviewStatus(statusRaw)
    ? statusRaw
    : DEFAULT_DISCOVERY_SCAN_REVIEW.reviewStatus;

  const decisionRaw = r.decision;
  let decision: DiscoveryScanDecision | null = null;
  if (decisionRaw === null || decisionRaw === undefined) {
    decision = null;
  } else if (
    decisionRaw === "informational" ||
    decisionRaw === "needs_follow_up" ||
    decisionRaw === "confirmed_local_model_signal"
  ) {
    decision = decisionRaw;
  }

  const reviewNote = typeof r.reviewNote === "string" ? r.reviewNote : null;

  const reviewedAt = typeof r.reviewedAt === "string" ? r.reviewedAt : null;

  const reviewedBy = typeof r.reviewedBy === "string" ? r.reviewedBy : null;

  return {
    ...raw,
    reviewStatus,
    reviewNote,
    reviewedAt,
    reviewedBy,
    decision,
    projectId: normalizeOptionalString(r.projectId),
    repoUrl: normalizeOptionalString(r.repoUrl),
    branch: normalizeOptionalString(r.branch),
    commitSha: normalizeOptionalString(r.commitSha),
    triggeredBy: normalizeOptionalString(r.triggeredBy),
    triggerType: normalizeTriggerType(r.triggerType),
    scheduledTargetId: normalizeOptionalString(r.scheduledTargetId),
    changeSummary: normalizeChangeSummary(r.changeSummary),
    alertAttemptedAt: normalizeOptionalString(r.alertAttemptedAt),
    alertDeliveredAt: normalizeOptionalString(r.alertDeliveredAt),
    alertDeliveryStatus: normalizeAlertDeliveryStatus(r.alertDeliveryStatus),
    alertDeliveryError: normalizeOptionalString(r.alertDeliveryError),
  };
}

function readHistoryRaw(): HistoryFileV1 {
  const fp = getScanHistoryFilePath();
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as HistoryFileV1).version !== 1 ||
      !Array.isArray((parsed as HistoryFileV1).scans)
    ) {
      return { version: 1, scans: [] };
    }
    return parsed as HistoryFileV1;
  } catch {
    return { version: 1, scans: [] };
  }
}

function writeHistory(data: HistoryFileV1): void {
  const fp = getScanHistoryFilePath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data), "utf8");
}

/**
 * Append a successful scan (newest first). Drops oldest beyond {@link MAX_SCANS}.
 */
export function appendSuccessfulScan(
  input: {
    scanRoot: string;
    detections: AIDetection[];
    groupedSummary: DiscoveryGroupedSummary;
    notes: DiscoveryNote[];
    changeSummary?: DiscoveryScanChangeSummary | null;
    scheduledTargetId?: string | null;
  } & Partial<DiscoveryScanContextFields>
): StoredDiscoveryScan {
  const contextFields: DiscoveryScanContextFields = {
    ...EMPTY_DISCOVERY_SCAN_CONTEXT,
    projectId: normalizeOptionalString(input.projectId),
    repoUrl: normalizeOptionalString(input.repoUrl),
    branch: normalizeOptionalString(input.branch),
    commitSha: normalizeOptionalString(input.commitSha),
    triggeredBy: normalizeOptionalString(input.triggeredBy),
    triggerType: normalizeTriggerType(input.triggerType),
  };
  const changeIn = input.changeSummary;
  const changeSummary: DiscoveryScanChangeSummary | null =
    changeIn === undefined ? null : changeIn === null ? null : normalizeChangeSummary(changeIn);
  const row: StoredDiscoveryScan = {
    id: newScanId(),
    createdAt: new Date().toISOString(),
    scanRoot: input.scanRoot,
    detections: input.detections,
    groupedSummary: input.groupedSummary,
    notes: input.notes,
    ...DEFAULT_DISCOVERY_SCAN_REVIEW,
    ...DEFAULT_DISCOVERY_SCAN_ALERT,
    ...contextFields,
    scheduledTargetId: normalizeOptionalString(input.scheduledTargetId),
    changeSummary,
  };
  const data = readHistoryRaw();
  data.scans.unshift(row);
  if (data.scans.length > MAX_SCANS) {
    data.scans.length = MAX_SCANS;
  }
  writeHistory(data);
  return row;
}

/** Newest first; each record is normalized for backward compatibility. */
export function listStoredScans(): StoredDiscoveryScan[] {
  return readHistoryRaw().scans.map((s) => normalizeStoredScan(s));
}

/**
 * Replaces review fields for a scan. Returns updated scan or undefined if not found.
 */
export function applyScanReviewFields(
  id: string,
  review: DiscoveryScanReviewFields
): StoredDiscoveryScan | undefined {
  const data = readHistoryRaw();
  const idx = data.scans.findIndex((s) => s.id === id);
  if (idx < 0) return undefined;

  const base = normalizeStoredScan(data.scans[idx]);
  const next: StoredDiscoveryScan = {
    ...base,
    ...review,
  };
  data.scans[idx] = next;
  writeHistory(data);
  return normalizeStoredScan(next);
}

/**
 * Updates Slack alert delivery fields for a scan (e.g. after async notification).
 */
export function updateScanAlertFields(
  id: string,
  patch: Partial<DiscoveryScanAlertFields>
): StoredDiscoveryScan | undefined {
  const data = readHistoryRaw();
  const idx = data.scans.findIndex((s) => s.id === id);
  if (idx < 0) return undefined;

  const base = normalizeStoredScan(data.scans[idx]);
  const next: StoredDiscoveryScan = {
    ...base,
    alertAttemptedAt:
      patch.alertAttemptedAt !== undefined
        ? normalizeOptionalString(patch.alertAttemptedAt)
        : base.alertAttemptedAt,
    alertDeliveredAt:
      patch.alertDeliveredAt !== undefined
        ? normalizeOptionalString(patch.alertDeliveredAt)
        : base.alertDeliveredAt,
    alertDeliveryStatus:
      patch.alertDeliveryStatus !== undefined
        ? normalizeAlertDeliveryStatus(patch.alertDeliveryStatus)
        : base.alertDeliveryStatus,
    alertDeliveryError:
      patch.alertDeliveryError !== undefined
        ? normalizeOptionalString(patch.alertDeliveryError)
        : base.alertDeliveryError,
  };
  data.scans[idx] = next;
  writeHistory(data);
  return normalizeStoredScan(next);
}
