import type { CSSProperties, ReactNode } from "react";

export function Panel({
  children,
  style,
  className,
}: {
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

type BadgeKind = "ok" | "error" | "neutral" | "issue";

export function Badge({
  kind,
  children,
  style,
}: {
  kind: BadgeKind;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span data-badge-kind={kind} style={style}>
      {children}
    </span>
  );
}

export function InlineMono({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function KeyValueRow({
  label,
  value,
  borderTop = true,
  mono: _mono,
}: {
  label: ReactNode;
  value: ReactNode;
  borderTop?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        justifyContent: "space-between",
        padding: "6px 0",
        borderTop: borderTop ? "1px solid var(--govai-border-faint)" : undefined,
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--govai-text-label)" }}>{label}</span>
      <span style={{ textAlign: "right", color: "var(--govai-text-secondary)" }}>{value}</span>
    </div>
  );
}

export function DownloadLink({ label, href }: { label: string; href?: string | null }) {
  if (!href) {
    return <span style={{ fontSize: 12, color: "var(--govai-text-tertiary)" }}>{label} (unavailable)</span>;
  }
  return (
    <a className="govai-link text-[13px]" href={href} rel="noreferrer">
      {label}
    </a>
  );
}
