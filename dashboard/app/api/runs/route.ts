import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  created_at: string;
  mode: string | null;
  status: string | null;
  policy_version: string | null;
  bundle_sha256: string | null;
  evidence_sha256: string | null;
  report_sha256: string | null;
  evidence_source: string | null;
  closed_at: string | null;
};

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
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

  const { data, error } = await supabase
    .from("runs")
    .select(
      "id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at"
    )
    .eq("id", ctx.params.id)
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: "db_error", message: error.message },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { ok: true, run: (data as RunRow) ?? null },
    { status: 200 }
  );
}
