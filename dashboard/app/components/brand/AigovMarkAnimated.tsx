"use client";

import React from "react";

export default function AigovMarkAnimated({
  width,
  height,
  style,
  ...rest
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 320 120"
      width={width}
      height={height}
      style={{
        display: "block",
        overflow: "visible",
        ...style,
      }}
      {...rest}
    >
      <defs>
        <filter id="softGlowAnim" x="-40%" y="-40%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="dotGlowAnim" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#softGlowAnim)">
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
        filter="url(#dotGlowAnim)"
      >
        <animate
          attributeName="r"
          values="8;10;8"
          dur="1.8s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}