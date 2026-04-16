"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { compareDiscoveryRuns } from "@/lib/ai-discovery/compareDiscoveryRuns";
import { countsFromDiscoveryResult } from "@/lib/ai-discovery/scanHistoryCounts";
import type {
  DiscoveryGroupedSummary,
  DiscoveryNote,
} from "@/lib/ai-discovery/apiTypes";

type StoredScan = {
  id: string;
  createdAt: string;
  scanRoot: string;
  detections: unknown[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
};

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

type Props = {
  refreshTrigger: number;
};

export function AiDiscoveryHistorySection({ refreshTrigger }: Props) {
  const [scans, setScans] = useState<StoredScan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [diffShown, setDiffShown] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai-discovery/history", { credentials: "same-origin" });
      const json = (await res.json()) as { ok?: boolean; scans?: StoredScan[] };
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
        ). Newest first.
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
                <th style={{ padding: "6px 8px" }}>OpenAI</th>
                <th style={{ padding: "6px 8px" }}>Transformers</th>
                <th style={{ padding: "6px 8px" }}>Artifacts</th>
                <th style={{ padding: "6px 8px" }}>Combined</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => {
                const c = countsFromDiscoveryResult(s.groupedSummary, s.notes);
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--govai-border-faint)" }}>
                    <td style={{ padding: "8px 8px 8px 0", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {formatWhen(s.createdAt)}
                    </td>
                    <td style={{ padding: 8, fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-all" }}>
                      {s.scanRoot}
                    </td>
                    <td style={{ padding: 8 }}>{c.openai}</td>
                    <td style={{ padding: 8 }}>{c.transformers}</td>
                    <td style={{ padding: 8 }}>{c.modelArtifacts}</td>
                    <td style={{ padding: 8 }}>{c.combinedFolders}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

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
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--govai-text-tertiary)" }}>
                Older: {formatWhen(orderedPair.older.createdAt)} ({orderedPair.older.scanRoot}) → Newer:{" "}
                {formatWhen(orderedPair.newer.createdAt)} ({orderedPair.newer.scanRoot})
              </p>
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
