import type {
  AIDetection,
  DiscoveryGroupedSummary,
  DiscoveryNote,
} from "./apiTypes";
import type { DiscoveryScanReviewFields } from "./scanReviewTypes";

export type AiDiscoveryExportPayload = {
  scanRoot: string;
  detections: AIDetection[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
  /** When exporting a stored history row that has been reviewed */
  review?: DiscoveryScanReviewFields | null;
};

/**
 * Downloads the current discovery result as JSON (same shape as the API success body, plus `exportedAt`).
 * Client-only; no-op on server.
 */
export function downloadAiDiscoveryJson(payload: AiDiscoveryExportPayload): void {
  if (typeof document === "undefined") return;

  const exportedAt = new Date().toISOString();
  const body: Record<string, unknown> = {
    ok: true,
    scanRoot: payload.scanRoot,
    detections: payload.detections,
    groupedSummary: payload.groupedSummary,
    notes: payload.notes,
    exportedAt,
  };
  if (payload.review !== undefined && payload.review !== null) {
    body.review = payload.review;
  }

  const json = JSON.stringify(body, null, 2);
  const safeTs = exportedAt.replace(/[:.]/g, "-");
  const filename = `ai-discovery-${safeTs}.json`;

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
