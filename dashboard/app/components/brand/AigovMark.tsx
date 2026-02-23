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

function shouldEnableNeon(neon: boolean, neonStrength: AigovNeonStrength) {
  if (!neon) return false;
  if (neonStrength === "off") return false;
  return true;
}

export default function AigovMark({
  isRunning = false,
  size = 18,
  glow = true,
  neon = false,
  neonStrength = "off",
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

  const effectiveNeon = shouldEnableNeon(neon, neonStrength);

  const pulseSize = Math.max(7, Math.round(size * 0.34));

  const pulseBg = tone === "teal" ? "rgba(185,255,244,0.86)" : "rgba(191,219,254,0.86)";

  const pulseShadow =
    tone === "teal"
      ? "0 0 10px rgba(45,212,191,0.14), 0 0 18px rgba(153,246,228,0.10)"
      : "0 0 10px rgba(147,197,253,0.14), 0 0 18px rgba(191,219,254,0.10)";

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
            background: pulseBg,
            boxShadow: pulseShadow,
            transformOrigin: "center",
            animation: "aigovPulse 1.9s ease-in-out infinite",
          }}
        />
      ) : null}

      <style>{`
        @keyframes aigovPulse {
          0% { transform: scale(1); opacity: 0.58; }
          50% { transform: scale(1.22); opacity: 0.86; }
          100% { transform: scale(1); opacity: 0.58; }
        }
      `}</style>
    </span>
  );
}