"use client";

import React from "react";
import AigovMark from "./brand/AigovMark";

export type LogoProps = {
  /** Homepage / login hero mark (default 30) */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/** GovAI mark — same treatment as the public homepage hero */
export default function Logo({ size = 30, className, style }: LogoProps) {
  return (
    <span className={className} style={{ display: "inline-flex", lineHeight: 0, ...style }}>
      <AigovMark size={size} glow={false} neon={false} neonStrength="off" tone="steel" isRunning={false} />
    </span>
  );
}
