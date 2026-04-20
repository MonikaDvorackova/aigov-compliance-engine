"use client";

import React from "react";

/** App Router serves `app/icon.svg` at this URL — single visual source of truth. */
export const AIGOV_ICON_SRC = "/icon.svg";

/** Muted steel only — no blue / teal / violet chroma in filters or glows. */
export type AigovIconTone = "steel";

export type AigovIconNeonStrength = "off" | "soft" | "strong";

export type AigovIconProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "width" | "height" | "alt"
> & {
  size?: number;
  glow?: boolean;
  neonStrength?: AigovIconNeonStrength;
  tone?: AigovIconTone;
};

type ShadowTier = "compact" | "standard" | "hero";

function shadowTierForSize(size: number): ShadowTier {
  if (size >= 96) return "hero";
  if (size < 32) return "compact";
  return "standard";
}

/** Neutral grayscale glow only (no chromatic hue). */
function neutralDropShadowStack(level: "glow" | "soft" | "strong", tier: ShadowTier): string {
  if (level === "strong") {
    if (tier === "hero") {
      return (
        "drop-shadow(0 0 6px rgba(255,255,255,0.14)) " +
        "drop-shadow(0 0 16px rgba(255,255,255,0.09)) " +
        "drop-shadow(0 0 34px rgba(255,255,255,0.05)) " +
        "drop-shadow(0 0 58px rgba(0,0,0,0.35))"
      );
    }
    if (tier === "standard") {
      return (
        "drop-shadow(0 0 4px rgba(255,255,255,0.12)) " +
        "drop-shadow(0 0 12px rgba(255,255,255,0.07)) " +
        "drop-shadow(0 0 22px rgba(255,255,255,0.04))"
      );
    }
    return (
      "drop-shadow(0 0 3px rgba(255,255,255,0.1)) " +
      "drop-shadow(0 0 9px rgba(255,255,255,0.06)) " +
      "drop-shadow(0 0 16px rgba(0,0,0,0.25))"
    );
  }
  if (level === "soft") {
    if (tier === "hero") {
      return (
        "drop-shadow(0 0 8px rgba(255,255,255,0.1)) " +
        "drop-shadow(0 0 18px rgba(255,255,255,0.06)) " +
        "drop-shadow(0 0 36px rgba(0,0,0,0.28))"
      );
    }
    if (tier === "standard") {
      return (
        "drop-shadow(0 0 5px rgba(255,255,255,0.08)) " +
        "drop-shadow(0 0 14px rgba(255,255,255,0.05)) " +
        "drop-shadow(0 0 26px rgba(0,0,0,0.22))"
      );
    }
    return "drop-shadow(0 0 4px rgba(255,255,255,0.07)) drop-shadow(0 0 10px rgba(0,0,0,0.18))";
  }
  if (tier === "compact") {
    return "drop-shadow(0 0 4px rgba(255,255,255,0.07)) drop-shadow(0 0 10px rgba(0,0,0,0.16))";
  }
  if (tier === "standard") {
    return (
      "drop-shadow(0 0 5px rgba(255,255,255,0.08)) " +
      "drop-shadow(0 0 14px rgba(255,255,255,0.05)) " +
      "drop-shadow(0 0 26px rgba(0,0,0,0.2))"
    );
  }
  return (
    "drop-shadow(0 0 6px rgba(255,255,255,0.09)) " +
    "drop-shadow(0 0 16px rgba(255,255,255,0.05)) " +
    "drop-shadow(0 0 32px rgba(0,0,0,0.22))"
  );
}

function iconFilter(
  glow: boolean,
  neonStrength: AigovIconNeonStrength,
  size: number,
): string | undefined {
  const tier = shadowTierForSize(size);
  if (neonStrength === "strong") {
    return neutralDropShadowStack("strong", tier);
  }
  if (neonStrength === "soft") {
    return neutralDropShadowStack("soft", tier);
  }
  if (glow) {
    return neutralDropShadowStack("glow", tier);
  }
  return undefined;
}

/** Pulls embedded PNG toward graphite so no blue/violet remains visible. */
function steelRasterFilter(): string {
  return "grayscale(0.38) contrast(1.04)";
}

function heroPolish(size: number, neonStrength: AigovIconNeonStrength): string | undefined {
  if (size < 96 || neonStrength === "off") return undefined;
  return "contrast(1.02)";
}

export default function AigovIcon({
  size = 18,
  glow = true,
  neonStrength = "off",
  tone: _tone = "steel",
  style,
  className,
  ...rest
}: AigovIconProps) {
  const shadow = iconFilter(glow, neonStrength, size);
  const polish = heroPolish(size, neonStrength);
  const filter = [steelRasterFilter(), shadow, polish].filter(Boolean).join(" ") || undefined;

  return (
    <img
      src={AIGOV_ICON_SRC}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
        objectFit: "contain",
        filter,
        ...style,
      }}
      {...rest}
    />
  );
}
