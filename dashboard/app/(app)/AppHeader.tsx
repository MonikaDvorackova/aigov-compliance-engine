"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { navMetaForPath } from "@/lib/console/nav";
import { AppHeaderNavIndicator } from "./AppHeaderNavIndicator";

export default function AppHeader({ email }: { email: string | null }) {
  const pathname = usePathname() ?? "/runs";
  const { title, subtitle } = navMetaForPath(pathname);

  return (
    <header className="govai-app-header">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--govai-text)" }}>{title}</div>
        <span style={{ color: "var(--govai-text-tertiary)", fontSize: 12, opacity: 0.85 }} aria-hidden="true">
          ·
        </span>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--govai-text-tertiary)",
            fontWeight: 400,
            minWidth: 0,
            maxWidth: "min(52ch, 100%)",
          }}
        >
          {subtitle}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Suspense fallback={null}>
          <AppHeaderNavIndicator label="Loading" />
        </Suspense>
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.3,
            maxWidth: 260,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            padding: "4px 9px",
            borderRadius: 7,
            border: "1px solid var(--govai-border-faint)",
            background: "rgba(255,255,255,0.02)",
            color: "var(--govai-text-secondary)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontWeight: 400,
          }}
          title={email ?? undefined}
        >
          {email ?? "—"}
        </div>
      </div>
    </header>
  );
}
