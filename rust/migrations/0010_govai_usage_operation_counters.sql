-- Minimal hosted usage operation counters (non-billing):
-- - compliance_checks
-- - exports
-- - discovery_scans (reserved; incremented only if/when such endpoint exists)

-- Legacy metering-off tenant usage table.
ALTER TABLE public.govai_usage_counters
  ADD COLUMN IF NOT EXISTS compliance_checks_count BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.govai_usage_counters
  ADD COLUMN IF NOT EXISTS exports_count BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.govai_usage_counters
  ADD COLUMN IF NOT EXISTS discovery_scans_count BIGINT NOT NULL DEFAULT 0;

-- Metering-on team monthly aggregates.
ALTER TABLE public.govai_team_usage_monthly
  ADD COLUMN IF NOT EXISTS compliance_checks BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.govai_team_usage_monthly
  ADD COLUMN IF NOT EXISTS exports BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.govai_team_usage_monthly
  ADD COLUMN IF NOT EXISTS discovery_scans BIGINT NOT NULL DEFAULT 0;

