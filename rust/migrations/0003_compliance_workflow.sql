-- Thin app-layer workflow for human queue + decisions (does not replace core policy / evidence ledger).

create table if not exists public.compliance_workflow (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  run_id text not null,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null,
  updated_by uuid,
  constraint compliance_workflow_state_valid check (
    state in (
      'pending_review',
      'approved',
      'rejected',
      'promotion_allowed',
      'promotion_blocked'
    )
  ),
  constraint compliance_workflow_team_run_unique unique (team_id, run_id)
);

create index if not exists idx_compliance_workflow_team_state
  on public.compliance_workflow (team_id, state);

create index if not exists idx_compliance_workflow_team_updated
  on public.compliance_workflow (team_id, updated_at desc);
