create table if not exists public.teams (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.assessments (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  status text not null default 'draft'
);

create index if not exists idx_team_members_user_id on public.team_members(user_id);
create index if not exists idx_assessments_team_id on public.assessments(team_id);
create index if not exists idx_assessments_created_by on public.assessments(created_by);
