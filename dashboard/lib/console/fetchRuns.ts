import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchRecentComplianceRunsFromGovai,
  fetchRecentRunsFromGovai,
  isConsoleRunsReadEnabled,
} from "./govaiConsoleRunsRead";
import type { RunRow } from "./runTypes";
import { RUNS_LIST_COLUMNS } from "./runTypes";

export async function fetchRecentRuns(
  supabase: SupabaseClient,
  limit: number
): Promise<{ runs: RunRow[]; error: Error | null }> {
  if (isConsoleRunsReadEnabled()) {
    void supabase;
    return fetchRecentRunsFromGovai(limit);
  }

  const { data, error } = await supabase
    .from("runs")
    .select(RUNS_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { runs: [], error: new Error(error.message) };
  }

  return { runs: (data ?? []) as RunRow[], error: null };
}

/**
 * Policies page historically used Supabase `compliance_runs`. With GovAI reads enabled, uses
 * `console.compliance_runs` (a view over `console.runs`).
 *
 * TODO(production-risk): Hosted Supabase `compliance_runs` may be a filtered view or separate table
 * with semantics not equivalent to `public.runs`. This repo only selects the same columns as `runs`;
 * a plain Postgres view cannot reproduce unknown RLS/filter logic. Validate against live DDL before
 * canary cutover; adjust the view (WHERE …) or query if policies must exclude rows that exist in `runs`.
 */
export async function fetchRecentRunsForPoliciesPage(
  supabase: SupabaseClient,
  limit: number
): Promise<{ runs: RunRow[]; error: Error | null }> {
  if (isConsoleRunsReadEnabled()) {
    void supabase;
    return fetchRecentComplianceRunsFromGovai(limit);
  }

  const { data, error } = await supabase
    .from("compliance_runs")
    .select(RUNS_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { runs: [], error: new Error(error.message) };
  }

  return { runs: (data ?? []) as RunRow[], error: null };
}
