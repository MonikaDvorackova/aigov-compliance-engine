import type { StoredDiscoveryScan } from "./scanHistoryTypes";

/** Loads one scan by id (avoids relying on the paginated history list). */
export async function fetchDiscoveryScanById(
  scanId: string
): Promise<StoredDiscoveryScan | null> {
  const res = await fetch(`/api/ai-discovery/history/${encodeURIComponent(scanId)}`, {
    credentials: "same-origin",
  });
  const json = (await res.json()) as { ok?: boolean; scan?: StoredDiscoveryScan };
  if (!res.ok || !json.ok || !json.scan) return null;
  return json.scan;
}

export async function patchDiscoveryScanReviewStatus(
  scanId: string,
  reviewStatus: "reviewed" | "needs_follow_up"
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`/api/ai-discovery/history/${encodeURIComponent(scanId)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewStatus }),
  });
  const json = (await res.json()) as { ok?: boolean; message?: string };
  if (!res.ok || !json.ok) {
    return { ok: false, message: json.message ?? "Could not update review." };
  }
  return { ok: true };
}
