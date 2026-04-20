"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import AigovMark from "@/app/components/brand/AigovMark";
import { useInAppNavPending } from "./useInAppNavPending";

const LOGO_PX = 30;

/** Tečky ve velikosti blízké rasteru v icon.svg (menší než dřív — bez „haló“ jako větší kuličky). */
const DOT_FILL = "rgb(96, 165, 250)";
const DOT_SHADOW = "0 0 2px rgba(96, 165, 250, 0.35)";
const DOT_GAP_PX = 2;
const DOT_SIZE_PX = 2;

/**
 * Ukotvení řádku teček: v PNG jsou mezi rameny `< >` — obvykle pod geometrickým středem 30×30.
 * Jemné doladění v px navíc k procentu.
 */
const DOTS_ANCHOR_TOP_PERCENT = 56;
const DOTS_OFFSET_X_PX = 0;
const DOTS_OFFSET_Y_PX = 1;

/** Cyklus . → .. → … (1–3 viditelné tečky), ne stále tři přes bitmapu. */
const DOT_COUNT_STEP_MS = 480;

const DOT_ROW_MIN_WIDTH_PX = DOT_SIZE_PX * 3 + DOT_GAP_PX * 2;

/**
 * Překryje jen oblast rasterových teček v icon.svg (stejné ukotvení jako DotsRow).
 * Barva = pozadí sidebaru, aby pod animací neprosvítaly vždycky tři body z PNG.
 */
const PNG_DOTS_OCCLUDER_W_PX = 13;
const PNG_DOTS_OCCLUDER_H_PX = 7;

const CROSSFADE_MS = 420;
const CROSSFADE_MS_REDUCED = 200;
const CROSSFADE_EASING = "cubic-bezier(0.45, 0, 0.18, 1)";

const markProps = {
  size: LOGO_PX,
  isRunning: false as const,
  animationMode: "static" as const,
  glow: false,
  neon: false,
  neonStrength: "off" as const,
  tone: "blue" as const,
};

/** Identický obal jako u statické verze — stejná pozice ikony v mřížce 30×30. */
function MarkShell({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        position: "relative",
        width: LOGO_PX,
        height: LOGO_PX,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
      }}
    >
      {children}
    </span>
  );
}

function PngDotsOccluder() {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: `calc(50% + ${DOTS_OFFSET_X_PX}px)`,
        top: `calc(${DOTS_ANCHOR_TOP_PERCENT}% + ${DOTS_OFFSET_Y_PX}px)`,
        transform: "translate(-50%, -50%)",
        width: PNG_DOTS_OCCLUDER_W_PX,
        height: PNG_DOTS_OCCLUDER_H_PX,
        borderRadius: 4,
        background: "var(--govai-bg-sidebar)",
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );
}

function DotsRow({ reduceMotion, active }: { reduceMotion: boolean; active: boolean }) {
  const [countPhase, setCountPhase] = useState(0);

  useEffect(() => {
    if (!active || reduceMotion) {
      setCountPhase(0);
      return;
    }
    const id = window.setInterval(() => {
      setCountPhase((p) => (p + 1) % 3);
    }, DOT_COUNT_STEP_MS);
    return () => window.clearInterval(id);
  }, [active, reduceMotion]);

  const dotCount = reduceMotion ? 3 : countPhase + 1;

  return (
    <span
      data-active={active ? "true" : "false"}
      className="govai-sidebar-lockup-dots"
      style={{
        position: "absolute",
        left: `calc(50% + ${DOTS_OFFSET_X_PX}px)`,
        top: `calc(${DOTS_ANCHOR_TOP_PERCENT}% + ${DOTS_OFFSET_Y_PX}px)`,
        transform: "translate(-50%, -50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: DOT_GAP_PX,
        minWidth: DOT_ROW_MIN_WIDTH_PX,
        zIndex: 2,
        pointerEvents: "none",
      }}
      aria-hidden
    >
      {reduceMotion ? (
        <>
          <span className="govai-sidebar-lockup-dot govai-sidebar-lockup-dot--static" />
          <span className="govai-sidebar-lockup-dot govai-sidebar-lockup-dot--static" />
          <span className="govai-sidebar-lockup-dot govai-sidebar-lockup-dot--static" />
        </>
      ) : (
        <>
          {dotCount >= 1 ? <span className="govai-sidebar-lockup-dot" /> : null}
          {dotCount >= 2 ? <span className="govai-sidebar-lockup-dot govai-sidebar-lockup-dot--2" /> : null}
          {dotCount >= 3 ? <span className="govai-sidebar-lockup-dot govai-sidebar-lockup-dot--3" /> : null}
        </>
      )}
    </span>
  );
}

function SidebarBrandLogo({ pending, reduceMotion }: { pending: boolean; reduceMotion: boolean }) {
  const ms = reduceMotion ? CROSSFADE_MS_REDUCED : CROSSFADE_MS;
  const transition = `opacity ${ms}ms ${reduceMotion ? "ease" : CROSSFADE_EASING}`;

  const layerBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition,
  };

  return (
    <span
      style={{
        position: "relative",
        width: LOGO_PX,
        height: LOGO_PX,
        flexShrink: 0,
        lineHeight: 0,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          ...layerBase,
          opacity: pending ? 0 : 1,
          pointerEvents: pending ? "none" : "auto",
        }}
      >
        <MarkShell>
          <AigovMark {...markProps} />
        </MarkShell>
      </span>
      <span
        style={{
          ...layerBase,
          opacity: pending ? 1 : 0,
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <MarkShell>
          <AigovMark {...markProps} />
          <PngDotsOccluder />
          <DotsRow reduceMotion={reduceMotion} active={pending} />
        </MarkShell>
      </span>
      <style>{`
        .govai-sidebar-lockup-dots[data-active="false"] .govai-sidebar-lockup-dot {
          animation: none;
        }
        @keyframes govaiSidebarLockupDotBounce {
          0%,
          70%,
          100% {
            transform: translateY(0);
            opacity: 0.65;
          }
          35% {
            transform: translateY(-2px);
            opacity: 1;
          }
        }
        .govai-sidebar-lockup-dot {
          display: inline-block;
          width: ${DOT_SIZE_PX}px;
          height: ${DOT_SIZE_PX}px;
          border-radius: 999px;
          background: ${DOT_FILL};
          box-shadow: ${DOT_SHADOW};
          animation: govaiSidebarLockupDotBounce 0.52s ease-in-out infinite;
        }
        .govai-sidebar-lockup-dot--2 {
          animation-delay: 0.1s;
        }
        .govai-sidebar-lockup-dot--3 {
          animation-delay: 0.2s;
        }
        .govai-sidebar-lockup-dot--static {
          animation: none;
          opacity: 0.9;
        }
      `}</style>
    </span>
  );
}

export function AppSidebarBrand() {
  const pending = useInAppNavPending();
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

  return (
    <div style={{ position: "relative" }}>
      <Link
        href="/runs"
        aria-label="GovAI"
        aria-busy={pending}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 8px",
          borderRadius: 10,
          textDecoration: "none",
          color: "var(--govai-text)",
          transition: "background 0.15s ease",
        }}
      >
        <SidebarBrandLogo pending={pending} reduceMotion={reduceMotion} />
        <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.02em" }}>GovAI Console</span>
          <span style={{ fontSize: 11.5, color: "var(--govai-text-tertiary)" }}>Compliance evidence</span>
        </span>
      </Link>
      {pending ? (
        <span
          role="status"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clipPath: "inset(50%)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          Loading
        </span>
      ) : null}
    </div>
  );
}
