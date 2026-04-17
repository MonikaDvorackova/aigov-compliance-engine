import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[login/page] getUser", { hasUser: Boolean(user) });

  if (user) {
    console.log("[login/page] redirect -> /runs");
    redirect("/runs");
  }

  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
