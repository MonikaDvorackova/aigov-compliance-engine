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