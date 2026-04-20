"use client";

import type { CSSProperties } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { premiumPrimaryButtonClass } from "@/app/_ui/cta/premiumPrimaryButton";
import {
  loadLastDiscoveryResult,
  saveLastDiscoveryResult,
} from "@/lib/ai-discovery/aiDiscoveryStorage";
import { buildCombinedSignalFolderBlocks } from "@/lib/ai-discovery/combinedSignalBlocks";
import type {
  AIDetection,
  DiscoveryGroupedSummary,
  DiscoveryNote,
} from "@/lib/ai-discovery/apiTypes";

import {
  candidateFolderDisplay,
  candidateFolderGroupKey,
  normalizeCandidatePath,
} from "@/lib/ai-discovery/candidatePathNormalize";
import { downloadAiDiscoveryJson } from "@/lib/ai-discovery/downloadDiscoveryJson";
import { fetchDiscoveryScanById } from "@/lib/ai-discovery/discoveryReviewInline.client";
import {
  historyApiQueryFromPageParams,
  inboxApiQueryFromPageParams,
  targetStatusApiQueryFromPageParams,
} from "@/lib/ai-discovery/aiDiscoveryListFilterQuery";
import type { StoredDiscoveryScan } from "@/lib/ai-discovery/scanHistoryTypes";

import { AiDiscoveryFilePath } from "./AiDiscoveryFilePath";
import { AiDiscoveryActionRequiredSection } from "./AiDiscoveryActionRequiredSection";
import { AiDiscoveryHistorySection } from "./AiDiscoveryHistorySection";
import { AiDiscoveryListFilters } from "./AiDiscoveryListFilters";
import { AiDiscoveryTargetStatusSection } from "./AiDiscoveryTargetStatusSection";
import { AiDiscoveryReportModal } from "./AiDiscoveryReportModal";
import { AiDiscoveryScanReviewModal } from "./AiDiscoveryScanReviewModal";

type DiscoveryOkResponse = {
  ok: true;
  scanRoot: string;
  detections: AIDetection[];
  groupedSummary: DiscoveryGroupedSummary;
  notes: DiscoveryNote[];
};

type DiscoveryErrorResponse = {
  ok: false;
  error?: string;
  message?: string;
};

type ConfirmedAISystem = {
  id: string;
  source: "discovery";
  detectionType: "openai" | "transformers" | "model_artifact";
  file: string;
  createdAt: string;
};

type CategoryFilters = {
  openai: boolean;
  transformers: boolean;
  modelArtifacts: boolean;
  combined: boolean;
};

const DEFAULT_FILTERS: CategoryFilters = {
  openai: true,
  transformers: true,
  modelArtifacts: true,
  combined: true,
};

function formatLocalScanTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function panelStyle(): CSSProperties {
  return {
    marginTop: 20,
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--govai-border-faint)",
    background: "rgba(255,255,255,0.02)",
  };
}

function FileListInteractive({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>(none)</div>
    );
  }
  return (
    <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
      {paths.map((p) => (
        <li key={p} style={{ listStyle: "disc" }}>
          <AiDiscoveryFilePath path={p} />
        </li>
      ))}
    </ul>
  );
}

function detectionRowKey(d: AIDetection, index: number): string {
  return `${index}:${d.type}:${d.file}:${d.signal}`;
}

/** Stable key for type + file (matches server deduplication). */
function confirmationPairKey(
  detectionType: AIDetection["type"],
  file: string
): string {
  return JSON.stringify([detectionType, normalizeCandidatePath(file)]);
}

function signalTypeLabel(t: AIDetection["type"]): string {
  switch (t) {
    case "openai":
      return "OpenAI signals";
    case "transformers":
      return "Transformers signals";
    case "model_artifact":
      return "Model artifact signals";
    default:
      return t;
  }
}

