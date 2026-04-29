import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/auth/supabaseAdmin";

export type RunAccessOk = {
  ok: true;
  user: User;
  teamId: string;
};

export type RunAccessErr = {
  ok: false;
  response: NextResponse;
};

export type RunAccessResult = RunAccessOk | RunAccessErr;

type RunMeterRow = { team_id: string };
type TeamMemberRow = { role: string };

/**
 * Authenticates the dashboard user and authorizes access to a specific run ID.
 *
 * Required behavior:
 * - 404 if the run does not exist (no run→team mapping)
 * - 403 if it exists but the caller is not a member of the owning team
 */
export async function requireRunTeamAccess(runIdRaw: string): Promise<RunAccessResult> {
  const runId = (runIdRaw ?? "").trim();
  if (!runId) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "bad_request", message: "Missing run id." },
        { status: 400 }
      ),
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "auth_error", message: userErr.message },
        { status: 401 }
      ),
    };
  }

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "unauthorized", message: "Not signed in." },
        { status: 401 }
      ),
    };
  }

  // Determine run existence + owning team with service role (server-only).
  // This is required to reliably return 404 vs 403 even when RLS is strict.
  const admin = createSupabaseServiceRoleClient();
  const { data: meterRow, error: meterErr } = await admin
    .from("govai_run_meters")
    .select("team_id")
    .eq("run_id", runId)
    .maybeSingle<RunMeterRow>();

  if (meterErr) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "db_error", message: meterErr.message },
        { status: 500 }
      ),
    };
  }

  if (!meterRow?.team_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "not_found", message: "Run not found." },
        { status: 404 }
      ),
    };
  }

  const teamId = meterRow.team_id;

  const { data: membership, error: memberErr } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle<TeamMemberRow>();

  if (memberErr) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "db_error", message: memberErr.message },
        { status: 500 }
      ),
    };
  }

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "forbidden", message: "You do not have access to this run." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user, teamId };
}

