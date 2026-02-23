"use client";

import React from "react";

export type AigovWordmarkProps = Omit<React.SVGProps<SVGSVGElement>, "width" | "height"> & {
  width?: number;
  height?: number;
  glow?: boolean;
  showDot?: boolean;
};

export default function AigovWordmark({
  width = 112,
  height = 28,
  glow = true,
  showDot = true,
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
        <filter id="aigovWordGlow" x="-55%" y="-70%" width="250%" height="270%">
          <feGaussianBlur stdDeviation="7.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="aigovWordDotGlow" x="-90%" y="-90%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="10" result="b" />
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
          fill="rgba(255,255,255,0.94)"
          fontFamily="Inter, system-ui, sans-serif"
        >
          Gov
        </text>

        <text
          x="165"
          y="78"
          fontSize="64"
          fontWeight="700"
          fill="rgba(170,205,255,1)"
          fontFamily="Inter, system-ui, sans-serif"
        >
          AI
        </text>
      </g>

      {showDot ? (
        <circle
          cx="282"
          cy="70"
          r="8"
          fill="rgba(170,205,255,0.98)"
          filter={glow ? "url(#aigovWordDotGlow)" : undefined}
        />
      ) : null}
    </svg>
  );
}