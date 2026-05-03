-- Per successful evidence ingest: trace rows for billing reconciliation (run_id, ledger tenant, time).
-- Complements aggregate counters; does not replace metering tables.

create table if not exists public.govai_billing_usage_trace (
  id uuid primary key default gen_random_uuid(),
  ledger_tenant_id text not null,
  run_id text not null,
  billing_unit text not null default 'evidence_event',
  created_at timestamptz not null default now()
);

create index if not exists idx_govai_billing_usage_trace_tenant_time
  on public.govai_billing_usage_trace (ledger_tenant_id, created_at desc);

create index if not exists idx_govai_billing_usage_trace_run
  on public.govai_billing_usage_trace (run_id);

comment on table public.govai_billing_usage_trace is
  'One row per billable evidence_event successfully appended; used for GET /billing/usage-summary and Stripe reconciliation.';

comment on table public.stripe_webhook_events is
  'Stripe webhook idempotency log: POST /stripe/webhook verifies GOVAI_STRIPE_WEBHOOK_SECRET and inserts by stripe_event_id; duplicates return 200 without reprocessing.';
