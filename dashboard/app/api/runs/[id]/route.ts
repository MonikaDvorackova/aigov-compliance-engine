import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRunByIdFromGovai, isConsoleRunsReadEnabled } from "@/lib/console/govaiConsoleRunsRead";
import type { RunRow } from "@/lib/console/runTypes";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

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
    const { run, error } = await fetchRunByIdFromGovai(id);
    // Parity with Supabase branch below: `.single()` failures are collapsed to the same 404 body.
    if (error || !run) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Run not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, run }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("runs")
    .select(
      "id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Run not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, run: data as RunRow }, { status: 200 });
}
