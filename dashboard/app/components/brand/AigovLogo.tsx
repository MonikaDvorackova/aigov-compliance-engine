"use client";

import React from "react";
import AigovIcon, { AigovIconProps } from "./AigovIcon";
import AigovWordmark, { AigovWordmarkProps } from "./AigovWordmark";

export type AigovLogoProps = {
  iconSize?: number;
  wordWidth?: number;
  wordHeight?: number;
  gap?: number;
  glow?: boolean;
  tone?: AigovIconProps["tone"];
  iconProps?: Omit<AigovIconProps, "size" | "glow" | "tone">;
  wordProps?: Omit<AigovWordmarkProps, "width" | "height" | "glow">;
};

export default function AigovLogo({
  iconSize = 18,
  wordWidth = 112,
  wordHeight = 28,
  gap = 10,
  glow = true,
  tone = "blue",
  iconProps,
  wordProps,
}: AigovLogoProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        lineHeight: 0,
      }}
    >
      <AigovIcon size={iconSize} glow={glow} tone={tone} {...iconProps} />
      <AigovWordmark width={wordWidth} height={wordHeight} glow={glow} {...wordProps} />
    </span>
  );
}