-- Phase 1: team-scoped metering (runs + evidence events) and API key -> team mapping.
-- Plan limits live in application code; no team_plan table in this phase.

-- Maps audit API key fingerprint (see api_usage::key_fingerprint) to a billing/usage team.
create table if not exists public.govai_api_key_billing (
  key_hash text not null primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_govai_api_key_billing_team
  on public.govai_api_key_billing (team_id);

-- Monthly aggregates (UTC year_month = year * 100 + month, e.g. 202604).
create table if not exists public.govai_team_usage_monthly (
  team_id uuid not null references public.teams (id) on delete cascade,
  year_month int not null,
  new_run_ids bigint not null default 0,
  evidence_events bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (team_id, year_month)
);

-- Per-run evidence volume (reconcilable with ledger; set from ingest path).
create table if not exists public.govai_run_meters (
  run_id text not null primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  event_count bigint not null default 0,
  first_ingest_at timestamptz not null default now()
);

create index if not exists idx_govai_run_meters_team
  on public.govai_run_meters (team_id);

-- Split operational request accounting (replaces using request_count alone for billing semantics).
-- `request_count` is deprecated: kept in sync as total of the two channel counters for backward compatibility.
alter table public.govai_api_key_usage
  add column if not exists evidence_ingest_count bigint not null default 0;

alter table public.govai_api_key_usage
  add column if not exists compliance_summary_read_count bigint not null default 0;

comment on column public.govai_api_key_usage.request_count is
  'Deprecated: total request-shaped ops; use evidence_ingest_count + compliance_summary_read_count.';
