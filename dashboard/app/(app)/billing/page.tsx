import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <BillingClient />;
}
