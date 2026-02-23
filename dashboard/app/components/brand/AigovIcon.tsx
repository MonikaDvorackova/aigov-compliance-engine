"use client";

import React from "react";

export type AigovIconTone = "blue" | "teal";

export type AigovIconProps = Omit<React.SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: number;
  glow?: boolean;
  neon?: boolean;
  tone?: AigovIconTone;
};

function iconFilter(glow: boolean, neon: boolean, tone: AigovIconTone): string | undefined {
  if (!glow && !neon) return undefined;

  if (tone === "teal") {
    if (neon) {
      return (
        "drop-shadow(0 0 10px rgba(153,246,228,0.98)) " +
        "drop-shadow(0 0 22px rgba(45,212,191,0.92)) " +
        "drop-shadow(0 0 44px rgba(20,184,166,0.78)) " +
        "drop-shadow(0 0 92px rgba(20,184,166,0.55))"
      );
    }

    return (
      "drop-shadow(0 0 8px rgba(153,246,228,0.78)) " +
      "drop-shadow(0 0 18px rgba(45,212,191,0.60)) " +
      "drop-shadow(0 0 40px rgba(20,184,166,0.40))"
    );
  }

  if (neon) {
    return (
      "drop-shadow(0 0 10px rgba(219,234,254,0.98)) " +
      "drop-shadow(0 0 22px rgba(191,219,254,0.94)) " +
      "drop-shadow(0 0 44px rgba(147,197,253,0.82)) " +
      "drop-shadow(0 0 92px rgba(96,165,250,0.62))"
    );
  }

  return (
    "drop-shadow(0 0 8px rgba(191,219,254,0.72)) " +
    "drop-shadow(0 0 18px rgba(147,197,253,0.55)) " +
    "drop-shadow(0 0 40px rgba(96,165,250,0.36))"
  );
}

export default function AigovIcon({
  size = 18,
  glow = true,
  neon = false,
  tone = "blue",
  style,
  ...rest
}: AigovIconProps) {
  const isTeal = tone === "teal";

  const strokeSoft = isTeal ? "rgba(185,255,244,0.72)" : "rgba(205,228,255,0.72)";
  const dotFill = isTeal ? "rgba(185,255,244,0.98)" : "rgba(191,219,254,0.98)";
  const bgCircle = neon ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.05)";

  const gradA = isTeal ? "rgba(185,255,244,0.98)" : "rgba(219,234,254,0.99)";
  const gradB = isTeal ? "rgba(45,212,191,0.92)" : "rgba(191,219,254,0.92)";
  const gradC = isTeal ? "rgba(20,184,166,0.70)" : "rgba(147,197,253,0.78)";

  const filter = iconFilter(glow, neon, tone);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="84 -20 160 160"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      style={{
        display: "block",
        overflow: "visible",
        filter,
        ...style,
      }}
      {...rest}
    >
      <defs>
        <linearGradient id="aigovStroke" x1="110" y1="44" x2="210" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={gradB} />
          <stop offset="55%" stopColor={gradA} />
          <stop offset="100%" stopColor={gradB} />
        </linearGradient>

        <radialGradient id="aigovBg" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor={gradA} stopOpacity={neon ? 0.10 : 0.06} />
          <stop offset="55%" stopColor={gradC} stopOpacity={neon ? 0.08 : 0.05} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="160" cy="60" r="68" fill={bgCircle} />
      <circle cx="160" cy="60" r="68" fill="url(#aigovBg)" />

      <path
        stroke={strokeSoft}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M118 36 L96 60 L118 84"
      />
      <path
        stroke={strokeSoft}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M202 36 L224 60 L202 84"
      />

      <path
        stroke="url(#aigovStroke)"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M118 36 L96 60 L118 84"
      />
      <path
        stroke="url(#aigovStroke)"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M202 36 L224 60 L202 84"
      />

      <circle fill={dotFill} cx="144" cy="77.6" r="6.4" />
      <circle fill={dotFill} cx="160" cy="77.6" r="6.4" />
      <circle fill={dotFill} cx="176" cy="77.6" r="6.4" />
    </svg>
  );
}