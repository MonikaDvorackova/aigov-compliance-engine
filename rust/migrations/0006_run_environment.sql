-- Deployment tier for console run manifests (dev / staging / prod).
-- Apply alongside other GovAI Postgres migrations (same DATABASE_URL as the Rust service).

alter table console.runs
  add column if not exists environment text not null default 'dev';

alter table console.runs
  drop constraint if exists console_runs_environment_valid;

alter table console.runs
  add constraint console_runs_environment_valid
  check (environment in ('dev', 'staging', 'prod'));

create index if not exists idx_console_runs_environment
  on console.runs (environment);

comment on column console.runs.environment is
  'Deployment tier for this run (dev, staging, prod). Mirrors AIGOV_ENVIRONMENT at ingest.';

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
  closed_at,
  environment
from
  console.runs;

-- See docs/env-resolution.md for tier semantics and backfill expectations.
--
-- Hosted Supabase: mirror on public.runs (and compliance_runs view if present), e.g.:
--   alter table public.runs add column if not exists environment text not null default 'dev';
--   alter table public.runs drop constraint if exists runs_environment_valid;
--   alter table public.runs add constraint runs_environment_valid
--     check (environment in ('dev', 'staging', 'prod'));
