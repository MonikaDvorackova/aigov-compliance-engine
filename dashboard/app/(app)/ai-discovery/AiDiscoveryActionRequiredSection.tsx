"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

import type { DiscoveryInboxItem } from "@/lib/ai-discovery/discoveryInboxTypes";
import { patchDiscoveryScanReviewStatus } from "@/lib/ai-discovery/discoveryReviewInline.client";

function panelStyle(): CSSProperties {
  return {
    marginTop: 12,
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--govai-badge-issue-border)",
    background: "var(--govai-badge-issue-bg)",
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

function reviewLabel(s: DiscoveryInboxItem["reviewStatus"]): string {
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

function decisionLabel(d: DiscoveryInboxItem["decision"]): string {
  if (d === null) return "—";
  switch (d) {
    case "informational":
      return "Informational";
    case "needs_follow_up":
      return "Needs follow-up";
    case "confirmed_local_model_signal":
      return "Confirmed local model";
    default:
      return d;
  }
}

function alertLabel(a: DiscoveryInboxItem["alertStatus"]): string {
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
  /** Serialized query string for `/api/ai-discovery/inbox` (no leading `?`). */
  listQuery: string;
  /** True when URL has target / search / review / alert / open-changes / trigger filters. */
  filtersActive: boolean;
  onOpenReviewByScanId: (scanId: string) => void | Promise<void>;
  onReviewsMutated: () => void;
};

export function AiDiscoveryActionRequiredSection({
  refreshTrigger,
  listQuery,
  filtersActive,
  onOpenReviewByScanId,
  onReviewsMutated,
}: Props) {
  const [items, setItems] = useState<DiscoveryInboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingScanId, setActingScanId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const path =
        listQuery.length > 0
          ? `/api/ai-discovery/inbox?${listQuery}`
          : "/api/ai-discovery/inbox";
      const res = await fetch(path, { credentials: "same-origin" });
      const json = (await res.json()) as { ok?: boolean; items?: DiscoveryInboxItem[] };
      if (!res.ok || !json.ok || !Array.isArray(json.items)) {
        setError("Could not load action items.");
        setItems([]);
        return;
      }
      setItems(json.items);
    } catch {
      setError("Could not load action items.");
      setItems([]);
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
      <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>
        Action required
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
        Items that need attention based on recent scans.
      </p>

      {loading ? (
        <p style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>Loading inbox…</p>
      ) : null}
      {error ? <p style={{ fontSize: 12.5, color: "var(--govai-state-danger)" }}>{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>
          {filtersActive
            ? "No results match the current filters."
            : "No items require attention."}
        </p>
      ) : null}

      {!loading && items.length > 0 ? (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => {
            const q = encodeURIComponent(item.linkTarget);
            const historyHref = `/ai-discovery?target=${q}#ai-discovery-history`;
            const reviewHref = `/ai-discovery?target=${q}#govai-discovery-scan-${item.latestScanId}`;
            const c = item.latestCounts;
            const busy = actingScanId === item.latestScanId;
            return (
              <div
                key={item.targetId}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid var(--govai-border-faint)",
                  background: "rgba(0,0,0,0.15)",
                  fontSize: 12.5,
                  color: "var(--govai-text-secondary)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--govai-text)" }}>{item.targetId}</span>
                    <span style={{ color: "var(--govai-text-tertiary)", marginLeft: 8 }}>
                      <code style={{ fontSize: 11 }}>{item.scanRoot}</code>
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
                        border: "1px solid var(--govai-badge-issue-border)",
                        background: "var(--govai-badge-issue-bg)",
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
                        padding: "4px 0",
                      }}
                    >
                      View in history
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      style={inlineBtn}
                      onClick={() => void applyInlineStatus(item.latestScanId, "reviewed")}
                    >
                      Mark reviewed
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      style={inlineBtn}
                      onClick={() => void applyInlineStatus(item.latestScanId, "needs_follow_up")}
                    >
                      Needs follow-up
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      style={inlineBtn}
                      onClick={() => void onOpenReviewByScanId(item.latestScanId)}
                    >
                      Open review
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {item.reasonTags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        padding: "3px 8px",
                        borderRadius: 4,
                        background: "var(--govai-bg-surface-2)",
                        border: "1px solid var(--govai-border-default)",
                        color: "var(--govai-text-secondary)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Last scan </span>
                    {formatWhen(item.lastScanAt)}
                  </div>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Counts </span>
                    OpenAI signals {c.openai} · Transformers signals {c.transformers} · Model artifact signals {c.modelArtifacts} · Combined signals {c.combinedFolders}
                  </div>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Review </span>
                    {reviewLabel(item.reviewStatus)}
                    {" · "}
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Decision </span>
                    {decisionLabel(item.decision)}
                  </div>
                  <div>
                    <span style={{ color: "var(--govai-text-tertiary)" }}>Alert </span>
                    {alertLabel(item.alertStatus)}
                  </div>
                  {(item.projectId || item.repoUrl) && (
                    <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "var(--govai-text-tertiary)" }}>
                      {item.projectId ? <>Project {item.projectId} </> : null}
                      {item.repoUrl ? <>· {item.repoUrl}</> : null}
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
