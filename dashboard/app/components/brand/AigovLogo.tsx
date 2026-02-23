"use client";

import React from "react";
import AigovIcon, { type AigovIconProps } from "./AigovIcon";
import AigovWordmark, { type AigovWordmarkProps } from "./AigovWordmark";

export type AigovNeonStrength = "soft" | "strong";

export type AigovLogoProps = {
  iconSize?: number;
  wordWidth?: number;
  wordHeight?: number;
  gap?: number;

  glow?: boolean;
  neon?: boolean;
  neonStrength?: AigovNeonStrength;

  tone?: AigovIconProps["tone"];

  iconProps?: Omit<AigovIconProps, "size" | "glow" | "neon" | "tone">;
  wordProps?: Omit<AigovWordmarkProps, "width" | "height" | "glow">;

  className?: string;
  style?: React.CSSProperties;
};

function neonFilter(strength: AigovNeonStrength, tone: NonNullable<AigovIconProps["tone"]>): string {
  if (tone === "teal") {
    if (strength === "soft") {
      return (
        "drop-shadow(0 0 10px rgba(153,246,228,0.70)) " +
        "drop-shadow(0 0 22px rgba(45,212,191,0.55)) " +
        "drop-shadow(0 0 46px rgba(20,184,166,0.35))"
      );
    }
    return (
      "drop-shadow(0 0 14px rgba(153,246,228,0.88)) " +
      "drop-shadow(0 0 34px rgba(45,212,191,0.70)) " +
      "drop-shadow(0 0 78px rgba(20,184,166,0.45))"
    );
  }

  if (strength === "soft") {
    return (
      "drop-shadow(0 0 10px rgba(191,219,254,0.70)) " +
      "drop-shadow(0 0 22px rgba(147,197,253,0.55)) " +
      "drop-shadow(0 0 46px rgba(96,165,250,0.35))"
    );
  }

  return (
    "drop-shadow(0 0 14px rgba(191,219,254,0.92)) " +
    "drop-shadow(0 0 34px rgba(147,197,253,0.78)) " +
    "drop-shadow(0 0 78px rgba(96,165,250,0.55))"
  );
}

export default function AigovLogo({
  iconSize = 18,
  wordWidth = 112,
  wordHeight = 28,
  gap = 10,

  glow = true,
  neon = false,
  neonStrength = "strong",

  tone = "blue",

  iconProps,
  wordProps,

  className,
  style,
}: AigovLogoProps) {
  const filter = neon ? neonFilter(neonStrength, tone) : undefined;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        lineHeight: 0,
        filter,
        ...style,
      }}
    >
      <AigovIcon size={iconSize} glow={glow} neon={neon} tone={tone} {...iconProps} />
      <AigovWordmark width={wordWidth} height={wordHeight} glow={glow} {...wordProps} />
    </span>
  );
}