"use client";

import React from "react";
import AigovMark from "../components/brand/AigovMark";

type Props = {
  children: React.ReactNode;
  maxWidth?: number;
  align?: "start" | "center";
  padding?: number;
  /** Page chrome only. Defaults to solid app background. */
  background?: string;
};

export default function InfraShell({
  children,
  maxWidth = 980,
  align = "start",
  padding = 22,
  background = "var(--govai-bg-app)",
}: Props) {
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: `${padding}px 16px 28px`,
    display: "grid",
    placeItems: align === "center" ? "center" : "start center",
    color: "var(--govai-text)",
    background,
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

export function InfraPanel({
  children,
  padding = 20,
  borderRadius = 20,
  marginTop = 12,
}: {
  children: React.ReactNode;
  padding?: number;
  borderRadius?: number;
  marginTop?: number;
}) {
  return (
    <section
      style={{
        marginTop,
        borderRadius,
        border: "1px solid var(--govai-border-faint)",
        background: "var(--govai-bg-elevated)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        padding,
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
        borderRadius: 18,
        border: "1px solid var(--govai-border-faint)",
        background: "var(--govai-bg-card2)",
        padding: "16px 14px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
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
    border: "1px solid var(--govai-border-subtle)",
    background: variant === "soft" ? "var(--govai-bg-panel)" : "var(--govai-bg-elevated)",
    color: "var(--govai-text)",
    textDecoration: "none",
    fontSize: 17,
    fontWeight: 600,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
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
  const iconSize = size === "xl" ? 34 : size === "lg" ? 30 : 26;
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
    background: "radial-gradient(220px 90px at 50% 60%, rgba(255,255,255,0.04), rgba(0,0,0,0))",
    border: "1px solid var(--govai-border-faint)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
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
      <AigovMark
        isRunning={isRunning}
        animationMode={isRunning ? "assemble" : "static"}
        size={iconSize}
        glow={false}
        neon={false}
        tone="steel"
        style={{ display: "block" }}
      />
    </a>
  );
}