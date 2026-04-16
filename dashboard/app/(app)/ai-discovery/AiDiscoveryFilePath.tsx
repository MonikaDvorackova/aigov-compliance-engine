"use client";

import type { CSSProperties, MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { buildAiDiscoveryFileUrl } from "@/lib/ai-discovery/fileBaseUrl";

const COPIED_MS = 1500;

const linkStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12.5,
  wordBreak: "break-all",
  color: "var(--govai-text)",
  textDecoration: "underline",
  textDecorationColor: "transparent",
  cursor: "pointer",
  background: "none",
  border: "none",
  padding: 0,
  textAlign: "left",
  flex: "1 1 140px",
  minWidth: 0,
};

function setUnderline(e: MouseEvent<HTMLElement>, on: boolean): void {
  e.currentTarget.style.textDecorationColor = on
    ? "rgba(255, 255, 255, 0.35)"
    : "transparent";
}

type Props = {
  path: string;
};

/**
 * Opens the file at `NEXT_PUBLIC_AI_DISCOVERY_FILES_BASE` + path when set (e.g. GitHub blob URL prefix).
 * Otherwise copies the path on click (`joinRepoBlobUrl` — segments encoded, slashes preserved).
 */
export function AiDiscoveryFilePath({ path: p }: Props) {
  const [copied, setCopied] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const flashCopied = useCallback(() => {
    setCopied(true);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setCopied(false);
      clearTimer.current = null;
    }, COPIED_MS);
  }, []);

  const href = buildAiDiscoveryFileUrl(p);

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...linkStyle, width: "100%" }}
        title="Open in repository"
        onMouseEnter={(e) => setUnderline(e, true)}
        onMouseLeave={(e) => setUnderline(e, false)}
      >
        {p}
      </a>
    );
  }

  return (
    <span
      style={{
        display: "flex",
        alignItems: "baseline",
        flexWrap: "wrap",
        gap: 8,
        width: "100%",
      }}
    >
      <button
        type="button"
        style={linkStyle}
        title="Copy path"
        onMouseEnter={(e) => setUnderline(e, true)}
        onMouseLeave={(e) => setUnderline(e, false)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(p);
            flashCopied();
          } catch {
            // ignore
          }
        }}
      >
        {p}
      </button>
      {copied ? (
        <span
          style={{ fontSize: 11, color: "var(--govai-state-success)", flexShrink: 0 }}
          aria-live="polite"
        >
          Copied
        </span>
      ) : null}
    </span>
  );
}
