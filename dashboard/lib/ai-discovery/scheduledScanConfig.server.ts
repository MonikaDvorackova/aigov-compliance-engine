import fs from "node:fs";
import path from "node:path";

import { getDiscoveryRepoRoot } from "./safeScanPath";

export type ScheduledScanTarget = {
  /** Stable id for matching prior runs and change detection. */
  id: string;
  enabled: boolean;
  /** Path relative to AI_DISCOVERY_ROOT / repo root; `"."` for whole tree. */
  scanRoot: string;
  projectId?: string | null;
  repoUrl?: string | null;
  /** Human-readable schedule hint (e.g. "daily 07:00 UTC"); platform cron is separate. */
  scheduleLabel?: string | null;
  /** Optional free-form note (e.g. cron expression reference). */
  scheduleNote?: string | null;
};

export type ScheduledScanConfigFile = {
  version: 1;
  targets: ScheduledScanTarget[];
};

export function getScheduledScanConfigPath(): string {
  const fromEnv = process.env.AI_DISCOVERY_SCHEDULE_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const root = getDiscoveryRepoRoot();
  return path.join(root, ".govai", "ai-discovery-schedule.json");
}

function normalizeTarget(raw: unknown): ScheduledScanTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  const scanRoot = typeof r.scanRoot === "string" ? r.scanRoot.trim() : "";
  if (!id || !scanRoot) return null;
  const enabled = r.enabled === true;
  const projectId =
    typeof r.projectId === "string" && r.projectId.trim() ? r.projectId.trim() : null;
  const repoUrl =
    typeof r.repoUrl === "string" && r.repoUrl.trim() ? r.repoUrl.trim() : null;
  const scheduleLabel =
    typeof r.scheduleLabel === "string" && r.scheduleLabel.trim()
      ? r.scheduleLabel.trim()
      : null;
  const scheduleNote =
    typeof r.scheduleNote === "string" && r.scheduleNote.trim()
      ? r.scheduleNote.trim()
      : null;
  return { id, enabled, scanRoot, projectId, repoUrl, scheduleLabel, scheduleNote };
}

/**
 * Reads `.govai/ai-discovery-schedule.json` (or `AI_DISCOVERY_SCHEDULE_PATH`).
 * Missing or invalid file → empty targets.
 */
export function loadScheduledScanConfig(): ScheduledScanConfigFile {
  const fp = getScheduledScanConfigPath();
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, targets: [] };
    }
    const p = parsed as Record<string, unknown>;
    if (p.version !== 1 || !Array.isArray(p.targets)) {
      return { version: 1, targets: [] };
    }
    const targets: ScheduledScanTarget[] = [];
    for (const t of p.targets) {
      const n = normalizeTarget(t);
      if (n) targets.push(n);
    }
    return { version: 1, targets };
  } catch {
    return { version: 1, targets: [] };
  }
}
