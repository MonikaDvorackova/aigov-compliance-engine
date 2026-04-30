-- Billing persistence foundation (Stripe-ready storage only).
--
-- This migration introduces durable storage for future Stripe monetization:
-- - team ↔ Stripe customer mapping
-- - team ↔ subscription state snapshot
-- - webhook event receipt idempotency log
--
-- IMPORTANT:
-- - This does NOT enable Stripe Checkout.
-- - This does NOT enable webhook handling.
-- - This does NOT change metering enforcement or runtime billing behavior.

create table if not exists public.team_billing (
  team_id uuid primary key references public.teams(id) on delete cascade,
  stripe_customer_id text unique,
  billing_email text,
  billing_owner_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_subscriptions (
  team_id uuid primary key references public.teams(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

create index if not exists idx_team_billing_stripe_customer_id
  on public.team_billing (stripe_customer_id);

create index if not exists idx_team_subscriptions_stripe_subscription_id
  on public.team_subscriptions (stripe_subscription_id);

create index if not exists idx_team_subscriptions_status
  on public.team_subscriptions (status);

comment on table public.team_billing is
  'Billing persistence foundation only: team billing metadata and Stripe customer mapping. Does not enable payments or change metering enforcement.';

comment on table public.team_subscriptions is
  'Billing persistence foundation only: subscription state snapshot for a team. Does not enable Stripe Checkout/webhooks and does not change metering enforcement.';

comment on table public.stripe_webhook_events is
  'Billing persistence foundation only: idempotency log for future Stripe webhook processing. No webhook handling is enabled by this migration.';

