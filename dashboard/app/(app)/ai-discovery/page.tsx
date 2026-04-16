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
        description="Signal-based discovery for OpenAI usage, Transformers, and model-weight filenames—plus evidence history, review, and monitoring (scheduled runs and alerts)."
      />
      <AiDiscoveryClient />
    </DashboardPageShell>
  );
}
