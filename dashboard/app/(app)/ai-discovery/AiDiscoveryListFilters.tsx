"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "flex-end",
  marginBottom: 16,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--govai-border-faint)",
  background: "rgba(255,255,255,0.02)",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 10,
  color: "var(--govai-text-label)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--govai-border-faint)",
  background: "var(--govai-bg-app)",
  color: "var(--govai-text)",
  fontSize: 12.5,
  minWidth: 0,
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  paddingRight: 24,
  cursor: "pointer",
};

const DEBOUNCE_MS = 350;

export function AiDiscoveryListFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const applyPatch = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      const q = sp.toString();
      router.replace(q ? `/ai-discovery?${q}` : "/ai-discovery", { scroll: false });
    },
    [router, searchParams]
  );

  const exactTarget = searchParams.get("target")?.trim() ?? "";
  const targetQueryFromUrl = searchParams.get("targetQuery") ?? "";
  const [targetQueryDraft, setTargetQueryDraft] = useState(targetQueryFromUrl);
  const targetQueryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTargetQueryDraft(targetQueryFromUrl);
  }, [targetQueryFromUrl]);

  useEffect(() => {
    return () => {
      if (targetQueryDebounceRef.current) clearTimeout(targetQueryDebounceRef.current);
    };
  }, []);

  const flushTargetQuery = useCallback(
    (value: string) => {
      const t = value.trim();
      applyPatch({ targetQuery: t || null });
    },
    [applyPatch]
  );

  const onTargetQueryChange = useCallback(
    (value: string) => {
      setTargetQueryDraft(value);
      if (targetQueryDebounceRef.current) clearTimeout(targetQueryDebounceRef.current);
      targetQueryDebounceRef.current = setTimeout(() => {
        flushTargetQuery(value);
        targetQueryDebounceRef.current = null;
      }, DEBOUNCE_MS);
    },
    [flushTargetQuery]
  );

  const reviewStatus = searchParams.get("reviewStatus") ?? "";
  const alertStatus = searchParams.get("alertStatus") ?? "";
  const hasOpenChanges = searchParams.get("hasOpenChanges") === "true";
  const triggerType = searchParams.get("triggerType") ?? "";
  const sortInbox = searchParams.get("sortInbox") ?? "";
  const sortTargets = searchParams.get("sortTargets") ?? "";
  const sortHistory = searchParams.get("sortHistory") ?? "";

  return (
    <div>
      {exactTarget ? (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--govai-border-default)",
            background: "var(--govai-bg-surface-2)",
            fontSize: 12,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <span style={{ color: "var(--govai-text-secondary)" }}>
            Exact target (from navigation):{" "}
            <code style={{ fontSize: 11 }}>{exactTarget}</code>
          </span>
          <button
            type="button"
            onClick={() => applyPatch({ target: null })}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--govai-border-faint)",
              background: "rgba(255,255,255,0.06)",
              color: "var(--govai-text-secondary)",
              fontSize: 11.5,
              cursor: "pointer",
            }}
          >
            Clear exact filter
          </button>
        </div>
      ) : null}

      <div style={rowStyle}>
        <label style={{ ...labelStyle, flex: "1 1 180px" }}>
          Search targets (contains)
          <input
            type="search"
            value={targetQueryDraft}
            onChange={(e) => onTargetQueryChange(e.target.value)}
            onBlur={() => flushTargetQuery(targetQueryDraft)}
            placeholder="Substring; does not affect ?target= links"
            autoComplete="off"
            style={{ ...inputStyle, width: "100%" }}
          />
        </label>

        <label style={labelStyle}>
          Review
          <select
            value={reviewStatus}
            onChange={(e) => applyPatch({ reviewStatus: e.target.value || null })}
            style={selectStyle}
          >
            <option value="">Any</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="reviewed">Reviewed</option>
            <option value="needs_follow_up">Needs follow-up</option>
          </select>
        </label>

        <label style={labelStyle}>
          Alert
          <select
            value={alertStatus}
            onChange={(e) => applyPatch({ alertStatus: e.target.value || null })}
            style={selectStyle}
          >
            <option value="">Any</option>
            <option value="none">None</option>
            <option value="not_attempted">Not attempted</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--govai-text-secondary)",
            cursor: "pointer",
            userSelect: "none",
            paddingBottom: 2,
          }}
        >
          <input
            type="checkbox"
            checked={hasOpenChanges}
            onChange={(e) =>
              applyPatch({ hasOpenChanges: e.target.checked ? "true" : null })
            }
          />
          Open changes only
        </label>

        <label style={labelStyle}>
          Trigger (history)
          <select
            value={triggerType}
            onChange={(e) => applyPatch({ triggerType: e.target.value || null })}
            style={selectStyle}
          >
            <option value="">Any</option>
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </label>

        <label style={labelStyle}>
          Sort · inbox
          <select
            value={sortInbox || "lastScanAt_desc"}
            onChange={(e) =>
              applyPatch({
                sortInbox: e.target.value === "lastScanAt_desc" ? null : e.target.value,
              })
            }
            style={selectStyle}
          >
            <option value="lastScanAt_desc">Last scan · newest</option>
            <option value="lastScanAt_asc">Last scan · oldest</option>
          </select>
        </label>

        <label style={labelStyle}>
          Sort · targets
          <select
            value={sortTargets || "lastScanAt_desc"}
            onChange={(e) =>
              applyPatch({
                sortTargets: e.target.value === "lastScanAt_desc" ? null : e.target.value,
              })
            }
            style={selectStyle}
          >
            <option value="lastScanAt_desc">Last scan · newest</option>
            <option value="lastScanAt_asc">Last scan · oldest</option>
            <option value="openChanges_desc">Open changes first</option>
          </select>
        </label>

        <label style={labelStyle}>
          Sort · history
          <select
            value={sortHistory || "createdAt_desc"}
            onChange={(e) =>
              applyPatch({
                sortHistory: e.target.value === "createdAt_desc" ? null : e.target.value,
              })
            }
            style={selectStyle}
          >
            <option value="createdAt_desc">Run time · newest</option>
            <option value="createdAt_asc">Run time · oldest</option>
          </select>
        </label>
      </div>
    </div>
  );
}
