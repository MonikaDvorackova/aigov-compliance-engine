import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRecentRunsFromGovai, isConsoleRunsReadEnabled } from "@/lib/console/govaiConsoleRunsRead";
import type { RunRow } from "@/lib/console/runTypes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json(
      { ok: false, error: "auth_error", message: userErr.message },
      { status: 401 }
    );
  }

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "Not signed in." },
      { status: 401 }
    );
  }

  if (isConsoleRunsReadEnabled()) {
    const { runs, error } = await fetchRecentRunsFromGovai(50);
    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_error", message: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, runs }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("runs")
    .select(
      "id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "db_error", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, runs: (data ?? []) as RunRow[] }, { status: 200 });
}
