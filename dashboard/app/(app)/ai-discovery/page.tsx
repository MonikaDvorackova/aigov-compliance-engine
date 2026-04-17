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
        title="AI discovery"
        description="Find OpenAI API usage, Transformers references, and experimental weight-like filenames (.pt, .pth, .safetensors, .onnx, pytorch_model.bin). Other .bin files are not treated as weights."
      />
      <AiDiscoveryClient />
    </DashboardPageShell>
  );
}
