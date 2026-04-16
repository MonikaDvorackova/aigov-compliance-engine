"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

import { patchDiscoveryScanReviewStatus } from "@/lib/ai-discovery/discoveryReviewInline.client";
import type { DiscoveryTargetCurrentStatus } from "@/lib/ai-discovery/discoveryTargetStatusTypes";

function panelStyle(): CSSProperties {
  return {
    marginTop: 24,
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--govai-border-faint)",
    background: "rgba(255,255,255,0.02)",
  };
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function reviewLabel(s: DiscoveryTargetCurrentStatus["lastScanReviewStatus"]): string {
  switch (s) {
    case "unreviewed":
      return "Unreviewed";
    case "reviewed":
      return "Reviewed";
    case "needs_follow_up":
      return "Needs follow-up";
    default:
      return s;
  }
}

function triggerLabel(t: DiscoveryTargetCurrentStatus["lastScanTriggerType"]): string {
  if (t === "manual") return "Manual";
  if (t === "scheduled") return "Scheduled";
  return "—";
}

function alertLabel(a: DiscoveryTargetCurrentStatus["lastAlertDeliveryStatus"]): string {
  if (a === "sent") return "Sent";
  if (a === "failed") return "Failed";
  if (a === "not_attempted") return "—";
  return "—";
}

const inlineBtn: CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--govai-border-faint)",
  background: "rgba(255,255,255,0.06)",
  color: "var(--govai-text-secondary)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

type Props = {
  refreshTrigger: number;
  /** Serialized query string for `/api/ai-discovery/target-status` (no leading `?`). */
  listQuery: string;
  filtersActive: boolean;
  onOpenReviewByScanId: (scanId: string) => void | Promise<void>;
  onReviewsMutated: () => void;
};

export function AiDiscoveryTargetStatusSection({
  refreshTrigger,
  listQuery,
  filtersActive,
  onOpenReviewByScanId,
  onReviewsMutated,
}: Props) {
  const [targets, setTargets] = useState<DiscoveryTargetCurrentStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingScanId, setActingScanId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const path =
        listQuery.length > 0
          ? `/api/ai-discovery/target-status?${listQuery}`
          : "/api/ai-discovery/target-status";
      const res = await fetch(path, { credentials: "same-origin" });
      const json = (await res.json()) as { ok?: boolean; targets?: DiscoveryTargetCurrentStatus[] };
      if (!res.ok || !json.ok || !Array.isArray(json.targets)) {
        setError("Could not load target status.");
        setTargets([]);
        return;
      }
      setTargets(json.targets);
    } catch {
      setError("Could not load target status.");
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, [listQuery]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const applyInlineStatus = useCallback(
    async (scanId: string, status: "reviewed" | "needs_follow_up") => {
      setActingScanId(scanId);
      try {
        const r = await patchDiscoveryScanReviewStatus(scanId, status);
        if (r.ok) onReviewsMutated();
      } finally {
        setActingScanId(null);
      }
    },
    [onReviewsMutated]
  );

  return (
    <div style={panelStyle()}>
      <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Current target status</h2>
      <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
        Latest known state per target, including changes detected, review, and alerts.
      </p>

      {loading ? (
        <p style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>Loading status…</p>
      ) : null}
      {error ? <p style={{ fontSize: 12.5, color: "var(--govai-state-danger)" }}>{error}</p> : null}

      {!loading && !error && targets.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>
          {filtersActive
            ? "No results match the current filters."
            : "No saved scans yet. Run a discovery scan to see per-target status."}
        </p>
      ) : null}

      {!loading && targets.length > 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          {targets.map((t) => {
            const c = t.latestCounts;
            const q = encodeURIComponent(t.targetId);
            const historyHref = `/ai-discovery?target=${q}#ai-discovery-history`;
            const reviewHref = `/ai-discovery?target=${q}#govai-discovery-scan-${t.latestScanId}`;
            const busy = actingScanId === t.latestScanId;
            return (
              <div
                key={t.targetId}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid var(--govai-border-faint)",
                  background: "rgba(0,0,0,0.12)",
                  fontSize: 12.5,
                  color: "var(--govai-text-secondary)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--govai-text)" }}>{t.targetId}</span>
                    <span style={{ color: "var(--govai-text-tertiary)", marginLeft: 8 }}>
                      <code style={{ fontSize: 11 }}>{t.scanRoot}</code>
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <Link
                      href={reviewHref}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--govai-border-faint)",
                        background: "rgba(255,255,255,0.06)",
                        color: "var(--govai-text-secondary)",
                        textDecoration: "none",
                      }}
                    >
                      Review now
                    </Link>
                    <Link
                      href={historyHref}
                      style={{
                        fontSize: 11.5,
                        color: "var(--govai-text-secondary)",
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                    >
                      View in history
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      style={inlineBtn}
                      onClick={() => void applyInlineStatus(t.latestScanId, "reviewed")}
                    >
                      Mark reviewed
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      style={inlineBtn}
                      onClick={() => void applyInlineStatus(t.latestScanId, "needs_follow_up")}
                    >
                      Needs follow-up
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      style={inlineBtn}
                      onClick={() => void onOpenReviewByScanId(t.latestScanId)}
                    >
                      Open review
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Last scan </span>
                    {formatWhen(t.lastScanAt)} ({triggerLabel(t.lastScanTriggerType)})
                  </div>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Counts </span>
                    OAI {c.openai} · TF {c.transformers} · Art {c.modelArtifacts} · Comb {c.combinedFolders}
                  </div>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Open changes </span>
                    <strong style={{ color: t.hasOpenChanges ? "var(--govai-state-warning, #eab308)" : "var(--govai-text-secondary)" }}>
                      {t.hasOpenChanges ? "Yes" : "No"}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Review </span>
                    {reviewLabel(t.lastScanReviewStatus)}
                  </div>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Change alert </span>
                    {alertLabel(t.lastAlertDeliveryStatus)}
                  </div>
                  {(t.projectId || t.repoUrl) && (
                    <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "var(--govai-text-tertiary)" }}>
                      {t.projectId ? <>Project {t.projectId} </> : null}
                      {t.repoUrl ? <>· {t.repoUrl}</> : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
