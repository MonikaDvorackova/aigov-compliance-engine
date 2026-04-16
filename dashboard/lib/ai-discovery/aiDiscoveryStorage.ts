import type {
  AIDetection,
  DiscoveryGroupedSummary,
  DiscoveryNote,
} from "./apiTypes";

export const AI_DISCOVERY_LAST_RESULT_KEY = "aiDiscovery:lastResult";

type StoredScanV1 = {
  v: 1;
  savedAt: string;
  target: string;
  scanRoot: string;
  detections: AIDetection[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
};

function isStoredScanV1(x: unknown): x is StoredScanV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === 1 &&
    typeof o.savedAt === "string" &&
    typeof o.target === "string" &&
    typeof o.scanRoot === "string" &&
    Array.isArray(o.detections) &&
    o.groupedSummary !== null &&
    typeof o.groupedSummary === "object" &&
    Array.isArray(o.notes)
  );
}

export function loadLastDiscoveryResult(): StoredScanV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AI_DISCOVERY_LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredScanV1(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLastDiscoveryResult(input: {
  target: string;
  scanRoot: string;
  detections: AIDetection[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
}): string | null {
  if (typeof window === "undefined") return null;
  const savedAt = new Date().toISOString();
  try {
    const payload: StoredScanV1 = {
      v: 1,
      savedAt,
      target: input.target,
      scanRoot: input.scanRoot,
      detections: input.detections,
      groupedSummary: input.groupedSummary,
      notes: input.notes,
    };
    window.localStorage.setItem(
      AI_DISCOVERY_LAST_RESULT_KEY,
      JSON.stringify(payload)
    );
    return savedAt;
  } catch {
    // quota / private mode
    return null;
  }
}
