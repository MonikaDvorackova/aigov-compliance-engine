import React from "react";

export default function AigovMarkAnimated(props: React.SVGProps<SVGSVGElement>) {
  const { children, ...rest } = props;

  return (
    <svg viewBox="0 0 320 120" role="img" aria-label="AIGOV mark animated" {...rest}>
      <style>{`
        .dotWrap { transform-box: fill-box; transform-origin: center; }
        @keyframes evalWave {
          0% { transform: translateY(0px); opacity: 0.65; }
          50% { transform: translateY(-5px); opacity: 1; }
          100% { transform: translateY(0px); opacity: 0.65; }
        }
        .d1 { animation: evalWave 1.3s ease-in-out infinite; animation-delay: 0s; }
        .d2 { animation: evalWave 1.3s ease-in-out infinite; animation-delay: 0.16s; }
        .d3 { animation: evalWave 1.3s ease-in-out infinite; animation-delay: 0.32s; }
      `}</style>

      <defs>
        <linearGradient id="strokeBlue" x1="90" y1="50" x2="230" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(120,170,255,0.75)" />
          <stop offset="55%" stopColor="rgba(185,215,255,0.92)" />
          <stop offset="100%" stopColor="rgba(120,170,255,0.75)" />
        </linearGradient>
      </defs>

      <path
        stroke="url(#strokeBlue)"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.96"
        d="M118 36 L96 60 L118 84"
      />
      <path
        stroke="url(#strokeBlue)"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.96"
        d="M202 36 L224 60 L202 84"
      />

      <g className="dotWrap d1">
        <circle fill="rgba(165,200,255,0.82)" cx="144" cy="77.6" r="6.4" />
      </g>
      <g className="dotWrap d2">
        <circle fill="rgba(165,200,255,0.82)" cx="160" cy="77.6" r="6.4" />
      </g>
      <g className="dotWrap d3">
        <circle fill="rgba(165,200,255,0.82)" cx="176" cy="77.6" r="6.4" />
      </g>

      {children}
    </svg>
  );
}
