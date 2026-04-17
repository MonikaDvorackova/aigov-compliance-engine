"use client";

import type { CSSProperties } from "react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { compareDiscoveryRuns } from "@/lib/ai-discovery/compareDiscoveryRuns";
import { countsFromDiscoveryResult } from "@/lib/ai-discovery/scanHistoryCounts";
import type { DiscoveryScanChangeSummary } from "@/lib/ai-discovery/scanChangeSummary";
import type { StoredDiscoveryScan } from "@/lib/ai-discovery/scanHistoryTypes";
import type { DiscoveryScanDecision } from "@/lib/ai-discovery/scanReviewTypes";

import { AiDiscoveryScanReviewModal } from "./AiDiscoveryScanReviewModal";

function panelStyle(): CSSProperties {
  return {
    marginTop: 20,
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--govai-border-faint)",
    background: "rgba(255,255,255,0.02)",
  };
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function statusLabel(s: StoredDiscoveryScan["reviewStatus"]): string {
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

function decisionLabel(d: DiscoveryScanDecision | null | undefined): string {
  if (d === null || d === undefined) return "—";
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

function shortCommitSha(sha: string | null | undefined): string | null {
  if (!sha || typeof sha !== "string") return null;
  const t = sha.trim();
  if (!t) return null;
  return t.length <= 7 ? t : `${t.slice(0, 7)}`;
}

/** Branch and short SHA for table summary; "—" when nothing is recorded. */
function formatRefSummary(scan: StoredDiscoveryScan): string {
  const b = scan.branch?.trim();
  const sh = shortCommitSha(scan.commitSha);
  if (b && sh) return `${b} @ ${sh}`;
  if (b) return b;
  if (sh) return sh;
  return "—";
}

function triggerTypeLabel(t: StoredDiscoveryScan["triggerType"]): string {
  if (t === "manual") return "Manual";
  if (t === "scheduled") return "Scheduled";
  return "—";
}

function ScanContextDetailsBody({ scan }: { scan: StoredDiscoveryScan }) {
  const rows: { k: string; v: string }[] = [
    { k: "Project ID", v: scan.projectId?.trim() || "—" },
    { k: "Repository URL", v: scan.repoUrl?.trim() || "—" },
    { k: "Branch", v: scan.branch?.trim() || "—" },
    { k: "Commit SHA", v: scan.commitSha?.trim() || "—" },
    { k: "Triggered by", v: scan.triggeredBy?.trim() || "—" },
    { k: "Trigger type", v: triggerTypeLabel(scan.triggerType) },
    { k: "Schedule target id", v: scan.scheduledTargetId?.trim() || "—" },
    ...(scan.triggerType === "scheduled" && scan.changeSummary?.hasChanges
      ? [
          {
            k: "Change alert (Slack)",
            v:
              scan.alertDeliveryStatus === "sent"
                ? "Delivered"
                : scan.alertDeliveryStatus === "failed"
                  ? "Failed"
                  : "Skipped (no AI_DISCOVERY_SLACK_WEBHOOK_URL)",
          },
          { k: "Alert attempted at", v: scan.alertAttemptedAt ? formatWhen(scan.alertAttemptedAt) : "—" },
          { k: "Alert delivered at", v: scan.alertDeliveredAt ? formatWhen(scan.alertDeliveredAt) : "—" },
          {
            k: "Alert error",
            v: scan.alertDeliveryError?.trim() || "—",
          },
        ]
      : []),
  ];
  return (
    <dl
      style={{
        margin: 0,
        display: "grid",
        gridTemplateColumns: "minmax(120px, 160px) 1fr",
        gap: "6px 12px",
        fontSize: 12,
        color: "var(--govai-text-secondary)",
      }}
    >
      {rows.map(({ k, v }) => (
        <Fragment key={k}>
          <dt style={{ margin: 0, color: "var(--govai-text-tertiary)", fontWeight: 500 }}>{k}</dt>
          <dd style={{ margin: 0, fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-all" }}>
            {v}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

function ChangeSummaryDetailsBody({ summary }: { summary: DiscoveryScanChangeSummary }) {
  const cat = (
    label: string,
    a: DiscoveryScanChangeSummary["addedCounts"][keyof DiscoveryScanChangeSummary["addedCounts"]],
    r: DiscoveryScanChangeSummary["removedCounts"][keyof DiscoveryScanChangeSummary["removedCounts"]]
  ) => (
    <tr key={label}>
      <td style={{ padding: "4px 8px 4px 0", color: "var(--govai-text-tertiary)" }}>{label}</td>
      <td style={{ padding: 4, textAlign: "right", fontFamily: "ui-monospace, Menlo, monospace" }}>{a}</td>
      <td style={{ padding: 4, textAlign: "right", fontFamily: "ui-monospace, Menlo, monospace" }}>{r}</td>
    </tr>
  );
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
      <thead>
        <tr style={{ color: "var(--govai-text-tertiary)", textAlign: "left" }}>
          <th style={{ padding: "4px 8px 4px 0", fontWeight: 600 }}>Category</th>
          <th style={{ padding: 4, fontWeight: 600, textAlign: "right" }}>Added</th>
          <th style={{ padding: 4, fontWeight: 600, textAlign: "right" }}>Removed</th>
        </tr>
      </thead>
      <tbody>
        {cat("OpenAI", summary.addedCounts.openai, summary.removedCounts.openai)}
        {cat("Transformers", summary.addedCounts.transformers, summary.removedCounts.transformers)}
        {cat("Model artifacts", summary.addedCounts.modelArtifacts, summary.removedCounts.modelArtifacts)}
        {cat("Combined folders", summary.addedCounts.combinedFolders, summary.removedCounts.combinedFolders)}
      </tbody>
    </table>
  );
}

function changesBadge(scan: StoredDiscoveryScan): { label: string; tone: "neutral" | "yes" | "no" } {
  const cs = scan.changeSummary;
  if (!cs) return { label: "—", tone: "neutral" };
  if (cs.hasChanges) return { label: "Yes", tone: "yes" };
  return { label: "No", tone: "no" };
}

/** Slack change alert delivery; only meaningful for scheduled scans with detected changes. */
function changeAlertShort(scan: StoredDiscoveryScan): { label: string; tone: "neutral" | "ok" | "warn" | "bad" } {
  if (scan.triggerType !== "scheduled") return { label: "—", tone: "neutral" };
  if (!scan.changeSummary?.hasChanges) return { label: "—", tone: "neutral" };
  switch (scan.alertDeliveryStatus) {
    case "sent":
      return { label: "Sent", tone: "ok" };
    case "failed":
      return { label: "Failed", tone: "bad" };
    case "not_attempted":
      return { label: "Skipped", tone: "neutral" };
    default:
      return { label: "—", tone: "neutral" };
  }
}

function DiffList({ title, added, removed }: { title: string; added: string[]; removed: string[] }) {
  const empty = added.length === 0 && removed.length === 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {empty ? (
        <div style={{ fontSize: 12, color: "var(--govai-text-tertiary)" }}>No changes</div>
      ) : (
        <div style={{ display: "grid", gap: 8, fontSize: 12.5 }}>
          {added.length > 0 ? (
            <div>
              <span style={{ color: "var(--govai-text-tertiary)" }}>Added </span>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {added.map((f) => (
                  <li key={`a-${f}`} style={{ fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-all" }}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {removed.length > 0 ? (
            <div>
              <span style={{ color: "var(--govai-text-tertiary)" }}>Removed </span>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {removed.map((f) => (
                  <li key={`r-${f}`} style={{ fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-all" }}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RunReviewCaption({ label, scan }: { label: string; scan: StoredDiscoveryScan }) {
  return (
    <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
      <strong style={{ color: "var(--govai-text-secondary)" }}>{label}:</strong> {statusLabel(scan.reviewStatus)}
      {" · "}
      Decision {decisionLabel(scan.decision)}
      {" · "}
      Reviewed {scan.reviewedAt ? formatWhen(scan.reviewedAt) : "—"}
      {scan.reviewedBy ? ` · ${scan.reviewedBy}` : ""}
    </p>
  );
}

function RunContextCaption({ label, scan }: { label: string; scan: StoredDiscoveryScan }) {
  const refLine = formatRefSummary(scan);
  const parts: string[] = [];
  if (scan.repoUrl?.trim()) parts.push(`Repo ${scan.repoUrl.trim()}`);
  if (refLine !== "—") parts.push(`Ref ${refLine}`);
  if (scan.commitSha?.trim() && scan.commitSha.trim().length > 7) {
    parts.push(`Full SHA ${scan.commitSha.trim()}`);
  }
  if (scan.projectId?.trim()) parts.push(`Project ${scan.projectId.trim()}`);
  if (scan.triggerType) parts.push(`Trigger ${triggerTypeLabel(scan.triggerType)}`);
  if (scan.triggeredBy?.trim()) parts.push(`By ${scan.triggeredBy.trim()}`);

  const text =
    parts.length > 0 ? parts.join(" · ") : "No repository or trigger context recorded for this run.";

  return (
    <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
      <strong style={{ color: "var(--govai-text-secondary)" }}>{label}:</strong> {text}
    </p>
  );
}

type Props = {
  refreshTrigger: number;
};

export function AiDiscoveryHistorySection({ refreshTrigger }: Props) {
  const [scans, setScans] = useState<StoredDiscoveryScan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [diffShown, setDiffShown] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewScan, setReviewScan] = useState<StoredDiscoveryScan | null>(null);
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  const [expandedChangeSummaryId, setExpandedChangeSummaryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai-discovery/history", { credentials: "same-origin" });
      const json = (await res.json()) as { ok?: boolean; scans?: StoredDiscoveryScan[] };
      if (!res.ok || !json.ok || !Array.isArray(json.scans)) {
        setError("Could not load scan history.");
        setScans([]);
        return;
      }
      setScans(json.scans);
    } catch {
      setError("Could not load scan history.");
      setScans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const orderedPair = useMemo(() => {
    if (!compareA || !compareB || compareA === compareB) return null;
    const a = scans.find((s) => s.id === compareA);
    const b = scans.find((s) => s.id === compareB);
    if (!a || !b) return null;
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return ta <= tb ? ({ older: a, newer: b } as const) : ({ older: b, newer: a } as const);
  }, [compareA, compareB, scans]);

  const diff = useMemo(() => {
    if (!orderedPair) return null;
    return compareDiscoveryRuns(
      {
        groupedSummary: orderedPair.older.groupedSummary,
        notes: orderedPair.older.notes,
      },
      {
        groupedSummary: orderedPair.newer.groupedSummary,
        notes: orderedPair.newer.notes,
      }
    );
  }, [orderedPair]);

  return (
    <div style={panelStyle()}>
      <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Previous scans</h2>
      <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
        Successful runs for this repository (stored on the server under <code style={{ fontSize: 11 }}>.govai/</code>
        ). Newest first. Reviews are saved with each scan record.
      </p>

      {loading ? (
        <p style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>Loading history…</p>
      ) : null}
      {error ? (
        <p style={{ fontSize: 12.5, color: "var(--govai-state-danger)" }}>{error}</p>
      ) : null}

      {!loading && !error && scans.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>No saved scans yet. Run a discovery scan to record one.</p>
      ) : null}

      {!loading && scans.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12.5,
              color: "var(--govai-text-secondary)",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--govai-border-faint)", textAlign: "left" }}>
                <th style={{ padding: "6px 8px 6px 0" }}>When</th>
                <th style={{ padding: "6px 8px" }}>Scan root</th>
                <th style={{ padding: "6px 8px" }}>Branch / commit</th>
                <th style={{ padding: "6px 8px" }}>Trigger</th>
                <th style={{ padding: "6px 8px" }}>Triggered by</th>
                <th style={{ padding: "6px 8px" }}>Δ vs prior</th>
                <th style={{ padding: "6px 8px" }}>Change alert</th>
                <th style={{ padding: "6px 8px" }}>OpenAI</th>
                <th style={{ padding: "6px 8px" }}>Transformers</th>
                <th style={{ padding: "6px 8px" }}>Artifacts</th>
                <th style={{ padding: "6px 8px" }}>Combined</th>
                <th style={{ padding: "6px 8px" }}>Review</th>
                <th style={{ padding: "6px 8px" }}>Decision</th>
                <th style={{ padding: "6px 8px" }}>Reviewed</th>
                <th style={{ padding: "6px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => {
                const c = countsFromDiscoveryResult(s.groupedSummary, s.notes);
                const refSummary = formatRefSummary(s);
                const by = s.triggeredBy?.trim();
                const ch = changesBadge(s);
                const al = changeAlertShort(s);
                return (
                  <Fragment key={s.id}>
                    <tr style={{ borderBottom: "1px solid var(--govai-border-faint)" }}>
                      <td style={{ padding: "8px 8px 8px 0", verticalAlign: "top", whiteSpace: "nowrap" }}>
                        {formatWhen(s.createdAt)}
                      </td>
                      <td style={{ padding: 8, fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-all" }}>
                        {s.scanRoot}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          fontFamily: "ui-monospace, Menlo, monospace",
                          fontSize: 11.5,
                          whiteSpace: "nowrap",
                          maxWidth: 220,
                        }}
                        title={refSummary !== "—" ? refSummary : undefined}
                      >
                        {refSummary}
                      </td>
                      <td style={{ padding: 8, fontSize: 11.5, whiteSpace: "nowrap" }}>
                        {triggerTypeLabel(s.triggerType)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          fontSize: 11.5,
                          maxWidth: 160,
                          wordBreak: "break-word",
                        }}
                        title={by || undefined}
                      >
                        {by || "—"}
                      </td>
                      <td style={{ padding: 8, verticalAlign: "top" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              ch.tone === "yes"
                                ? "rgba(234, 179, 8, 0.15)"
                                : ch.tone === "no"
                                  ? "rgba(34, 197, 94, 0.12)"
                                  : "rgba(255,255,255,0.06)",
                            color:
                              ch.tone === "yes"
                                ? "var(--govai-state-warning, #eab308)"
                                : ch.tone === "no"
                                  ? "var(--govai-text-secondary)"
                                  : "var(--govai-text-tertiary)",
                          }}
                        >
                          {ch.label}
                        </span>
                      </td>
                      <td style={{ padding: 8, verticalAlign: "top" }}>
                        <span
                          title={
                            al.tone === "bad" && s.alertDeliveryError
                              ? s.alertDeliveryError
                              : undefined
                          }
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              al.tone === "ok"
                                ? "rgba(34, 197, 94, 0.12)"
                                : al.tone === "bad"
                                  ? "rgba(239, 68, 68, 0.12)"
                                  : "rgba(255,255,255,0.06)",
                            color:
                              al.tone === "ok"
                                ? "var(--govai-text-secondary)"
                                : al.tone === "bad"
                                  ? "var(--govai-state-danger, #ef4444)"
                                  : "var(--govai-text-tertiary)",
                          }}
                        >
                          {al.label}
                        </span>
                      </td>
                      <td style={{ padding: 8 }}>{c.openai}</td>
                      <td style={{ padding: 8 }}>{c.transformers}</td>
                      <td style={{ padding: 8 }}>{c.modelArtifacts}</td>
                      <td style={{ padding: 8 }}>{c.combinedFolders}</td>
                      <td style={{ padding: 8 }}>{statusLabel(s.reviewStatus)}</td>
                      <td style={{ padding: 8 }}>{decisionLabel(s.decision)}</td>
                      <td style={{ padding: 8, fontSize: 11.5, whiteSpace: "nowrap" }}>
                        {s.reviewedAt ? formatWhen(s.reviewedAt) : "—"}
                      </td>
                      <td style={{ padding: 8, verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setReviewScan(s);
                              setReviewOpen(true);
                            }}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--govai-border-faint)",
                              background: "rgba(255,255,255,0.04)",
                              color: "var(--govai-text-secondary)",
                              fontSize: 11.5,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedContextId((id) => (id === s.id ? null : s.id));
                            }}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--govai-border-faint)",
                              background:
                                expandedContextId === s.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                              color: "var(--govai-text-secondary)",
                              fontSize: 11.5,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {expandedContextId === s.id ? "Hide context" : "Scan context"}
                          </button>
                          {s.changeSummary ? (
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedChangeSummaryId((id) => (id === s.id ? null : s.id));
                              }}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 8,
                                border: "1px solid var(--govai-border-faint)",
                                background:
                                  expandedChangeSummaryId === s.id
                                    ? "rgba(255,255,255,0.08)"
                                    : "rgba(255,255,255,0.04)",
                                color: "var(--govai-text-secondary)",
                                fontSize: 11.5,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {expandedChangeSummaryId === s.id ? "Hide Δ" : "Change summary"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {expandedContextId === s.id ? (
                      <tr style={{ borderBottom: "1px solid var(--govai-border-faint)" }}>
                        <td colSpan={15} style={{ padding: "10px 12px 14px", background: "rgba(0,0,0,0.15)" }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8, color: "var(--govai-text-secondary)" }}>
                            Full scan context
                          </div>
                          <ScanContextDetailsBody scan={s} />
                        </td>
                      </tr>
                    ) : null}
                    {expandedChangeSummaryId === s.id && s.changeSummary ? (
                      <tr style={{ borderBottom: "1px solid var(--govai-border-faint)" }}>
                        <td colSpan={15} style={{ padding: "10px 12px 14px", background: "rgba(0,0,0,0.12)" }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4, color: "var(--govai-text-secondary)" }}>
                            Change vs prior run (same schedule target or manual baseline)
                          </div>
                          <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "var(--govai-text-tertiary)" }}>
                            Compared to the most recent prior scan for this target. Categories match OpenAI, Transformers,
                            model artifacts, and combined-signal folders.
                          </p>
                          <ChangeSummaryDetailsBody summary={s.changeSummary} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <AiDiscoveryScanReviewModal
        open={reviewOpen}
        scan={reviewScan}
        onClose={() => {
          setReviewOpen(false);
          setReviewScan(null);
        }}
        onSaved={() => void load()}
      />

      {scans.length >= 2 ? (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--govai-border-faint)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Compare runs</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span style={{ color: "var(--govai-text-label)" }}>Run A</span>
              <select
                value={compareA}
                onChange={(e) => {
                  setCompareA(e.target.value);
                  setDiffShown(false);
                }}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--govai-border-faint)",
                  background: "var(--govai-bg-app)",
                  color: "var(--govai-text)",
                  fontSize: 12,
                  minWidth: 200,
                }}
              >
                <option value="">Select…</option>
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatWhen(s.createdAt)} — {s.scanRoot}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span style={{ color: "var(--govai-text-label)" }}>Run B</span>
              <select
                value={compareB}
                onChange={(e) => {
                  setCompareB(e.target.value);
                  setDiffShown(false);
                }}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--govai-border-faint)",
                  background: "var(--govai-bg-app)",
                  color: "var(--govai-text)",
                  fontSize: 12,
                  minWidth: 200,
                }}
              >
                <option value="">Select…</option>
                {scans.map((s) => (
                  <option key={`b-${s.id}`} value={s.id}>
                    {formatWhen(s.createdAt)} — {s.scanRoot}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!orderedPair}
              onClick={() => setDiffShown(true)}
              style={{
                marginTop: 18,
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--govai-border-faint)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--govai-text-secondary)",
                fontSize: 12.5,
                cursor: orderedPair ? "pointer" : "not-allowed",
                opacity: orderedPair ? 1 : 0.5,
              }}
            >
              Show diff
            </button>
          </div>

          {diffShown && orderedPair && diff ? (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--govai-border-faint)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--govai-text-tertiary)" }}>
                Older: {formatWhen(orderedPair.older.createdAt)} ({orderedPair.older.scanRoot}) → Newer:{" "}
                {formatWhen(orderedPair.newer.createdAt)} ({orderedPair.newer.scanRoot})
              </p>
              <RunContextCaption label="Older run context" scan={orderedPair.older} />
              <RunContextCaption label="Newer run context" scan={orderedPair.newer} />
              <RunReviewCaption label="Older run review" scan={orderedPair.older} />
              <RunReviewCaption label="Newer run review" scan={orderedPair.newer} />
              <DiffList title="OpenAI usage" added={diff.openai.added} removed={diff.openai.removed} />
              <DiffList title="Transformers" added={diff.transformers.added} removed={diff.transformers.removed} />
              <DiffList
                title="Model artifacts"
                added={diff.modelArtifacts.added}
                removed={diff.modelArtifacts.removed}
              />
              <DiffList
                title="Combined-signal folders"
                added={diff.combinedFolders.added}
                removed={diff.combinedFolders.removed}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
