-- Ledger-scoped tenant (API key mapping) ↔ Stripe subscription reconciliation.
-- Used by POST /stripe/webhook processors, GET /billing/status, POST /billing/report-usage, POST /billing/checkout-session.

create table if not exists public.tenant_billing_accounts (
  tenant_id text primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_item_id text,
  subscription_status text not null default 'none',
  current_period_start timestamptz,
  current_period_end timestamptz,
  billing_invoice_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_billing_accounts_stripe_customer_id
  on public.tenant_billing_accounts (stripe_customer_id);

create index if not exists idx_tenant_billing_accounts_stripe_subscription_id
  on public.tenant_billing_accounts (stripe_subscription_id);

create table if not exists public.billing_usage_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  billing_unit text not null,
  quantity bigint not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  stripe_subscription_item_id text,
  stripe_usage_record_id text,
  status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_usage_reports_period_unique unique (tenant_id, billing_unit, period_start, period_end)
);

create index if not exists idx_billing_usage_reports_tenant
  on public.billing_usage_reports (tenant_id, period_start desc);

comment on table public.tenant_billing_accounts is
  'Maps GovAI ledger tenant_id (from GOVAI_API_KEYS_JSON) to Stripe customer/subscription; updated by webhooks and checkout.';

comment on table public.billing_usage_reports is
  'Idempotent usage report rows per tenant/unit/period; Stripe usage record id stored when metered reporting succeeds.';
