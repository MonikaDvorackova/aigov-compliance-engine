"use client";

import React from "react";

/** App Router serves `app/icon.svg` at this URL — single visual source of truth. */
export const AIGOV_ICON_SRC = "/icon.svg";

export type AigovIconTone = "blue" | "teal";

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

/** Shadow footprint scales down for small marks so edges stay crisp. */
type ShadowTier = "compact" | "standard" | "hero";

function shadowTierForSize(size: number): ShadowTier {
  if (size >= 96) return "hero";
  if (size < 32) return "compact";
  return "standard";
}

function dropShadowStack(
  tone: AigovIconTone,
  level: "glow" | "soft" | "strong",
  tier: ShadowTier,
): string {
  const isTeal = tone === "teal";

  if (isTeal) {
    if (level === "strong") {
      if (tier === "hero") {
        return (
          "drop-shadow(0 0 6px rgba(153,246,228,0.88)) " +
          "drop-shadow(0 0 16px rgba(45,212,191,0.72)) " +
          "drop-shadow(0 0 34px rgba(20,184,166,0.48)) " +
          "drop-shadow(0 0 58px rgba(20,184,166,0.32))"
        );
      }
      if (tier === "standard") {
        return (
          "drop-shadow(0 0 4px rgba(153,246,228,0.78)) " +
          "drop-shadow(0 0 12px rgba(45,212,191,0.52)) " +
          "drop-shadow(0 0 22px rgba(20,184,166,0.32))"
        );
      }
      return (
        "drop-shadow(0 0 3px rgba(153,246,228,0.72)) " +
        "drop-shadow(0 0 10px rgba(45,212,191,0.42)) " +
        "drop-shadow(0 0 18px rgba(20,184,166,0.22))"
      );
    }
    if (level === "soft") {
      if (tier === "hero") {
        return (
          "drop-shadow(0 0 8px rgba(153,246,228,0.82)) " +
          "drop-shadow(0 0 18px rgba(45,212,191,0.58)) " +
          "drop-shadow(0 0 36px rgba(20,184,166,0.36))"
        );
      }
      if (tier === "standard") {
        return (
          "drop-shadow(0 0 5px rgba(153,246,228,0.72)) " +
          "drop-shadow(0 0 14px rgba(45,212,191,0.48)) " +
          "drop-shadow(0 0 26px rgba(20,184,166,0.28))"
        );
      }
      return (
        "drop-shadow(0 0 4px rgba(153,246,228,0.65)) " +
        "drop-shadow(0 0 10px rgba(45,212,191,0.38))"
      );
    }
    if (tier === "compact") {
      return (
        "drop-shadow(0 0 4px rgba(153,246,228,0.62)) " +
        "drop-shadow(0 0 10px rgba(45,212,191,0.34))"
      );
    }
    return (
      "drop-shadow(0 0 6px rgba(153,246,228,0.68)) " +
      "drop-shadow(0 0 14px rgba(45,212,191,0.42)) " +
      "drop-shadow(0 0 28px rgba(20,184,166,0.26))"
    );
  }

  if (level === "strong") {
    if (tier === "hero") {
      return (
        "drop-shadow(0 0 6px rgba(219,234,254,0.92)) " +
        "drop-shadow(0 0 16px rgba(191,219,254,0.78)) " +
        "drop-shadow(0 0 34px rgba(147,197,253,0.52)) " +
        "drop-shadow(0 0 58px rgba(96,165,250,0.34))"
      );
    }
    if (tier === "standard") {
      return (
        "drop-shadow(0 0 4px rgba(219,234,254,0.78)) " +
        "drop-shadow(0 0 12px rgba(191,219,254,0.52)) " +
        "drop-shadow(0 0 22px rgba(147,197,253,0.30))"
      );
    }
    return (
      "drop-shadow(0 0 3px rgba(219,234,254,0.72)) " +
      "drop-shadow(0 0 9px rgba(191,219,254,0.40)) " +
      "drop-shadow(0 0 16px rgba(147,197,253,0.22))"
    );
  }
  if (level === "soft") {
    if (tier === "hero") {
      return (
        "drop-shadow(0 0 8px rgba(219,234,254,0.82)) " +
        "drop-shadow(0 0 18px rgba(191,219,254,0.58)) " +
        "drop-shadow(0 0 36px rgba(147,197,253,0.36))"
      );
    }
    if (tier === "standard") {
      return (
        "drop-shadow(0 0 5px rgba(219,234,254,0.68)) " +
        "drop-shadow(0 0 14px rgba(191,219,254,0.44)) " +
        "drop-shadow(0 0 26px rgba(147,197,253,0.26))"
      );
    }
    return (
      "drop-shadow(0 0 4px rgba(219,234,254,0.58)) " +
      "drop-shadow(0 0 10px rgba(191,219,254,0.32))"
    );
  }
  if (tier === "compact") {
    return (
      "drop-shadow(0 0 4px rgba(191,219,254,0.55)) " +
      "drop-shadow(0 0 10px rgba(147,197,253,0.28))"
    );
  }
  if (tier === "standard") {
    return (
      "drop-shadow(0 0 5px rgba(191,219,254,0.62)) " +
      "drop-shadow(0 0 14px rgba(147,197,253,0.38)) " +
      "drop-shadow(0 0 26px rgba(96,165,250,0.22))"
    );
  }
  return (
    "drop-shadow(0 0 6px rgba(191,219,254,0.68)) " +
    "drop-shadow(0 0 16px rgba(147,197,253,0.48)) " +
    "drop-shadow(0 0 32px rgba(96,165,250,0.28))"
  );
}

function iconFilter(
  glow: boolean,
  neonStrength: AigovIconNeonStrength,
  tone: AigovIconTone,
  size: number,
): string | undefined {
  const tier = shadowTierForSize(size);
  if (neonStrength === "strong") {
    return dropShadowStack(tone, "strong", tier);
  }
  if (neonStrength === "soft") {
    return dropShadowStack(tone, "soft", tier);
  }
  if (glow) {
    return dropShadowStack(tone, "glow", tier);
  }
  return undefined;
}

function toneFilter(tone: AigovIconTone): string | undefined {
  if (tone === "teal") {
    return "hue-rotate(-20deg) saturate(1.08)";
  }
  return undefined;
}

/** Subtle clarity lift on large hero mark only. */
function heroPolish(size: number, neonStrength: AigovIconNeonStrength): string | undefined {
  if (size < 96 || neonStrength === "off") return undefined;
  return "contrast(1.03) saturate(1.04)";
}

export default function AigovIcon({
  size = 18,
  glow = true,
  neonStrength = "off",
  tone = "blue",
  style,
  className,
  ...rest
}: AigovIconProps) {
  const shadow = iconFilter(glow, neonStrength, tone, size);
  const tint = toneFilter(tone);
  const polish = heroPolish(size, neonStrength);
  const filter = [shadow, tint, polish].filter(Boolean).join(" ") || undefined;

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
