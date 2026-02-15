import React from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
        padding: 24,
        backgroundColor: "#0B1020",
        background:
          "radial-gradient(1100px 520px at 50% 8%, rgba(255,255,255,0.08), rgba(0,0,0,0))",
        color: "white",
      }}
    >
      {children}
    </div>
  );
}
