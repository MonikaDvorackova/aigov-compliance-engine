/**
 * User-facing policy register copy — no raw backend errors.
 * Operational details stay in server logs only.
 */

export type PoliciesRegisterLoadState = "no_runs" | "unavailable";

export const policiesEmptyHeadline: Record<PoliciesRegisterLoadState, { title: string; body: string }> = {
  no_runs: {
    title: "No policy data yet",
    body: "Run a compliance job, then refresh — versions and health appear from recorded runs.",
  },
  unavailable: {
    title: "Unable to load policy data",
    body: "Runs did not load. Check access and connectivity, then reload.",
  },
};

export const policiesPipelineStatus: Record<PoliciesRegisterLoadState, string> = {
  no_runs: "No data",
  unavailable: "Unavailable",
};
