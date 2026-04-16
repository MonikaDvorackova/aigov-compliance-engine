import type { CSSProperties, ReactNode } from "react";
import {
  accentLinkBlockStyle,
  badgeToneStyle,
  checkRowContainerStyle,
  consoleElevatedPanelStyle,
  consoleGap,
  kvKeyStyle,
  kvRowStyle,
  kvValStyle,
  monoStyle,
  sectionKickerStyle,
  sectionTitleStyle,
  surfacePanel,
} from "./surfaces";

export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...consoleElevatedPanelStyle(), ...style }}>{children}</div>;
}

type SectionHeaderProps = {
  kicker?: string;
  title?: ReactNode;
  /** Replaces default title row when set (e.g. title + mark side by side). */
  titleRow?: ReactNode;
  children?: ReactNode;
};

export function SectionHeader({ kicker, title, titleRow, children }: SectionHeaderProps) {
  return (
    <div>
      {kicker ? <div style={sectionKickerStyle()}>{kicker}</div> : null}
      {titleRow ?? (title != null ? <div style={sectionTitleStyle()}>{title}</div> : null)}
      {children}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  style?: CSSProperties;
};

/** Summary metric tile (ledger stats). */
export function StatCard({ label, value, hint, style }: StatCardProps) {
  return (
    <div
      style={{
        ...surfacePanel(),
        flex: "1 1 120px",
        minWidth: 120,
        maxWidth: 200,
        padding: "16px 18px",
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--govai-text-label)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          color: "var(--govai-text)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4, color: "var(--govai-text-tertiary)" }}>{hint}</div>
      ) : null}
    </div>
  );
}

type BadgeProps = {
  kind?: "neutral" | "ok" | "issue" | "error";
  children: ReactNode;
  style?: CSSProperties;
};

export function Badge({ kind = "neutral", children, style }: BadgeProps) {
  return <span style={{ ...badgeToneStyle(kind), ...style }}>{children}</span>;
}

type KeyValueRowProps = {
  label: string;
  value: ReactNode;
  mono?: boolean;
  borderTop?: boolean;
};

export function KeyValueRow({ label, value, mono = false, borderTop = true }: KeyValueRowProps) {
  return (
    <div style={{ ...kvRowStyle(), borderTop: borderTop ? kvRowStyle().borderTop : "none" }}>
      <div style={kvKeyStyle()}>{label}</div>
      <div style={{ ...kvValStyle(), ...(mono ? monoStyle() : {}) }}>{value}</div>
    </div>
  );
}

const gapMap: Record<keyof typeof consoleGap, number> = {
  afterHeader: consoleGap.afterHeader,
  afterSummary: consoleGap.afterSummary,
  afterPrimary: consoleGap.afterPrimary,
  secondaryGrid: consoleGap.secondaryGrid,
};

type PageSectionProps = {
  children: ReactNode;
  /** Which vertical rhythm token to use as margin-bottom. */
  margin?: keyof typeof consoleGap;
  style?: CSSProperties;
};

export function PageSection({ children, margin = "afterPrimary", style }: PageSectionProps) {
  return <section style={{ marginBottom: gapMap[margin], ...style }}>{children}</section>;
}

type DataBlockProps = {
  label: string;
  value: string | null;
};

/** Monospace hash / fingerprint block. */
export function DataBlock({ label, value }: DataBlockProps) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, color: "var(--govai-text-secondary)", marginBottom: 6 }}>{label}</div>
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid var(--govai-border-faint)",
          background: "rgba(0,0,0,0.2)",
          ...monoStyle(),
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

type CheckRowProps = {
  label: string;
  ok: boolean;
  detail: string;
};

export function CheckRow({ label, ok, detail }: CheckRowProps) {
  return (
    <div style={checkRowContainerStyle()}>
      <div style={{ fontWeight: 600, color: "var(--govai-text)" }}>{label}</div>
      <div style={{ color: ok ? "var(--govai-text-secondary)" : "var(--govai-text-tertiary)" }}>{detail}</div>
    </div>
  );
}

type DownloadLinkProps = {
  label: string;
  href: string | null | undefined;
};

export function DownloadLink({ label, href }: DownloadLinkProps) {
  if (!href) {
    return (
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--govai-border-faint)",
          background: "var(--govai-bg-elevated)",
          color: "var(--govai-text-tertiary)",
          fontSize: 13,
        }}
      >
        {label}: unavailable
      </div>
    );
  }

  return (
    <a href={href} style={accentLinkBlockStyle()} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

type AccentAnchorProps = {
  href: string;
  children: ReactNode;
  style?: CSSProperties;
};

export function AccentAnchor({ href, children, style }: AccentAnchorProps) {
  return (
    <a href={href} style={{ ...accentLinkBlockStyle(), ...style }} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function InlineMono({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ ...monoStyle(), ...style }}>{children}</span>;
}
