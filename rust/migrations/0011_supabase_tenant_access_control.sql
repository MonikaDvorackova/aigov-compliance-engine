-- Supabase tenant/team access control (P0 for external pilot users).
-- Enforces: a signed-in user may only read runs/artifacts for teams they belong to.
-- Portable guard: Supabase-specific roles/functions/policies are applied only when available.

-- =====================================================
-- 1) Compatibility views (dashboard queries `public.runs`)
-- =====================================================

create or replace view public.runs as
select
  r.id,
  r.created_at,
  r.mode,
  r.status,
  r.policy_version,
  r.bundle_sha256,
  r.evidence_sha256,
  r.report_sha256,
  r.evidence_source,
  r.closed_at,
  r.environment,
  m.team_id
from
  console.runs r
  left join public.govai_run_meters m on m.run_id = r.id;

create or replace view public.compliance_runs as
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
  environment,
  team_id
from
  public.runs;

-- =====================================================
-- 2) RLS enablement
-- =====================================================

alter table public.team_members enable row level security;
alter table public.govai_run_meters enable row level security;
alter table console.runs enable row level security;

-- =====================================================
-- 3) Supabase RLS policies
-- =====================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'auth'
         and p.proname = 'uid'
     )
  then
    drop policy if exists team_members_select_own on public.team_members;

    create policy team_members_select_own
    on public.team_members
    for select
    to authenticated
    using (user_id = auth.uid());

    drop policy if exists govai_run_meters_select_by_team_membership on public.govai_run_meters;

    create policy govai_run_meters_select_by_team_membership
    on public.govai_run_meters
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.team_members tm
        where tm.team_id = public.govai_run_meters.team_id
          and tm.user_id = auth.uid()
      )
    );

    drop policy if exists console_runs_select_by_team_membership on console.runs;

    create policy console_runs_select_by_team_membership
    on console.runs
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.govai_run_meters m
        join public.team_members tm
          on tm.team_id = m.team_id
        where m.run_id = console.runs.id
          and tm.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- =====================================================
-- 4) Storage (packs/audit/evidence) read access
-- =====================================================
-- These policies assume object names are `{run_id}.zip` (packs) or `{run_id}.json` (audit/evidence).

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and exists (
       select 1
       from information_schema.tables
       where table_schema = 'storage'
         and table_name = 'objects'
     )
     and exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'auth'
         and p.proname = 'uid'
     )
  then
    drop policy if exists storage_objects_select_packs_audit_evidence_by_team on storage.objects;

    create policy storage_objects_select_packs_audit_evidence_by_team
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id in ('packs', 'audit', 'evidence')
      and exists (
        select 1
        from public.govai_run_meters m
        join public.team_members tm
          on tm.team_id = m.team_id
        where m.run_id = split_part(storage.objects.name, '.', 1)
          and tm.user_id = auth.uid()
      )
    );
  end if;
end $$;