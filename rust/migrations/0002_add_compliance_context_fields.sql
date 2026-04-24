-- File: migrations/20260219_0001_assessments_metadata_constraints.sql
-- Purpose: Add assessment metadata fields + integrity constraints + indexes

-- =====================================================
-- 1) Add columns (nullable for backward compatibility)
-- =====================================================

alter table public.assessments
add column if not exists system_name text,
add column if not exists intended_purpose text,
add column if not exists risk_class text;

-- =====================================================
-- 2) Safety constraints (length limits)
-- 3) Risk class constraint (AI Act aligned categories)
-- 4) Status safeguard (only if you use these states)
-- =====================================================

-- Postgres does not support `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS`; make creation idempotent.
-- Re-run safe: duplicate_object is ignored.
do $$
begin
  alter table public.assessments
    add constraint assessments_system_name_length
    check (system_name is null or char_length(system_name) <= 255);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.assessments
    add constraint assessments_intended_purpose_length
    check (intended_purpose is null or char_length(intended_purpose) <= 2000);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.assessments
    add constraint assessments_risk_class_valid
    check (
      risk_class is null or
      risk_class in ('minimal', 'limited', 'high', 'prohibited')
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.assessments
    add constraint assessments_status_valid
    check (status in ('draft', 'submitted', 'approved', 'rejected'));
exception
  when duplicate_object then null;
end $$;

-- =====================================================
-- 5) Indexes for filtering and reporting
-- =====================================================

create index if not exists idx_assessments_risk_class
on public.assessments (risk_class);

create index if not exists idx_assessments_team_created_at
on public.assessments (team_id, created_at desc);