function filterChipStyle(active: boolean): CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11.5,
    border: `1px solid ${active ? "rgba(59, 130, 246, 0.45)" : "var(--govai-border-faint)"}`,
    background: active ? "rgba(59, 130, 246, 0.12)" : "transparent",
    color: "var(--govai-text-secondary)",
    cursor: "pointer",
  };
}

const SCAN_FAILED = "Scan failed. Try again.";

export default function AiDiscoveryClient() {
  return (
    <Suspense fallback={null}>
      <AiDiscoveryClientInner />
    </Suspense>
  );
}

function AiDiscoveryClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetFilter = searchParams.get("target");
  const listParamsKey = searchParams.toString();
  const inboxListQuery = useMemo(
    () => inboxApiQueryFromPageParams(new URLSearchParams(listParamsKey)),
    [listParamsKey]
  );
  const targetStatusListQuery = useMemo(
    () => targetStatusApiQueryFromPageParams(new URLSearchParams(listParamsKey)),
    [listParamsKey]
  );
  const historyListQuery = useMemo(
    () => historyApiQueryFromPageParams(new URLSearchParams(listParamsKey)),
    [listParamsKey]
  );

  const listFiltersActive = useMemo(() => {
    const sp = new URLSearchParams(listParamsKey);
    return (
      !!(sp.get("target")?.trim()) ||
      !!(sp.get("targetQuery")?.trim()) ||
      !!(sp.get("reviewStatus")?.trim()) ||
      !!(sp.get("alertStatus")?.trim()) ||
      sp.get("hasOpenChanges") === "true" ||
      !!(sp.get("triggerType")?.trim())
    );
  }, [listParamsKey]);

  const clearTargetFilter = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("target");
    const q = sp.toString();
    router.push(q ? `/ai-discovery?${q}` : "/ai-discovery");
  }, [router, searchParams]);

  const bumpDiscoveryData = useCallback(() => {
    setHistoryRefresh((n) => n + 1);
  }, []);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewModalScan, setReviewModalScan] = useState<StoredDiscoveryScan | null>(null);

  const openReviewModalFromScan = useCallback((scan: StoredDiscoveryScan) => {
    setReviewModalScan(scan);
    setReviewModalOpen(true);
  }, []);

  const openReviewModalFromScanId = useCallback(
    async (scanId: string) => {
      const scan = await fetchDiscoveryScanById(scanId);
      if (scan) openReviewModalFromScan(scan);
    },
    [openReviewModalFromScan]
  );

  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiscoveryOkResponse | null>(null);
  const [clientReady, setClientReady] = useState(false);
  const [lastScanIso, setLastScanIso] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [filters, setFilters] = useState<CategoryFilters>(DEFAULT_FILTERS);

  const [confirmedSystems, setConfirmedSystems] = useState<ConfirmedAISystem[]>([]);
  const [confirmedListError, setConfirmedListError] = useState<string | null>(null);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  const confirmedPairKeys = useMemo(() => {
    const s = new Set<string>();
    for (const c of confirmedSystems) {
      s.add(confirmationPairKey(c.detectionType, c.file));
    }
    return s;
  }, [confirmedSystems]);

  useEffect(() => {
    const stored = loadLastDiscoveryResult();
    if (stored) {
      setTarget(stored.target);
      setLastScanIso(stored.savedAt);
      setData({
        ok: true,
        scanRoot: stored.scanRoot,
        detections: stored.detections,
        groupedSummary: stored.groupedSummary,
        notes: stored.notes,
      });
    }
    setClientReady(true);
  }, []);

  const refreshConfirmed = useCallback(async () => {
    setConfirmedListError(null);
    try {
      const res = await fetch("/api/ai-discovery/confirmed", { credentials: "same-origin" });
      const json = (await res.json()) as { ok?: boolean; systems?: ConfirmedAISystem[] };
      if (!res.ok || !json.ok || !Array.isArray(json.systems)) {
        setConfirmedListError("Could not load AI system candidates.");
        return;
      }
      setConfirmedSystems(json.systems);
    } catch {
      setConfirmedListError("Could not load AI system candidates.");
    }
  }, []);

  useEffect(() => {
    void refreshConfirmed();
  }, [refreshConfirmed]);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    const trimmedTarget = target.trim();
    try {
      const res = await fetch("/api/ai-discovery", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: trimmedTarget || undefined,
        }),
      });
      const json = (await res.json()) as DiscoveryOkResponse | DiscoveryErrorResponse;
      if (!res.ok || !json.ok) {
        setError(SCAN_FAILED);
        return;
      }
      const ok: DiscoveryOkResponse = json;
      setData(ok);
      const savedAt = saveLastDiscoveryResult({
        target: trimmedTarget,
        scanRoot: ok.scanRoot,
        detections: ok.detections,
        groupedSummary: ok.groupedSummary,
        notes: ok.notes,
      });
      if (savedAt) setLastScanIso(savedAt);
      setHistoryRefresh((n) => n + 1);
    } catch {
      setError(SCAN_FAILED);
    } finally {
      setLoading(false);
    }
  }, [target]);

  const confirmDetection = useCallback(
    async (d: AIDetection, index: number) => {
      const pairKey = confirmationPairKey(d.type, d.file);
      if (confirmedPairKeys.has(pairKey)) {
        return;
      }
      const key = detectionRowKey(d, index);
      setConfirmingKey(key);
      try {
        const res = await fetch("/api/ai-discovery/confirm", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          type: d.type,
          file: normalizeCandidatePath(d.file),
        }),
        });
        const json = (await res.json()) as { ok?: boolean; existing?: boolean };
        if (!res.ok || !json.ok) {
          return;
        }
        await refreshConfirmed();
      } finally {
        setConfirmingKey(null);
      }
    },
    [confirmedPairKeys, refreshConfirmed]
  );

  const combinedBlocks = useMemo(() => {
    if (!data) return [];
    return buildCombinedSignalFolderBlocks(data.groupedSummary, data.notes);
  }, [data]);

  const combinedNote = useMemo(() => {
    return data?.notes.find((n) => n.code === "combined_local_inference") ?? null;
  }, [data]);

  const isEmpty = useMemo(() => {
    if (!data) return false;
    const g = data.groupedSummary;
    const noFiles =
      g.highConfidence.openai.files.length === 0 &&
      g.experimental.transformers.files.length === 0 &&
      g.experimental.modelArtifacts.files.length === 0;
    return noFiles && data.notes.length === 0;
  }, [data]);

  const counts = useMemo(() => {
    if (!data) {
      return { openai: 0, transformers: 0, modelArtifacts: 0 };
    }
    const g = data.groupedSummary;
    return {
      openai: g.highConfidence.openai.files.length,
      transformers: g.experimental.transformers.files.length,
      modelArtifacts: g.experimental.modelArtifacts.files.length,
    };
  }, [data]);

  const summary = useMemo(() => {
    if (!data) return null;
    return {
      totalSignals: data.detections.length,
      openai: counts.openai,
      transformers: counts.transformers,
      modelArtifacts: counts.modelArtifacts,
      combinedFolders: combinedBlocks.length,
    };
  }, [data, counts.openai, counts.transformers, counts.modelArtifacts, combinedBlocks.length]);

  const detectionVisible = useCallback(
    (d: AIDetection): boolean => {
      if (d.type === "openai") return filters.openai;
      if (d.type === "transformers") return filters.transformers;
      if (d.type === "model_artifact") return filters.modelArtifacts;
      return true;
    },
    [filters]
  );

  const toggleFilter = useCallback((key: keyof CategoryFilters) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  }, []);

  const anyFilterOn = useMemo(
    () =>
      filters.openai ||
      filters.transformers ||
      filters.modelArtifacts ||
      filters.combined,
    [filters]
  );

  const groupedSignalRows = useMemo(() => {
    if (!data) {
      return [] as Array<{
        groupKey: string;
        displayDir: string;
        items: { d: AIDetection; index: number }[];
      }>;
    }
    const buckets = new Map<
      string,
      { displayDir: string; items: { d: AIDetection; index: number }[] }
    >();
    data.detections.forEach((d, index) => {
      if (!detectionVisible(d)) return;
      const gk = candidateFolderGroupKey(d.file);
      if (!buckets.has(gk)) {
        buckets.set(gk, {
          displayDir: candidateFolderDisplay(d.file),
          items: [],
        });
      }
      buckets.get(gk)!.items.push({ d, index });
    });
    const keys = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
    return keys.map((k) => {
      const b = buckets.get(k)!;
      b.items.sort((a, x) => {
        const cmp = normalizeCandidatePath(a.d.file).localeCompare(
          normalizeCandidatePath(x.d.file)
        );
        if (cmp !== 0) return cmp;
        return a.d.signal.localeCompare(x.d.signal);
      });
      return { groupKey: k, displayDir: b.displayDir, items: b.items };
    });
  }, [data, detectionVisible]);

  return (
    <>
    <div style={{ maxWidth: 720 }}>
      <p
        style={{
          fontSize: 11,
          color: "var(--govai-text-tertiary)",
          lineHeight: 1.45,
          marginBottom: 12,
        }}
      >
        Signal-based detection. No compliance conclusions.
      </p>
      <p style={{ fontSize: 13, color: "var(--govai-text-secondary)", lineHeight: 1.55, marginBottom: 18 }}>
        Signal-based AI discovery surfaces OpenAI signals, Transformers signals, and model-weight filename signals (for
        example{" "}
        <code style={{ fontSize: 12 }}>.pt</code>, <code style={{ fontSize: 12 }}>.pth</code>,{" "}
        <code style={{ fontSize: 12 }}>.safetensors</code>, <code style={{ fontSize: 12 }}>.onnx</code>,{" "}
        <code style={{ fontSize: 12 }}>pytorch_model.bin</code>
        —not every <code style={{ fontSize: 12 }}>.bin</code>). Results are evidence, not conclusions.
        The same workspace supports discovery, saved scan history, review, and monitoring (scheduled + alerts).
      </p>

      <AiDiscoveryListFilters />

      <AiDiscoveryActionRequiredSection
        refreshTrigger={historyRefresh}
        listQuery={inboxListQuery}
        filtersActive={listFiltersActive}
        onOpenReviewByScanId={openReviewModalFromScanId}
        onReviewsMutated={bumpDiscoveryData}
      />
      <AiDiscoveryTargetStatusSection
        refreshTrigger={historyRefresh}
        listQuery={targetStatusListQuery}
        filtersActive={listFiltersActive}
        onOpenReviewByScanId={openReviewModalFromScanId}
        onReviewsMutated={bumpDiscoveryData}
      />

      <AiDiscoveryHistorySection
        refreshTrigger={historyRefresh}
        listQuery={historyListQuery}
        filtersActive={listFiltersActive}
        targetFilter={targetFilter}
        onClearTargetFilter={clearTargetFilter}
        onOpenReview={openReviewModalFromScan}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" }}>
          <span style={{ fontSize: 11, color: "var(--govai-text-label)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Scan subpath (optional)
          </span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. python or dashboard"
            disabled={loading}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--govai-border-faint)",
              background: "var(--govai-bg-app)",
              color: "var(--govai-text)",
              fontSize: 13,
            }}
          />
        </label>
        <button
          type="button"
          className={premiumPrimaryButtonClass}
          disabled={loading}
          onClick={() => void runScan()}
          style={{
            padding: "10px 18px",
            borderRadius: 9,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.75 : 1,
            alignSelf: "flex-end",
          }}
        >
          {loading ? "Scanning…" : "Run discovery scan"}
        </button>
      </div>

      {loading ? (
        <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--govai-text-tertiary)" }} aria-live="polite">
          Scanning repository...
        </p>
      ) : null}

      {error ? (
        <div
          style={{
            ...panelStyle(),
            borderColor: "rgba(220, 38, 38, 0.35)",
            color: "var(--govai-state-danger)",
          }}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {clientReady && data ? (
        <>
        <div style={panelStyle()}>
          <div style={{ fontSize: 12, color: "var(--govai-text-tertiary)" }}>
            Scan scope: <span style={{ color: "var(--govai-text-secondary)" }}>{data.scanRoot}</span>
          </div>

          {lastScanIso ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--govai-text-tertiary)" }}>
              Last scanned:{" "}
              <span style={{ color: "var(--govai-text-secondary)" }}>
                {formatLocalScanTime(lastScanIso)}
              </span>
            </div>
          ) : null}

          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() =>
                downloadAiDiscoveryJson({
                  scanRoot: data.scanRoot,
                  detections: data.detections,
                  groupedSummary: data.groupedSummary,
                  notes: data.notes,
                })
              }
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--govai-border-faint)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--govai-text-secondary)",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--govai-border-faint)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--govai-text-secondary)",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              Open report
            </button>
          </div>

          {summary ? (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexWrap: "wrap",
                gap: "10px 16px",
                fontSize: 12.5,
                color: "var(--govai-text-secondary)",
                padding: "10px 0",
                borderTop: "1px solid var(--govai-border-faint)",
                borderBottom: "1px solid var(--govai-border-faint)",
              }}
            >
              <span>
                <span style={{ color: "var(--govai-text-tertiary)" }}>Total signals </span>
                <strong style={{ color: "var(--govai-text)" }}>{summary.totalSignals}</strong>
              </span>
              <span>
                <span style={{ color: "var(--govai-text-tertiary)" }}>OpenAI signals </span>
                <strong style={{ color: "var(--govai-text)" }}>{summary.openai}</strong>
              </span>
              <span>
                <span style={{ color: "var(--govai-text-tertiary)" }}>Transformers signals </span>
                <strong style={{ color: "var(--govai-text)" }}>{summary.transformers}</strong>
              </span>
              <span>
                <span style={{ color: "var(--govai-text-tertiary)" }}>Model artifact signals </span>
                <strong style={{ color: "var(--govai-text)" }}>{summary.modelArtifacts}</strong>
              </span>
              {summary.combinedFolders > 0 ? (
                <span>
                  <span style={{ color: "var(--govai-text-tertiary)" }}>Combined signals </span>
                  <strong style={{ color: "var(--govai-text)" }}>{summary.combinedFolders}</strong>
                </span>
              ) : null}
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--govai-text-label)", marginRight: 4 }}>Show:</span>
            <button
              type="button"
              aria-pressed={filters.openai}
              onClick={() => toggleFilter("openai")}
              style={filterChipStyle(filters.openai)}
            >
              OpenAI signals
            </button>
            <button
              type="button"
              aria-pressed={filters.transformers}
              onClick={() => toggleFilter("transformers")}
              style={filterChipStyle(filters.transformers)}
            >
              Transformers signals
            </button>
            <button
              type="button"
              aria-pressed={filters.modelArtifacts}
              onClick={() => toggleFilter("modelArtifacts")}
              style={filterChipStyle(filters.modelArtifacts)}
            >
              Model artifact signals
            </button>
            <button
              type="button"
              aria-pressed={filters.combined}
              onClick={() => toggleFilter("combined")}
              style={filterChipStyle(filters.combined)}
            >
              Combined signals
            </button>
          </div>

          {isEmpty ? (
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--govai-text-secondary)" }}>
              No AI signals detected yet. Run a scan to begin.
            </p>
          ) : null}

          {!isEmpty && filters.combined && combinedBlocks.length > 0 && combinedNote ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--govai-text-secondary)", marginBottom: 8 }}>
                Combined signals by folder
              </div>
              {combinedBlocks.map((block) => (
                <div
                  key={block.folder}
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--govai-border-faint)",
                    background: "rgba(59, 130, 246, 0.06)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 8,
                      color: "var(--govai-text-secondary)",
                    }}
                  >
                    {block.folder}/
                  </div>
                  {block.files.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--govai-text-tertiary)" }}>(no files listed)</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                      {block.files.map((fp) => (
                        <li key={fp} style={{ listStyle: "disc" }}>
                          <AiDiscoveryFilePath path={fp} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 600, color: "var(--govai-text-secondary)" }}>Note: </span>
                    {combinedNote.message}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!isEmpty && !anyFilterOn ? (
            <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>
              Turn on at least one category filter to see grouped results.
            </p>
          ) : null}

          {!isEmpty && anyFilterOn ? (
            <>
              <h2
                style={{
                  marginTop: combinedBlocks.length > 0 && filters.combined ? 22 : 14,
                  marginBottom: 0,
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                Signals in this run
              </h2>

              <div
                style={{
                  fontSize: 11,
                  color: "var(--govai-text-tertiary)",
                  lineHeight: 1.5,
                  marginTop: 10,
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--govai-border-faint)",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--govai-text-secondary)", marginBottom: 4 }}>
                  Signal tiers
                </div>
                <div>
                  <span style={{ color: "var(--govai-text-secondary)" }}>Primary signals:</span> direct OpenAI API
                  signals.
                </div>
                <div style={{ marginTop: 2 }}>
                  <span style={{ color: "var(--govai-text-secondary)" }}>Experimental:</span> Transformers and model
                  artifact filename heuristics.
                </div>
              </div>

              {groupedSignalRows.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 8 }}>
                    Candidates by folder
                  </div>
                  <div style={{ display: "grid", gap: 14 }}>
                    {groupedSignalRows.map((group) => (
                      <div key={group.groupKey}>
                        <div
                          style={{
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--govai-text-secondary)",
                            marginBottom: 8,
                            wordBreak: "break-all",
                          }}
                        >
                          {group.displayDir === "." ? "." : `${group.displayDir}/`}
                        </div>
                        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                          {group.items.map(({ d, index }) => {
                            const rowKey = detectionRowKey(d, index);
                            const busy = confirmingKey === rowKey;
                            const done = confirmedPairKeys.has(
                              confirmationPairKey(d.type, d.file)
                            );
                            return (
                              <li
                                key={rowKey}
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "flex-start",
                                  gap: 10,
                                  padding: "8px 10px",
                                  borderRadius: 6,
                                  border: "1px solid var(--govai-border-faint)",
                                  fontSize: 12.5,
                                }}
                              >
                                <div style={{ flex: "1 1 200px", minWidth: 0, display: "grid", gap: 4 }}>
                                  <div>
                                    <span style={{ color: "var(--govai-text-secondary)" }}>
                                      {signalTypeLabel(d.type)}
                                    </span>
                                    <span style={{ color: "var(--govai-text-tertiary)" }}> · </span>
                                    <AiDiscoveryFilePath path={d.file} />
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--govai-text-tertiary)" }}>
                                    Signal: {d.signal}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-end",
                                    gap: 6,
                                    flexShrink: 0,
                                  }}
                                >
                                  {done ? (
                                    <>
                                      <span style={{ fontSize: 12, color: "var(--govai-state-success)" }}>Saved as candidate</span>
                                      <span style={{ fontSize: 11, color: "var(--govai-text-tertiary)", maxWidth: 220, textAlign: "right" }}>
                                        Recorded for follow-up outside this view.
                                      </span>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void confirmDetection(d, index)}
                                      style={{
                                        padding: "6px 12px",
                                        borderRadius: 7,
                                        border: "1px solid var(--govai-border-faint)",
                                        background: "rgba(255,255,255,0.04)",
                                        color: "var(--govai-text)",
                                        fontSize: 12,
                                        cursor: busy ? "wait" : "pointer",
                                      }}
                                    >
                                      {busy ? "…" : "Create AI system candidate"}
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {filters.openai ? (
                <>
                  <h3 style={{ marginTop: 20, marginBottom: 4, fontSize: 13, fontWeight: 600, color: "var(--govai-text-secondary)" }}>
                    Primary signals
                  </h3>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                    OpenAI signals ({counts.openai})
                  </div>
                  <FileListInteractive paths={data.groupedSummary.highConfidence.openai.files} />
                </>
              ) : null}

              {filters.transformers || filters.modelArtifacts ? (
                <h3 style={{ marginTop: 20, marginBottom: 4, fontSize: 13, fontWeight: 600, color: "var(--govai-text-secondary)" }}>
                  Experimental
                </h3>
              ) : null}

              {filters.transformers ? (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                    Transformers signals ({counts.transformers})
                  </div>
                  <FileListInteractive paths={data.groupedSummary.experimental.transformers.files} />
                </>
              ) : null}

              {filters.modelArtifacts ? (
                <>
                  <div style={{ marginTop: filters.transformers ? 12 : 0, fontSize: 12.5, fontWeight: 500 }}>
                    Model artifact signals ({counts.modelArtifacts})
                  </div>
                  <FileListInteractive paths={data.groupedSummary.experimental.modelArtifacts.files} />
                </>
              ) : null}
            </>
          ) : null}

          <p style={{ marginTop: 18, fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.5 }}>
            Model artifact signal paths are inferred from filenames only (no file contents read).
          </p>
        </div>
        <AiDiscoveryReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          scanRoot={data.scanRoot}
          lastScanIso={lastScanIso}
          discovery={{
            detections: data.detections,
            groupedSummary: data.groupedSummary,
            notes: data.notes,
          }}
        />
        </>
      ) : null}

      {clientReady && !data && !error && !loading ? (
        <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>
          Run a discovery scan below to capture signals for this repository path.
        </p>
      ) : null}

      <div style={{ ...panelStyle(), marginTop: 24 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>AI system candidates</h2>
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
          Promote individual signals to tracked candidates (in-memory on this server). Use for hand-off to review or
          monitoring outside this page.
        </p>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
          In-memory only: candidates are cleared when the server process restarts (no persistence yet).
        </p>
        {confirmedListError ? (
          <p style={{ fontSize: 12.5, color: "var(--govai-state-danger)" }}>{confirmedListError}</p>
        ) : confirmedSystems.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>
            None yet. Add candidates from the signals above after you run a scan.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {confirmedSystems.map((c) => (
              <li
                key={c.id}
                style={{
                  fontSize: 12.5,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--govai-border-faint)",
                  display: "grid",
                  gap: 4,
                }}
              >
                <div>
                  <span style={{ color: "var(--govai-text-tertiary)" }}>File</span>{" "}
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-all" }}>{c.file}</span>
                </div>
                <div>
                  <span style={{ color: "var(--govai-text-tertiary)" }}>Type</span> {c.detectionType}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--govai-text-tertiary)" }}>
                  {c.createdAt}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p
        style={{
          marginTop: 28,
          fontSize: 11,
          color: "var(--govai-text-tertiary)",
          lineHeight: 1.45,
        }}
      >
        Signal-based detection. No compliance conclusions.
      </p>
    </div>
    <AiDiscoveryScanReviewModal
      open={reviewModalOpen}
      scan={reviewModalScan}
      onClose={() => {
        setReviewModalOpen(false);
        setReviewModalScan(null);
      }}
      onSaved={bumpDiscoveryData}
    />
    </>
  );
}
