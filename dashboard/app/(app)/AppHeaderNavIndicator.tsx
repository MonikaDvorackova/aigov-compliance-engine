"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import AigovMark from "@/app/components/brand/AigovMark";

const DOT_STEP_MS = 500;
const DOT_PATTERNS = [".", "..", "..."] as const;
const LOGO_PULSE_S = 3.5;

type AppHeaderNavIndicatorProps = {
  /** Default chrome copy — keep short (Loading / Syncing / Refreshing). */
  label?: string;
};

/**
 * Ambient route transition hint: tiny mark + label + dots. Shown after in-app link activation;
 * clears when the URL updates. Not a blocking overlay.
 */
export function AppHeaderNavIndicator({ label = "Loading" }: AppHeaderNavIndicatorProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const routeKey = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;

  const [pending, setPending] = useState(false);
  const [dotStep, setDotStep] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    setPending(false);
  }, [routeKey]);

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

  useEffect(() => {
    if (!pending || reduceMotion) return;
    const id = window.setInterval(() => {
      setDotStep((s) => (s + 1) % DOT_PATTERNS.length);
    }, DOT_STEP_MS);
    return () => window.clearInterval(id);
  }, [pending, reduceMotion]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = (e.target as Element | null)?.closest?.("a[href]");
      if (!el) return;
      const a = el as HTMLAnchorElement;
      if (a.target && a.target !== "_self") return;
      if (a.download) return;

      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      try {
        const u = new URL(href, window.location.href);
        if (u.origin !== window.location.origin) return;
        const next = u.pathname + (u.search || "");
        const current = window.location.pathname + window.location.search;
        if (next === current) return;
        setPending(true);
      } catch {
        /* ignore invalid href */
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  if (!pending) return null;

  const dots = reduceMotion ? "..." : DOT_PATTERNS[dotStep];

  return (
    <div className="max-w-[200px]" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <div className="flex items-center gap-1.5" aria-hidden>
        <span
          className="inline-flex shrink-0"
          style={{
            animation: reduceMotion ? undefined : `appHeaderNavLogoSoft ${LOGO_PULSE_S}s ease-in-out infinite`,
          }}
        >
          <AigovMark size={15} glow={false} neon={false} neonStrength="off" tone="steel" isRunning={false} />
        </span>
        <span className="inline-flex min-w-0 items-baseline gap-0 text-[11px] font-medium leading-none tracking-tight text-zinc-500">
          <span>{label}</span>
          <span className="inline-block min-w-[3ch] text-left font-normal tabular-nums text-zinc-400">{dots}</span>
        </span>
      </div>
      <style>{`
        @keyframes appHeaderNavLogoSoft {
          0%,
          100% {
            opacity: 0.94;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
