"use client";

import React, { useEffect, useMemo, useState } from "react";
import AigovIcon, { type AigovIconNeonStrength, type AigovIconTone } from "./AigovIcon";

export type AigovNeonStrength = "off" | "soft" | "strong";

export type AigovAnimationMode = "static" | "assemble";

export type AigovMarkProps = {
  isRunning?: boolean;
  /** When `isRunning` and `"assemble"`, cycles <> → <.> → <..> → <...> → icon.svg. */
  animationMode?: AigovAnimationMode;
  size?: number;
  glow?: boolean;
  neon?: boolean;
  neonStrength?: AigovNeonStrength;
  tone?: AigovIconTone;
  className?: string;
  style?: React.CSSProperties;
};

function resolveIconNeonStrength(
  neon: boolean,
  neonStrength: AigovNeonStrength,
): AigovIconNeonStrength {
  if (!neon || neonStrength === "off") return "off";
  return neonStrength === "strong" ? "strong" : "soft";
}

const ASSEMBLE_PHASE_MS = 280;
const ASSEMBLE_PHASE_COUNT = 5;

function glyphColor(tone: AigovIconTone): string {
  return tone === "teal" ? "rgba(185,255,244,0.88)" : "rgba(191,219,254,0.9)";
}

function glyphShadow(tone: AigovIconTone, neonStrength: AigovIconNeonStrength): string {
  if (tone === "teal") {
    return neonStrength === "off"
      ? "0 0 10px rgba(45,212,191,0.22)"
      : "0 0 12px rgba(45,212,191,0.32), 0 0 22px rgba(20,184,166,0.18)";
  }
  return neonStrength === "off"
    ? "0 0 10px rgba(96,165,250,0.2)"
    : "0 0 12px rgba(147,197,253,0.28), 0 0 22px rgba(96,165,250,0.16)";
}

function AssembleGlyph({
  phase,
  size,
  tone,
  neonStrength,
}: {
  phase: number;
  size: number;
  tone: AigovIconTone;
  neonStrength: AigovIconNeonStrength;
}) {
  const fs = Math.max(10, Math.round(size * 0.36));
  const color = glyphColor(tone);
  const shadow = glyphShadow(tone, neonStrength);

  const body =
    phase === 0 ? (
      <>
        {"<"}
        {">"}
      </>
    ) : phase === 1 ? (
      <>
        {"<"}
        {"."}
        {">"}
      </>
    ) : phase === 2 ? (
      <>
        {"<"}
        {".."}
        {">"}
      </>
    ) : (
      <>
        {"<"}
        {"..."}
        {">"}
      </>
    );

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: fs,
        fontWeight: 500,
        letterSpacing: "-0.04em",
        color,
        textShadow: shadow,
        lineHeight: 1,
        userSelect: "none",
        transition: "opacity 160ms ease, filter 160ms ease",
      }}
    >
      {body}
    </div>
  );
}

export default function AigovMark({
  isRunning = false,
  animationMode = "static",
  size = 18,
  glow = true,
  neon = false,
  neonStrength = "off",
  tone = "blue",
  className,
  style,
}: AigovMarkProps) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [phase, setPhase] = useState(0);

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

  const assembleActive = isRunning && animationMode === "assemble" && !reduceMotion;

  useEffect(() => {
    if (!assembleActive) {
      setPhase(0);
      return;
    }

    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % ASSEMBLE_PHASE_COUNT);
    }, ASSEMBLE_PHASE_MS);

    return () => window.clearInterval(id);
  }, [assembleActive]);

  const showPulse = useMemo(
    () => isRunning && animationMode === "static" && !reduceMotion,
    [isRunning, animationMode, reduceMotion],
  );

  const iconNeonStrength = resolveIconNeonStrength(neon, neonStrength);

  const pulseSize = Math.max(7, Math.round(size * 0.34));

  const pulseBg = tone === "teal" ? "rgba(185,255,244,0.86)" : "rgba(191,219,254,0.86)";

  const pulseShadow =
    tone === "teal"
      ? "0 0 10px rgba(45,212,191,0.14), 0 0 18px rgba(153,246,228,0.10)"
      : "0 0 10px rgba(147,197,253,0.14), 0 0 18px rgba(191,219,254,0.10)";

  const boxStyle: React.CSSProperties = {
    display: "inline-flex",
    position: "relative",
    lineHeight: 0,
    width: size,
    height: size,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...style,
  };

  if (assembleActive) {
    const showGlyph = phase < 4;
    const showIcon = phase === 4;
    const glyphPhase = phase < 4 ? phase : 3;

    return (
      <span className={className} style={boxStyle}>
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: showGlyph ? 0.9 : 0,
            filter: showGlyph ? "none" : "blur(1.5px)",
            transition: "opacity 200ms ease, filter 240ms ease",
            pointerEvents: "none",
          }}
        >
          <AssembleGlyph phase={glyphPhase} size={size} tone={tone} neonStrength={iconNeonStrength} />
        </span>
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: showIcon ? 1 : 0,
            transition: "opacity 200ms ease",
            pointerEvents: "none",
          }}
        >
          <AigovIcon size={size} glow={glow} neonStrength={iconNeonStrength} tone={tone} />
        </span>
      </span>
    );
  }

  if (isRunning && animationMode === "assemble" && reduceMotion) {
    return (
      <span className={className} style={{ display: "inline-flex", position: "relative", lineHeight: 0, ...style }}>
        <AigovIcon size={size} glow={glow} neonStrength={iconNeonStrength} tone={tone} />
      </span>
    );
  }

  return (
    <span className={className} style={{ display: "inline-flex", position: "relative", lineHeight: 0, ...style }}>
      <AigovIcon size={size} glow={glow} neonStrength={iconNeonStrength} tone={tone} />

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
