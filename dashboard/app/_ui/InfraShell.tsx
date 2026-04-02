"use client";

import React from "react";
import AigovMark from "../components/brand/AigovMark";

type Props = {
  children: React.ReactNode;
  maxWidth?: number;
  align?: "start" | "center";
  padding?: number;
};

export default function InfraShell({
  children,
  maxWidth = 980,
  align = "start",
  padding = 22,
}: Props) {
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: `${padding}px 16px 28px`,
    display: "grid",
    placeItems: align === "center" ? "center" : "start center",
    color: "rgba(255,255,255,0.92)",
    background:
      "radial-gradient(1200px 640px at 50% -10%, rgba(255,255,255,0.10), rgba(0,0,0,0))," +
      "radial-gradient(900px 520px at 50% 12%, rgba(29,78,216,0.12), rgba(0,0,0,0))," +
      "linear-gradient(180deg, rgba(9,16,32,1) 0%, rgba(5,9,18,1) 100%)",
  };

  const shellStyle: React.CSSProperties = {
    width: "100%",
    maxWidth,
  };

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>{children}</div>
    </main>
  );
}

export function InfraPanel({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        marginTop: 12,
        borderRadius: 24,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.04)",
        boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
        padding: 20,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {children}
    </section>
  );
}

export function InfraCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.03)",
        padding: "16px 14px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </div>
  );
}

export function InfraButton({
  children,
  href,
  variant = "default",
  fullWidth = false,
  disabled = false,
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "default" | "soft";
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    padding: "0 20px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.18)",
    background: variant === "soft" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.92)",
    textDecoration: "none",
    fontSize: 17,
    fontWeight: 600,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 20px 50px rgba(0,0,0,0.30)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    width: fullWidth ? "100%" : undefined,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    userSelect: "none",
  };

  if (href) {
    return (
      <a href={href} style={base} aria-disabled={disabled}>
        {children}
      </a>
    );
  }

  return (
    <span style={base} aria-disabled={disabled}>
      {children}
    </span>
  );
}

export function InfraHeaderRow({
  left,
  right,
  height = 72,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  height?: number;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height,
        padding: "0 4px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>{left}</div>
      {right ? <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{right}</div> : null}
    </header>
  );
}

export function InfraAigovMark({
  href = "/",
  size = "lg",
  isRunning = false,
  alignY = 0,
}: {
  href?: string;
  size?: "md" | "lg" | "xl";
  isRunning?: boolean;
  alignY?: number;
}) {
  const iconSize = size === "xl" ? 26 : size === "lg" ? 24 : 22;
  const pad = size === "xl" ? "10px 14px" : size === "lg" ? "9px 13px" : "8px 12px";

  const wrap: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
    transform: `translateY(${alignY}px)`,
    padding: pad,
    borderRadius: 20,
    userSelect: "none",
    cursor: "pointer",
    position: "relative",
    transition: "transform 160ms ease, filter 160ms ease",
    background: "radial-gradient(220px 90px at 50% 60%, rgba(59,130,246,0.22), rgba(0,0,0,0))",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(59,130,246,0.06)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  };

  return (
    <a
      href={href}
      aria-label="GovAI"
      style={wrap}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = "brightness(1.12)";
        e.currentTarget.style.transform = `translateY(${alignY}px) scale(1.02)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "none";
        e.currentTarget.style.transform = `translateY(${alignY}px) scale(1)`;
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: -28,
          borderRadius: 30,
          filter: "blur(26px)",
          opacity: 0.95,
          pointerEvents: "none",
          background: "radial-gradient(circle, rgba(96,165,250,0.55) 0%, rgba(59,130,246,0) 65%)",
        }}
      />
      <AigovMark
        isRunning={isRunning}
        size={iconSize}
        glow
        neon
        neonStrength="soft"
        tone="blue"
        style={{ display: "block" }}
      />
    </a>
  );
}