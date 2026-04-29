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
  environment: string | null;
};

type TeamMembershipRow = { team_id: string };

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

  // Resolve caller's teams (RLS should allow selecting own memberships only).
  const { data: memberships, error: memberErr } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id);

  if (memberErr) {
    return NextResponse.json(
      { ok: false, error: "db_error", message: memberErr.message },
      { status: 500 }
    );
  }

  const teamIds = ((memberships ?? []) as TeamMembershipRow[])
    .map((m) => m.team_id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  if (teamIds.length === 0) {
    return NextResponse.json({ ok: true, runs: [] as RunRow[] }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("runs")
    .select(
      "id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at,environment"
    )
    .in("team_id", teamIds)
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
