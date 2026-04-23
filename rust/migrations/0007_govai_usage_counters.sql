-- Monthly evidence-event counters per tenant (billing / quota).
CREATE TABLE IF NOT EXISTS public.govai_usage_counters (
    tenant_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    evidence_events_count BIGINT NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, period_start)
);
