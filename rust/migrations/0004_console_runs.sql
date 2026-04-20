-- Console schema: run metadata for Next.js dashboard + ingest (phase 1).
-- Auth remains Supabase; no changes to public.teams / assessments / compliance_workflow.
-- Apply with the same DATABASE_URL as the Rust enterprise layer.

create schema if not exists console;

create table if not exists console.runs (
  id text primary key,
  created_at timestamptz not null,
  mode text,
  status text,
  policy_version text,
  bundle_sha256 text,
  evidence_sha256 text,
  report_sha256 text,
  evidence_source text,
  closed_at timestamptz
);

create index if not exists idx_console_runs_created_at_desc
  on console.runs (created_at desc);

create index if not exists idx_console_runs_status
  on console.runs (status);

create index if not exists idx_console_runs_policy_version
  on console.runs (policy_version);

comment on table console.runs is
  'Compliance run manifest rows for GovAI console; source of truth when GOVAI_CONSOLE_RUNS_ENABLED is on.';

-- Policies UI historically queried `compliance_runs` on Supabase with the same column set as `runs`.
-- In-repo evidence shows identical projections; expose as a view for compatibility (not a separate table).
create or replace view console.compliance_runs as
select
  id,
  created_at,
  mode,
  status,
  policy_version,
  bundle_sha256,
  evidence_sha256,
  report_sha256,
  evidence_source,
  closed_at
from
  console.runs;
