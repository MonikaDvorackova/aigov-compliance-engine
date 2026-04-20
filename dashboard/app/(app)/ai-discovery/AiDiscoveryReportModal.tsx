"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";

import { buildCombinedSignalFolderBlocks } from "@/lib/ai-discovery/combinedSignalBlocks";
import type {
  AIDetection,
  DiscoveryGroupedSummary,
  DiscoveryNote,
} from "@/lib/ai-discovery/apiTypes";

const sectionTitle: CSSProperties = {
  marginTop: 18,
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--govai-text-secondary)",
};

const mono: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12.5,
  wordBreak: "break-all",
};

function formatLocal(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  scanRoot: string;
  lastScanIso: string | null;
  discovery: {
    detections: AIDetection[];
    groupedSummary: DiscoveryGroupedSummary;
    notes: DiscoveryNote[];
  };
};

export function AiDiscoveryReportModal({
  open,
  onClose,
  scanRoot,
  lastScanIso,
  discovery,
}: Props) {
  const combinedBlocks = useMemo(
    () => buildCombinedSignalFolderBlocks(discovery.groupedSummary, discovery.notes),
    [discovery.groupedSummary, discovery.notes]
  );

  const combinedNote = useMemo(
    () => discovery.notes.find((n) => n.code === "combined_local_inference") ?? null,
    [discovery.notes]
  );

  const counts = useMemo(
    () => ({
      totalSignals: discovery.detections.length,
      openai: discovery.groupedSummary.highConfidence.openai.files.length,
      transformers: discovery.groupedSummary.experimental.transformers.files.length,
      modelArtifacts: discovery.groupedSummary.experimental.modelArtifacts.files.length,
      combinedFolders: combinedBlocks.length,
    }),
    [discovery.detections.length, discovery.groupedSummary, combinedBlocks.length]
  );

  const g = discovery.groupedSummary;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ai-discovery-report-modal__backdrop"
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 16px",
        overflow: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ai-discovery-report-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-discovery-report-title"
        style={{
          width: "100%",
          maxWidth: 640,
          marginBottom: 24,
          borderRadius: 10,
          border: "1px solid var(--govai-border-faint)",
          background: "var(--govai-bg-app)",
          color: "var(--govai-text)",
          padding: 20,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 id="ai-discovery-report-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            AI Discovery Report
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid var(--govai-border-faint)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--govai-text-secondary)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>
          Scan scope: <span style={{ color: "var(--govai-text-secondary)" }}>{scanRoot}</span>
        </p>
        {lastScanIso ? (
          <p style={{ marginTop: 6, fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>
            Last scanned:{" "}
            <span style={{ color: "var(--govai-text-secondary)" }}>{formatLocal(lastScanIso)}</span>
          </p>
        ) : null}

        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 16px",
            fontSize: 12.5,
            color: "var(--govai-text-secondary)",
            padding: "12px 0",
            borderTop: "1px solid var(--govai-border-faint)",
            borderBottom: "1px solid var(--govai-border-faint)",
          }}
        >
          <span>
            <span style={{ color: "var(--govai-text-tertiary)" }}>Total signals </span>
            <strong style={{ color: "var(--govai-text)" }}>{counts.totalSignals}</strong>
          </span>
          <span>
            <span style={{ color: "var(--govai-text-tertiary)" }}>OpenAI signals </span>
            <strong style={{ color: "var(--govai-text)" }}>{counts.openai}</strong>
          </span>
          <span>
            <span style={{ color: "var(--govai-text-tertiary)" }}>Transformers signals </span>
            <strong style={{ color: "var(--govai-text)" }}>{counts.transformers}</strong>
          </span>
          <span>
            <span style={{ color: "var(--govai-text-tertiary)" }}>Model artifact signals </span>
            <strong style={{ color: "var(--govai-text)" }}>{counts.modelArtifacts}</strong>
          </span>
          {counts.combinedFolders > 0 ? (
            <span>
              <span style={{ color: "var(--govai-text-tertiary)" }}>Combined signals </span>
              <strong style={{ color: "var(--govai-text)" }}>{counts.combinedFolders}</strong>
            </span>
          ) : null}
        </div>

        <h3 style={{ ...sectionTitle, marginTop: 20 }}>OpenAI signals</h3>
        <FileList paths={g.highConfidence.openai.files} />

        <h3 style={sectionTitle}>Transformers signals</h3>
        <FileList paths={g.experimental.transformers.files} />

        <h3 style={sectionTitle}>Model artifact signals</h3>
        <FileList paths={g.experimental.modelArtifacts.files} />

        {combinedBlocks.length > 0 && combinedNote ? (
          <>
            <h3 style={sectionTitle}>Combined signals</h3>
            {combinedBlocks.map((block) => (
              <div
                key={block.folder}
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--govai-border-faint)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ ...mono, fontWeight: 600, marginBottom: 6 }}>{block.folder}/</div>
                <FileList paths={block.files} />
                <p style={{ marginTop: 8, fontSize: 11.5, color: "var(--govai-text-tertiary)" }}>
                  <strong style={{ color: "var(--govai-text-secondary)" }}>Note: </strong>
                  {combinedNote.message}
                </p>
              </div>
            ))}
          </>
        ) : null}

        <p style={{ marginTop: 22, fontSize: 11.5, color: "var(--govai-text-tertiary)", lineHeight: 1.5 }}>
          Signal-based detection. No compliance conclusions.
        </p>
      </div>
    </div>
  );
}

function FileList({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--govai-text-tertiary)" }}>(none)</div>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
      {paths.map((p) => (
        <li key={p} style={{ ...mono, listStyle: "disc" }}>
          {p}
        </li>
      ))}
    </ul>
  );
}
