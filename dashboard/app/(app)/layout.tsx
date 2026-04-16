import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AigovMark from "@/app/components/brand/AigovMark";

export const dynamic = "force-dynamic";

function navLinkStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 10,
    border: active ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(0,0,0,0)",
    background: active ? "rgba(255,255,255,0.05)" : "transparent",
    color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.78)",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "-0.01em",
  };
}

function iconStyle(): React.CSSProperties {
  return {
    width: 18,
    height: 18,
    display: "inline-block",
    opacity: 0.85,
  };
}

function IconRuns() {
  return (
    <svg style={iconStyle()} viewBox="0 0 24 24" aria-hidden="true">
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

function IconSettings() {
  return (
    <svg style={iconStyle()} viewBox="0 0 24 24" aria-hidden="true">
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

function IconSoon() {
  return (
    <svg style={iconStyle()} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16h.01" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M12 2.5c5.25 0 9.5 4.25 9.5 9.5S17.25 21.5 12 21.5 2.5 17.25 2.5 12 6.75 2.5 12 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[layout] AUTH GUARD", { hasUser: Boolean(user), email: user?.email ?? null });

  if (!user) {
    console.log("[layout] NO USER → redirect(/login)");
    redirect("/login");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--govai-bg-app)",
        color: "var(--govai-text-primary)",
        display: "flex",
        flexDirection: "row",
      }}
    >
      <aside
        style={{
          width: 256,
          minWidth: 256,
          borderRight: "1px solid var(--govai-border-ink-faint)",
          background: "var(--govai-bg-sidebar)",
          display: "flex",
          flexDirection: "column",
          padding: 14,
        }}
      >
        <Link
          href="/runs"
          aria-label="GovAI"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 10px",
            borderRadius: 12,
            textDecoration: "none",
            color: "rgba(255,255,255,0.92)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
            <AigovMark size={30} glow={false} neon={false} tone="blue" />
          </span>
          <span style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>GovAI Console</span>
            <span style={{ fontSize: 12, opacity: 0.6 }}>Compliance evidence</span>
          </span>
        </Link>

        <div style={{ marginTop: 10, padding: "0 6px" }}>
          <div style={{ fontSize: 11, opacity: 0.55, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Workspace
          </div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.82 }}>Runs</div>
        </div>

        <nav style={{ marginTop: 12, display: "grid", gap: 4 }}>
          <Link href="/runs" aria-current="page" style={navLinkStyle(true)}>
            <IconRuns />
            Runs
          </Link>

          <div
            aria-disabled="true"
            style={{
              ...navLinkStyle(false),
              opacity: 0.55,
              cursor: "not-allowed",
              userSelect: "none",
            }}
            title="Coming soon"
          >
            <IconSoon />
            Policies
          </div>

          <div
            aria-disabled="true"
            style={{
              ...navLinkStyle(false),
              opacity: 0.55,
              cursor: "not-allowed",
              userSelect: "none",
            }}
            title="Coming soon"
          >
            <IconSoon />
            Evidence
          </div>
        </nav>

        <div style={{ flex: 1 }} />

        <div
          style={{
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Account
          </div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9, wordBreak: "break-word" }}>{user.email}</div>
          <a
            href="#"
            aria-disabled="true"
            title="Settings coming soon"
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "transparent",
              color: "rgba(255,255,255,0.7)",
              textDecoration: "none",
              fontSize: 13,
              opacity: 0.8,
              cursor: "not-allowed",
              userSelect: "none",
            }}
          >
            <IconSettings />
            Settings
          </a>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            height: 56,
            padding: "0 18px",
            borderBottom: "1px solid var(--govai-border-ink-faint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--govai-bg-app)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: "-0.01em" }}>Runs</div>
            <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" }}>Integrity review & artifacts</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.68 }}>Signed in</div>
            <div
              style={{
                fontSize: 13,
                opacity: 0.9,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              {user.email}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, minWidth: 0, padding: "22px 24px 36px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}