"use client";

import React, { useEffect, useMemo, useState } from "react";
import AigovIcon from "./AigovIcon";
import AigovWordmark from "./AigovWordmark";
import AigovLogo from "./AigovLogo";

export type AigovMarkMode = "icon" | "wordmark" | "lockup";

export type AigovMarkProps = {
  mode?: AigovMarkMode;
  isRunning?: boolean;
  glow?: boolean;
  size?: number;
  wordWidth?: number;
  wordHeight?: number;
  tone?: "blue" | "teal";
  className?: string;
  style?: React.CSSProperties;
};

export default function AigovMark({
  mode = "icon",
  isRunning = false,
  glow = true,
  size = 18,
  wordWidth = 112,
  wordHeight = 28,
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

  if (mode === "wordmark") {
    return (
      <span className={className} style={{ display: "inline-flex", ...style }}>
        <AigovWordmark width={wordWidth} height={wordHeight} glow={glow} />
      </span>
    );
  }

  if (mode === "lockup") {
    return (
      <span className={className} style={{ display: "inline-flex", ...style }}>
        <AigovLogo iconSize={size} wordWidth={wordWidth} wordHeight={wordHeight} glow={glow} tone={tone} />
      </span>
    );
  }

  return (
    <span className={className} style={{ display: "inline-flex", position: "relative", ...style }}>
      <AigovIcon size={size} glow={glow} tone={tone} />
      {showPulse ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            width: Math.max(6, Math.round(size * 0.36)),
            height: Math.max(6, Math.round(size * 0.36)),
            borderRadius: 999,
            background: tone === "teal" ? "rgba(45,212,191,0.95)" : "rgba(147,197,253,0.95)",
            boxShadow:
              tone === "teal"
                ? "0 0 10px rgba(45,212,191,0.25), 0 0 18px rgba(20,184,166,0.18)"
                : "0 0 10px rgba(147,197,253,0.25), 0 0 18px rgba(59,130,246,0.18)",
            transformOrigin: "center",
            animation: "aigovPulse 1.8s ease-in-out infinite",
          }}
        />
      ) : null}

      <style>{`
        @keyframes aigovPulse {
          0% { transform: scale(1); opacity: 0.78; }
          50% { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(1); opacity: 0.78; }
        }
      `}</style>
    </span>
  );
}