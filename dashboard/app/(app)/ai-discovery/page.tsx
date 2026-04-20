import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHero } from "@/app/_ui/dashboard/DashboardHero";
import { DashboardPageShell } from "@/app/_ui/dashboard/DashboardPageShell";

import AiDiscoveryClient from "./AiDiscoveryClient";

export const dynamic = "force-dynamic";

export default async function AiDiscoveryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardPageShell>
      <DashboardHero
        kicker="GovAI"
        title="AI Discovery"
        description="Signal-based discovery for OpenAI signals, Transformers signals, and model-weight filename signals—plus evidence history, review, and monitoring (scheduled + alerts)."
      />
      <AiDiscoveryClient />
    </DashboardPageShell>
  );
}
