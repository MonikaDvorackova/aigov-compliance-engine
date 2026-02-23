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
        "drop-shadow(0 0 14px rgba(153,246,228,0.88)) " +
        "drop-shadow(0 0 34px rgba(45,212,191,0.70)) " +
        "drop-shadow(0 0 78px rgba(20,184,166,0.45))"
      );
    }

    return (
      "drop-shadow(0 0 10px rgba(153,246,228,0.70)) " +
      "drop-shadow(0 0 22px rgba(45,212,191,0.55)) " +
      "drop-shadow(0 0 46px rgba(20,184,166,0.35))"
    );
  }

  if (neon) {
    return (
      "drop-shadow(0 0 14px rgba(191,219,254,0.92)) " +
      "drop-shadow(0 0 34px rgba(147,197,253,0.78)) " +
      "drop-shadow(0 0 78px rgba(96,165,250,0.55))"
    );
  }

  return (
    "drop-shadow(0 0 10px rgba(191,219,254,0.70)) " +
    "drop-shadow(0 0 22px rgba(147,197,253,0.55)) " +
    "drop-shadow(0 0 46px rgba(96,165,250,0.35))"
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

  const strokeSoft = isTeal ? "rgba(153,246,228,0.60)" : "rgba(170,205,255,0.60)";
  const dotFill = isTeal ? "rgba(153,246,228,0.92)" : "rgba(165,200,255,0.92)";
  const bgCircle = "rgba(255,255,255,0.05)";

  const gradA = isTeal ? "rgba(153,246,228,0.92)" : "rgba(191,219,254,0.95)";
  const gradB = isTeal ? "rgba(45,212,191,0.80)" : "rgba(147,197,253,0.80)";
  const gradC = isTeal ? "rgba(20,184,166,0.55)" : "rgba(96,165,250,0.55)";

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
      </defs>

      <circle cx="160" cy="60" r="68" fill={bgCircle} />

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