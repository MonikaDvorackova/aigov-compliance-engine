import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AigovMarkStatic from "@/app/components/brand/AigovMarkStatic";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0B1020",
        background:
          "radial-gradient(1100px 520px at 50% 8%, rgba(255,255,255,0.08), rgba(0,0,0,0))",
        color: "white",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/runs" style={{ display: "inline-flex", alignItems: "center" }}>
          <AigovMarkStatic
            style={{
              width: 120,
              height: "auto",
              opacity: 0.9,
              transition: "opacity 120ms ease",
            }}
          />
        </Link>

        <div style={{ fontSize: 13, opacity: 0.6 }}>
          Signed in as {user.email}
        </div>
      </header>

      {/* CONTENT */}
      <main style={{ flex: 1, padding: 24 }}>
        {children}
      </main>
    </div>
  );
}
