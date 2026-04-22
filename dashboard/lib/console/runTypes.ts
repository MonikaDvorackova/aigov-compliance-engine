export type RunRow = {
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
  /** Deployment tier: dev | staging | prod (GovAI `AIGOV_ENVIRONMENT`). */
  environment: string | null;
};

export const RUNS_LIST_COLUMNS =
  "id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at,environment" as const;
