import React from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";

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

  if (!user) {
    redirect("/login");
  }

  const email = user.email ?? null;

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
      <AppSidebar email={email} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppHeader email={email} />

        <main style={{ flex: 1, minWidth: 0, padding: "22px 22px 32px" }}>{children}</main>
      </div>
    </div>
  );
}