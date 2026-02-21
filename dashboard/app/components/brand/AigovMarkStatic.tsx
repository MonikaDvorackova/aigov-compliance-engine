import React from "react";

export default function AigovMarkStatic(props: React.SVGProps<SVGSVGElement>) {
  const { children, ...rest } = props;

  return (
    <svg viewBox="0 0 320 120" role="img" aria-label="GovAI mark" {...rest}>
      <defs>
        <linearGradient id="strokeBlue" x1="90" y1="50" x2="230" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(120,170,255,0.78)" />
          <stop offset="55%" stopColor="rgba(210,232,255,0.98)" />
          <stop offset="100%" stopColor="rgba(120,170,255,0.78)" />
        </linearGradient>

        <linearGradient id="strokeInner" x1="90" y1="48" x2="230" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.38)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.62)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.34)" />
        </linearGradient>

        <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              0 0 0 0.85 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              0 0 0 0.95 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer strong brackets with glow */}
      <path
        stroke="url(#strokeBlue)"
        strokeWidth="7.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.98"
        filter="url(#softGlow)"
        vectorEffect="non-scaling-stroke"
        d="M118 36 L96 60 L118 84"
      />
      <path
        stroke="url(#strokeBlue)"
        strokeWidth="7.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.98"
        filter="url(#softGlow)"
        vectorEffect="non-scaling-stroke"
        d="M202 36 L224 60 L202 84"
      />

      {/* Inner highlight stroke to stay readable when small */}
      <path
        stroke="url(#strokeInner)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.55"
        vectorEffect="non-scaling-stroke"
        d="M118 36 L96 60 L118 84"
      />
      <path
        stroke="url(#strokeInner)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.55"
        vectorEffect="non-scaling-stroke"
        d="M202 36 L224 60 L202 84"
      />

      {/* Dots with glow */}
      <g filter="url(#dotGlow)" opacity="0.98">
        <circle fill="rgba(170,210,255,0.94)" cx="144" cy="77.6" r="7.2" />
        <circle fill="rgba(170,210,255,0.94)" cx="160" cy="77.6" r="7.2" />
        <circle fill="rgba(170,210,255,0.94)" cx="176" cy="77.6" r="7.2" />
      </g>

      {/* Subtle dot highlights for crispness */}
      <circle fill="rgba(255,255,255,0.22)" cx="142.6" cy="75.8" r="2.0" />
      <circle fill="rgba(255,255,255,0.22)" cx="158.6" cy="75.8" r="2.0" />
      <circle fill="rgba(255,255,255,0.22)" cx="174.6" cy="75.8" r="2.0" />

      {children}
    </svg>
  );
}