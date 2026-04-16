"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  maxWidth?: number;
  align?: "start" | "center";
  padding?: number;
  /** When set, replaces the default layered shell background. */
  background?: string;
};

type InfraPanelProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export function InfraPanel({ children, style }: InfraPanelProps) {
  const panelStyle: CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(15,23,42,0.72)",
    boxShadow:
      "0 10px 30px rgba(2,6,23,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    ...style,
  };

  return <div style={panelStyle}>{children}</div>;
}

export function InfraShell({
  children,
  maxWidth = 1120,
  align = "center",
  padding = 22,
  background,
}: Props) {
  const defaultBackground =
    "radial-gradient(1200px 640px at 50% -10%, rgba(255,255,255,0.10), rgba(0,0,0,0))," +
    "radial-gradient(900px 520px at 50% 12%, rgba(29,78,216,0.12), rgba(0,0,0,0))," +
    "linear-gradient(180deg, rgba(9,16,32,1) 0%, rgba(5,9,18,1) 100%)";

  const pageStyle: CSSProperties = {
    minHeight: "100vh",
    width: "100%",
    color: "rgba(255,255,255,0.92)",
    background: background ?? defaultBackground,
    display: "flex",
    justifyContent: align === "center" ? "center" : "flex-start",
    padding,
    boxSizing: "border-box",
  };

  const innerStyle: CSSProperties = {
    width: "100%",
    maxWidth,
  };

  return (
    <div style={pageStyle}>
      <div style={innerStyle}>{children}</div>
    </div>
  );
}

export default InfraShell;