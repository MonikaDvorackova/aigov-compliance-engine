import React from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";

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

  console.log("[layout] AUTH GUARD", { hasUser: Boolean(user), email: user?.email ?? null });

  if (!user) {
    console.log("[layout] NO USER → redirect(/login)");
    redirect("/login");
  }

  return (
    <div className="govai-app-shell">
      <AppSidebar email={user.email ?? null} />

      <div className="govai-app-main">
        <AppHeader email={user.email ?? null} />
        <main className="govai-app-content">{children}</main>
      </div>
    </div>
  );
}
