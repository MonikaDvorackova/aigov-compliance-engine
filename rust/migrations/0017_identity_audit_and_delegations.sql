-- Phase 1: Enterprise RBAC foundations
-- - delegated approvals
-- - identity audit logging (append-only)

create table if not exists public.identity_audit_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_user_id uuid not null,
  action text not null,
  object_type text not null,
  object_id text not null,
  details jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

-- Append-only guardrail: disallow UPDATE/DELETE in production posture by convention.
-- (Enforced by application; DB-level triggers can be added in later phases.)

create index if not exists identity_audit_log_team_ts_idx
  on public.identity_audit_log (team_id, ts desc);

create table if not exists public.compliance_workflow_delegations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id text not null,
  scope text not null, -- 'review' | 'promotion'
  delegator_user_id uuid not null,
  delegatee_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint compliance_workflow_delegations_scope_check check (scope in ('review','promotion'))
);

create index if not exists compliance_workflow_delegations_team_run_scope_idx
  on public.compliance_workflow_delegations (team_id, run_id, scope);

