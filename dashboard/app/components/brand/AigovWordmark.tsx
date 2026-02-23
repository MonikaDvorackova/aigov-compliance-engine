"use client";

import React from "react";

export type AigovWordmarkProps = Omit<React.SVGProps<SVGSVGElement>, "width" | "height"> & {
  width?: number;
  height?: number;
  glow?: boolean;
};

export default function AigovWordmark({
  width = 112,
  height = 28,
  glow = true,
  style,
  ...rest
}: AigovWordmarkProps) {
  return (
    <svg
      viewBox="0 0 320 120"
      width={width}
      height={height}
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
        <filter id="aigovWordGlow" x="-45%" y="-55%" width="220%" height="230%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="aigovWordDotGlow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={glow ? "url(#aigovWordGlow)" : undefined}>
        <text
          x="30"
          y="78"
          fontSize="64"
          fontWeight="700"
          fill="rgba(255,255,255,0.92)"
          fontFamily="Inter, system-ui, sans-serif"
        >
          Gov
        </text>

        <text
          x="165"
          y="78"
          fontSize="64"
          fontWeight="700"
          fill="rgba(147,197,253,0.98)"
          fontFamily="Inter, system-ui, sans-serif"
        >
          AI
        </text>
      </g>

      <circle
        cx="282"
        cy="70"
        r="8"
        fill="rgba(147,197,253,0.95)"
        filter={glow ? "url(#aigovWordDotGlow)" : undefined}
      />
    </svg>
  );
}