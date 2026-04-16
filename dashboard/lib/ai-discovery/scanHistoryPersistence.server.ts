import fs from "node:fs";
import path from "node:path";

import type { AIDetection, DiscoveryGroupedSummary, DiscoveryNote } from "./apiTypes";

import { getDiscoveryRepoRoot } from "./safeScanPath";

export type StoredDiscoveryScan = {
  id: string;
  createdAt: string;
  scanRoot: string;
  detections: AIDetection[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
};

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

function readHistory(): HistoryFileV1 {
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
export function appendSuccessfulScan(input: {
  scanRoot: string;
  detections: AIDetection[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
}): StoredDiscoveryScan {
  const row: StoredDiscoveryScan = {
    id: newScanId(),
    createdAt: new Date().toISOString(),
    scanRoot: input.scanRoot,
    detections: input.detections,
    groupedSummary: input.groupedSummary,
    notes: input.notes,
  };
  const data = readHistory();
  data.scans.unshift(row);
  if (data.scans.length > MAX_SCANS) {
    data.scans.length = MAX_SCANS;
  }
  writeHistory(data);
  return row;
}

/** Newest first (same order as on disk). */
export function listStoredScans(): StoredDiscoveryScan[] {
  return readHistory().scans;
}
