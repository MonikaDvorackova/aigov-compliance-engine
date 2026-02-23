"use client";

import React, { useEffect, useMemo, useState } from "react";
import AigovIcon, { type AigovIconTone } from "./AigovIcon";

export type AigovNeonStrength = "off" | "soft" | "strong";

export type AigovMarkProps = {
  isRunning?: boolean;
  size?: number;
  glow?: boolean;
  neon?: boolean;
  neonStrength?: AigovNeonStrength;
  tone?: AigovIconTone;
  className?: string;
  style?: React.CSSProperties;
};

function strengthToFilter(neon: boolean, neonStrength: AigovNeonStrength) {
  if (!neon) return false;
  if (neonStrength === "off") return false;
  return true;
}

export default function AigovMark({
  isRunning = false,
  size = 18,
  glow = true,
  neon = false,
  neonStrength = "soft",
  tone = "blue",
  className,
  style,
}: AigovMarkProps) {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);

    apply();

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }

    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  const showPulse = useMemo(() => isRunning && !reduceMotion, [isRunning, reduceMotion]);

  const effectiveNeon = strengthToFilter(neon, neonStrength);

  const pulseSize = Math.max(7, Math.round(size * 0.34));

  return (
    <span className={className} style={{ display: "inline-flex", position: "relative", lineHeight: 0, ...style }}>
      <AigovIcon size={size} glow={glow} neon={effectiveNeon} tone={tone} />

      {showPulse ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            width: pulseSize,
            height: pulseSize,
            borderRadius: 999,
            background: tone === "teal" ? "rgba(185,255,244,0.98)" : "rgba(191,219,254,0.98)",
            boxShadow:
              tone === "teal"
                ? "0 0 12px rgba(153,246,228,0.30), 0 0 26px rgba(45,212,191,0.22)"
                : "0 0 12px rgba(191,219,254,0.30), 0 0 26px rgba(147,197,253,0.22)",
            transformOrigin: "center",
            animation: "aigovPulse 1.8s ease-in-out infinite",
          }}
        />
      ) : null}

      <style>{`
        @keyframes aigovPulse {
          0% { transform: scale(1); opacity: 0.72; }
          50% { transform: scale(1.28); opacity: 1; }
          100% { transform: scale(1); opacity: 0.72; }
        }
      `}</style>
    </span>
  );
}