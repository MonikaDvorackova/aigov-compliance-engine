"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AigovMark from "@/app/components/brand/AigovMark";
import { CONSOLE_NAV } from "@/lib/console/nav";
import { AppSidebarBrand } from "./AppSidebarBrand";

function iconWrap(): React.CSSProperties {
  return {
    width: 18,
    height: 18,
    display: "inline-block",
    opacity: 0.72,
  };
}

function IconRuns() {
  return (
    <svg style={iconWrap()} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 7h14M7 12h14M7 17h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3.5 7h.1M3.5 12h.1M3.5 17h.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPolicies() {
  return (
    <svg style={iconWrap()} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 4h12v16H6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconEvidence() {
  return (
    <svg style={iconWrap()} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3l7 4v10l-7 4-7-4V7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 12V7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg style={iconWrap()} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 15a8.6 8.6 0 0 0 .1-2l2-1.5-2-3.5-2.4.7a8 8 0 0 0-1.7-1l-.4-2.5H11l-.4 2.5a8 8 0 0 0-1.7 1L6.5 8l-2 3.5 2 1.5a8.6 8.6 0 0 0 .1 2l-2 1.5 2 3.5 2.4-.7a8 8 0 0 0 1.7 1l.4 2.5h4l.4-2.5a8 8 0 0 0 1.7-1l2.4.7 2-3.5-2-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAiDiscovery() {
  return (
    <svg style={iconWrap()} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  "/runs": <IconRuns />,
  "/policies": <IconPolicies />,
  "/evidence": <IconEvidence />,
  "/ai-discovery": <IconAiDiscovery />,
};

export default function AppSidebar({ email }: { email: string | null }) {
  const pathname = usePathname() ?? "/runs";

  return (
    <aside className="govai-app-sidebar">
      <Suspense
        fallback={
          <Link
            href="/runs"
            aria-label="GovAI"
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
            <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
              <AigovMark size={30} glow={false} neon={false} neonStrength="off" tone="blue" />
            </span>
            <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.02em" }}>GovAI Console</span>
              <span style={{ fontSize: 11.5, color: "var(--govai-text-tertiary)" }}>Compliance evidence</span>
            </span>
          </Link>
        }
      >
        <AppSidebarBrand />
      </Suspense>

      <div style={{ marginTop: 16, padding: "0 4px 0 10px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--govai-text-label)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Workspace
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--govai-text-secondary)" }}>Default</div>
      </div>

      <nav style={{ marginTop: 10, display: "grid", gap: 3 }} aria-label="Primary">
        {CONSOLE_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`govai-nav-link${active ? " govai-nav-link--active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 10,
                padding: "8px 10px 8px 8px",
                borderRadius: 9,
                border: "none",
                textDecoration: "none",
                fontSize: 13,
                letterSpacing: "-0.01em",
                transition: "background 0.15s ease, color 0.15s ease",
              }}
            >
              {ICONS[item.href] ?? <IconRuns />}
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          paddingLeft: 10,
          paddingRight: 6,
          borderTop: "1px solid var(--govai-border-faint)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--govai-text-label)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Account
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            lineHeight: 1.35,
            color: "var(--govai-text-secondary)",
            wordBreak: "break-word",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {email ?? "—"}
        </div>
        <a
          href="#"
          aria-disabled="true"
          title="Settings coming soon"
          style={{
            marginTop: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: "var(--govai-text-tertiary)",
            textDecoration: "none",
            fontSize: 12.5,
            fontWeight: 400,
            cursor: "not-allowed",
            userSelect: "none",
          }}
          onClick={(e) => e.preventDefault()}
        >
          <IconSettings />
          Settings
        </a>
      </div>
    </aside>
  );
}
