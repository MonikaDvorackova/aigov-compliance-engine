-- One non-null Stripe customer id maps to at most one ledger tenant (billing isolation).
create unique index if not exists tenant_billing_accounts_stripe_customer_id_unique
  on public.tenant_billing_accounts (stripe_customer_id)
  where stripe_customer_id is not null;

comment on index public.tenant_billing_accounts_stripe_customer_id_unique is
  'Ensures webhook and invoice handlers cannot attach one Stripe customer to multiple GovAI tenants.';
