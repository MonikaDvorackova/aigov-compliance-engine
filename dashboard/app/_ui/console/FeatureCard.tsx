import type { CSSProperties, ReactNode } from "react";
import { Panel } from "./primitives";
import { primaryCardDescription } from "./surfaces";

export type FeatureCardProps = {
  title: string;
  description: string;
  /** Exactly three capability bullets. */
  bullets: readonly [string, string, string];
  icon?: ReactNode;
  style?: CSSProperties;
};

/**
 * Compact capability card for marketing/landing surfaces.
 * Uses console Panel surface: border-first, minimal elevation.
 */
export default function FeatureCard({ title, description, bullets, icon, style }: FeatureCardProps) {
  return (
    <Panel
      style={{
        padding: "10px 11px 11px",
        boxShadow: "none",
        background: "var(--govai-bg-panel)",
        ...style,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: icon ? "auto 1fr" : "1fr",
          gap: icon ? "8px 10px" : 0,
          alignItems: "start",
        }}
      >
        {icon ? (
          <div
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "1px solid var(--govai-border-faint)",
              background: "rgba(255,255,255,0.03)",
              display: "grid",
              placeItems: "center",
              color: "var(--govai-text-muted)",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        ) : null}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--govai-text)",
              marginBottom: 4,
              lineHeight: 1.25,
            }}
          >
            {title}
          </div>
          <p style={{ ...primaryCardDescription(), margin: 0, marginBottom: 8, fontSize: 12, lineHeight: 1.4 }}>
            {description}
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 16,
              fontSize: 11.5,
              lineHeight: 1.45,
              color: "var(--govai-text-secondary)",
            }}
          >
            {bullets.map((b) => (
              <li key={b} style={{ marginBottom: 2 }}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
