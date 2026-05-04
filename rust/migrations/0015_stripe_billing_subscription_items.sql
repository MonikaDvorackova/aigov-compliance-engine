-- Extends staging 0014 tenant billing: multi-item metered lines, webhook idempotency, run-level attribution.
-- Does not recreate tenant_billing_accounts or billing_usage_reports (see 0014).

alter table public.tenant_billing_accounts
  add column if not exists latest_invoice_id text;

create table if not exists public.tenant_billing_subscription_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  billing_unit text not null,
  stripe_subscription_id text not null,
  stripe_subscription_item_id text not null,
  stripe_price_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_billing_subscription_items_tenant_unit unique (tenant_id, billing_unit)
);

create index if not exists idx_tb_sub_items_stripe_subscription_item_id
  on public.tenant_billing_subscription_items (stripe_subscription_item_id);

create index if not exists idx_tb_sub_items_stripe_price_id
  on public.tenant_billing_subscription_items (stripe_price_id);

create index if not exists idx_tb_sub_items_tenant
  on public.tenant_billing_subscription_items (tenant_id);

create table if not exists public.govai_stripe_webhook_events (
  stripe_event_id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

create table if not exists public.tenant_billing_usage_attributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  billing_unit text not null,
  run_id text not null,
  occurred_at timestamptz not null,
  verdict text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tb_usage_attr_tenant_unit_time
  on public.tenant_billing_usage_attributions (tenant_id, billing_unit, occurred_at);

comment on table public.tenant_billing_subscription_items is
  'Maps GovAI billing_unit to Stripe subscription line item for metered usage reporting.';

comment on table public.govai_stripe_webhook_events is
  'Stripe webhook idempotency log for GovAI hosted billing.';

comment on table public.tenant_billing_usage_attributions is
  'Per-run usage attribution for billing reconciliation (tenant scoped).';
