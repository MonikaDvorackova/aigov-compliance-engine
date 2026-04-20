"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

import type { StoredDiscoveryScan } from "@/lib/ai-discovery/scanHistoryTypes";
import type { DiscoveryScanDecision, DiscoveryScanReviewStatus } from "@/lib/ai-discovery/scanReviewTypes";

type Props = {
  open: boolean;
  scan: StoredDiscoveryScan | null;
  onClose: () => void;
  onSaved: () => void;
};

function backdropStyle(): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 85,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px 16px",
    overflow: "auto",
  };
}

export function AiDiscoveryScanReviewModal({ open, scan, onClose, onSaved }: Props) {
  const [reviewStatus, setReviewStatus] = useState<DiscoveryScanReviewStatus>("unreviewed");
  const [decision, setDecision] = useState<DiscoveryScanDecision | "">("");
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scan || !open) return;
    setReviewStatus(scan.reviewStatus);
    setDecision(scan.decision ?? "");
    setReviewNote(scan.reviewNote ?? "");
    setError(null);
  }, [scan, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const save = useCallback(async () => {
    if (!scan) return;
    setSaving(true);
    setError(null);
    try {
      const body: {
        reviewStatus: DiscoveryScanReviewStatus;
        reviewNote: string | null;
        decision?: DiscoveryScanDecision | null;
      } = {
        reviewStatus,
        reviewNote: reviewNote.trim() === "" ? null : reviewNote.trim(),
      };
      if (reviewStatus !== "unreviewed") {
        body.decision = decision === "" ? null : (decision as DiscoveryScanDecision);
      }
      const res = await fetch(`/api/ai-discovery/history/${encodeURIComponent(scan.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setError(json.message ?? "Could not save review.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not save review.");
    } finally {
      setSaving(false);
    }
  }, [scan, reviewStatus, decision, reviewNote, onClose, onSaved]);

  if (!open || !scan) return null;

  return (
    <div
      role="presentation"
      style={backdropStyle()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-discovery-review-title"
        style={{
          width: "100%",
          maxWidth: 440,
          marginBottom: 24,
          borderRadius: 10,
          border: "1px solid var(--govai-border-faint)",
          background: "var(--govai-bg-app)",
          color: "var(--govai-text)",
          padding: 18,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ai-discovery-review-title" style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>
          Review scan
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--govai-text-tertiary)" }}>
          {scan.scanRoot} ·{" "}
          {(() => {
            try {
              return new Date(scan.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              });
            } catch {
              return scan.createdAt;
            }
          })()}
        </p>

        <label style={{ display: "block", marginBottom: 10, fontSize: 12 }}>
          <span style={{ color: "var(--govai-text-label)", display: "block", marginBottom: 4 }}>Status</span>
          <select
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value as DiscoveryScanReviewStatus)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--govai-border-faint)",
              background: "var(--govai-bg-app)",
              color: "var(--govai-text)",
              fontSize: 13,
            }}
          >
            <option value="unreviewed">Unreviewed</option>
            <option value="reviewed">Reviewed</option>
            <option value="needs_follow_up">Needs follow-up</option>
          </select>
        </label>

        {reviewStatus !== "unreviewed" ? (
          <label style={{ display: "block", marginBottom: 10, fontSize: 12 }}>
            <span style={{ color: "var(--govai-text-label)", display: "block", marginBottom: 4 }}>Decision</span>
            <select
              value={decision}
              onChange={(e) =>
                setDecision(e.target.value as DiscoveryScanDecision | "")
              }
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--govai-border-faint)",
                background: "var(--govai-bg-app)",
                color: "var(--govai-text)",
                fontSize: 13,
              }}
            >
              <option value="">(none)</option>
              <option value="informational">Informational</option>
              <option value="needs_follow_up">Needs follow-up</option>
              <option value="confirmed_local_model_signal">Confirmed local model signal</option>
            </select>
          </label>
        ) : null}

        <label style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
          <span style={{ color: "var(--govai-text-label)", display: "block", marginBottom: 4 }}>Note</span>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--govai-border-faint)",
              background: "var(--govai-bg-app)",
              color: "var(--govai-text)",
              fontSize: 13,
              resize: "vertical",
            }}
          />
        </label>

        {error ? (
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--govai-state-danger)" }}>{error}</p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--govai-border-faint)",
              background: "transparent",
              color: "var(--govai-text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "var(--govai-accent-muted)",
              color: "var(--govai-text-primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.75 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
