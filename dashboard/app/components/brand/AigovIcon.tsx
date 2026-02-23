"use client";

import React from "react";

export type AigovIconProps = Omit<React.SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: number;
  glow?: boolean;
  tone?: "blue" | "teal";
};

export default function AigovIcon({
  size = 18,
  glow = true,
  tone = "blue",
  style,
  ...rest
}: AigovIconProps) {
  const coreA = tone === "teal" ? "#2DD4BF" : "#93C5FD";
  const coreB = tone === "teal" ? "#14B8A6" : "#60A5FA";
  const coreC = tone === "teal" ? "#0EA5A4" : "#3B82F6";

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      style={{
        display: "block",
        overflow: "visible",
        ...style,
      }}
      {...rest}
    >
      <defs>
        <radialGradient id="aigovIconGlowFill" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor={tone === "teal" ? "rgba(45,212,191,0.55)" : "rgba(147,197,253,0.55)"} />
          <stop offset="55%" stopColor={tone === "teal" ? "rgba(20,184,166,0.18)" : "rgba(59,130,246,0.18)"} />
          <stop offset="100%" stopColor={tone === "teal" ? "rgba(20,184,166,0)" : "rgba(59,130,246,0)"} />
        </radialGradient>

        <linearGradient id="aigovIconCore" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={coreA} />
          <stop offset="55%" stopColor={coreB} />
          <stop offset="100%" stopColor={coreC} />
        </linearGradient>

        <filter id="aigovIconGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.9" result="b" />
          <feColorMatrix
            in="b"
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 0.85 0"
            result="bb"
          />
          <feMerge>
            <feMergeNode in="bb" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="aigovIconInner" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="ib" />
          <feMerge>
            <feMergeNode in="ib" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {glow ? <circle cx="12" cy="11.2" r="9.3" fill="url(#aigovIconGlowFill)" /> : null}

      <g filter={glow ? "url(#aigovIconGlow)" : undefined}>
        <circle
          cx="12"
          cy="12"
          r="8.5"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.05"
        />

        <path
          d="M12 6.7c2.75 0 4.95 2 4.95 4.65 0 1.95-1.1 3.6-2.85 4.25-0.65 0.25-1.3 0.33-1.95 0.27-1.3-0.12-2.35-0.85-2.95-1.9-0.55-0.95-0.62-2.12-0.2-3.1 0.52-1.18 1.6-2 2.85-2.25 0.95-0.18 1.85-0.02 2.65 0.45 0.82 0.48 1.35 1.25 1.5 2.13 0.16 0.95-0.15 1.85-0.85 2.45-0.72 0.62-1.7 0.8-2.58 0.5"
          fill="none"
          stroke="url(#aigovIconCore)"
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <g filter="url(#aigovIconInner)">
          <circle cx="12" cy="12" r="1.05" fill="rgba(255,255,255,0.26)" />
          <circle cx="12" cy="12" r="0.72" fill="rgba(230,255,251,0.95)" />
        </g>
      </g>
    </svg>
  );
}