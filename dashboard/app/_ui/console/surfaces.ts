import type { CSSProperties } from "react";

/** Vertical rhythm between major console blocks */
export const consoleGap = {
  afterHeader: 28,
  afterSummary: 24,
  afterPrimary: 28,
  secondaryGrid: 16,
} as const;

export function surfacePanel(): CSSProperties {
  return {
    borderRadius: 12,
    border: "1px solid var(--govai-border-faint)",
    background: "var(--govai-bg-elevated)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
  };
}

/** Primary operational / register cards (ledger, policy register, audit table). */
export function primaryCardOuter(): CSSProperties {
  return {
    border: "1px solid var(--govai-border-faint)",
    borderRadius: 14,
    overflow: "hidden",
    background: "var(--govai-bg-elevated)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
  };
}

export function primaryCardTopBar(): CSSProperties {
  return {
    padding: "14px 18px",
    borderBottom: "1px solid var(--govai-border-faint)",
  };
}

/** Supporting panels (Runs page only)—lower elevation so the ledger stays dominant. */
export function supportingPanelOuter(): CSSProperties {
  return {
    borderRadius: 10,
    border: "1px solid var(--govai-border-faint)",
    background: "var(--govai-bg-panel)",
    boxShadow: "none",
  };
}

export function panelHeaderStyle(): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--govai-text-label)",
    marginBottom: 12,
  };
}

export function primaryCardEyebrow(): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--govai-text-label)",
    marginBottom: 2,
  };
}

export function primaryCardDescription(): CSSProperties {
  return {
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--govai-text-tertiary)",
  };
}

export function supportingPanelTitle(): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    color: "var(--govai-text-label)",
    marginBottom: 8,
    opacity: 0.92,
  };
}

export function pageTitleStyle(): CSSProperties {
  return {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: 1.2,
    color: "var(--govai-text)",
  };
}

export function pageLeadStyle(): CSSProperties {
  return {
    marginTop: 8,
    maxWidth: 560,
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--govai-text-secondary)",
  };
}

/** Padded elevated panel (cards on run detail, compliance panel). */
export function consoleElevatedPanelStyle(): CSSProperties {
  return {
    borderRadius: 12,
    border: "1px solid var(--govai-border-faint)",
    background: "var(--govai-bg-elevated)",
    padding: 16,
    boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
  };
}

export function sectionTitleStyle(): CSSProperties {
  return {
    fontWeight: 600,
    fontSize: 15,
    marginBottom: 10,
    letterSpacing: "-0.02em",
    color: "var(--govai-text)",
  };
}

export function sectionKickerStyle(): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 500,
    color: "var(--govai-text-label)",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: 8,
  };
}

export function kvRowStyle(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: 10,
    alignItems: "baseline",
    padding: "8px 0",
    borderTop: "1px solid var(--govai-border-faint)",
  };
}

export function kvKeyStyle(): CSSProperties {
  return {
    fontSize: 12,
    color: "var(--govai-text-label)",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    fontWeight: 500,
  };
}

export function kvValStyle(): CSSProperties {
  return {
    fontSize: 14,
    color: "var(--govai-text-secondary)",
    wordBreak: "break-word",
  };
}

export function monoStyle(): CSSProperties {
  return {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    wordBreak: "break-all",
    color: "var(--govai-text)",
  };
}

export function badgeToneStyle(kind: "neutral" | "ok" | "issue" | "error"): CSSProperties {
  const border =
    kind === "ok"
      ? "1px solid var(--govai-badge-ok-border)"
      : kind === "issue"
        ? "1px solid var(--govai-badge-issue-border)"
        : kind === "error"
          ? "1px solid var(--govai-badge-error-border)"
          : "1px solid var(--govai-badge-neutral-border)";

  const bg =
    kind === "ok"
      ? "var(--govai-badge-ok-bg)"
      : kind === "issue"
        ? "var(--govai-badge-issue-bg)"
        : kind === "error"
          ? "var(--govai-badge-error-bg)"
          : "var(--govai-badge-neutral-bg)";

  const color =
    kind === "ok"
      ? "var(--govai-state-success)"
      : kind === "issue"
        ? "var(--govai-state-warning)"
        : kind === "error"
          ? "var(--govai-state-danger)"
          : "var(--govai-text-muted)";

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 3,
    border,
    background: bg,
    fontSize: 10.5,
    fontWeight: 500,
    lineHeight: "15px",
    letterSpacing: "0.04em",
    color,
    opacity: kind === "neutral" ? 1 : 0.9,
    whiteSpace: "nowrap",
  };
}

export function checkRowContainerStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--govai-border-faint)",
    background: "rgba(255,255,255,0.02)",
    fontSize: 13,
  };
}

/** Inline / block links for raw endpoints and artifacts — neutral text, no hue. */
export function artifactLinkStyle(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--govai-border-faint)",
    background: "transparent",
    marginRight: 10,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "underline",
    textUnderlineOffset: 3,
    textDecorationColor: "var(--govai-link-decoration)",
    color: "var(--govai-link)",
  };
}

export function accentLinkBlockStyle(): CSSProperties {
  return {
    display: "block",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--govai-border-faint)",
    background: "transparent",
    textDecoration: "underline",
    textUnderlineOffset: 3,
    textDecorationColor: "var(--govai-link-decoration)",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--govai-link)",
  };
}

/** Console inline links — same neutral treatment as `.govai-link`. */
export function consoleLinkStyle(): CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--govai-link)",
    textDecoration: "underline",
    textDecorationColor: "var(--govai-link-decoration)",
    textUnderlineOffset: 3,
  };
}

export function tableThStyle(): CSSProperties {
  return {
    padding: "11px 14px",
    textAlign: "left",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--govai-text-label)",
  };
}

export function tableHeadRowStyle(): CSSProperties {
  return {
    background: "var(--govai-bg-table-head)",
    borderBottom: "1px solid var(--govai-border-faint)",
  };
}

export function emptyStateBodyStyle(): CSSProperties {
  return {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--govai-text-secondary)",
  };
}
