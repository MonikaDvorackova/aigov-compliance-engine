# Stripe billing completion report

## Summary

GovAI now exposes a **minimal paid-customer billing path** backed by Postgres and Stripe: tenant-scoped billing accounts, idempotent webhook processing, Checkout Session creation, billing status reads, idempotent usage reporting to Stripe metered items, and optional **`GOVAI_BILLING_ENFORCEMENT`** to block hosted APIs when the subscription is not `active` / `trialing`. No billing UI and no multi-tier pricing engine were added.

## Data model

Migration **`0014_tenant_stripe_billing.sql`**:

- **`tenant_billing_accounts`** — PK `tenant_id` (text, ledger tenant from API key mapping). Stripe ids, `subscription_status`, billing period bounds, `billing_invoice_status`. Indexes on `stripe_customer_id`, `stripe_subscription_id`.
- **`billing_usage_reports`** — Per-tenant, per-unit, per-period aggregates with optional Stripe usage record id. **Unique** `(tenant_id, billing_unit, period_start, period_end)` for idempotent reporting.

Existing tables unchanged in behavior: **`govai_billing_usage_trace`**, **`stripe_webhook_events`**.

## Checkout flow

1. Operator configures **`GOVAI_STRIPE_SECRET_KEY`** and **`GOVAI_API_KEYS` / `GOVAI_API_KEYS_JSON`**.
2. Customer calls **`POST /billing/checkout-session`** with `price_id`, `success_url`, `cancel_url`.
3. Server creates a Stripe Checkout Session (subscription mode) with **`client_reference_id`** and **metadata** set to **`tenant_id`**.
4. After payment, Stripe sends **`checkout.session.completed`**; webhook upserts **`tenant_billing_accounts`**.

## Webhook lifecycle

- **`POST /stripe/webhook`** verifies **`Stripe-Signature`** with **`GOVAI_STRIPE_WEBHOOK_SECRET`**.
- Events stored by **`stripe_event_id`** (idempotent insert).
- Supported business events: **`checkout.session.completed`**, **`customer.subscription.created|updated|deleted`**, **`invoice.paid`**, **`invoice.payment_failed`**.
- Unmapped invoices/subscriptions do **not** fail the HTTP handler (avoid retry storms); mapped rows update deterministically.

## Usage reporting

- **`POST /billing/report-usage`** counts **`govai_billing_usage_trace`** rows for the resolved period, inserts or hits unique **`billing_usage_reports`**, then optionally **`POST /v1/subscription_items/.../usage_records`** when **`stripe_subscription_item_id`** is known.
- Failures mark **`failed`** + `last_error` and return **502** for operator retry.

## Billing enforcement

- **`GOVAI_BILLING_ENFORCEMENT=on`**: middleware on gated audit routes blocks tenants without **`active` / `trialing`** subscription status in **`tenant_billing_accounts`** (**403** `BILLING_INACTIVE`).
- Exemptions: **`/health`**, **`/ready`**, **`/stripe/webhook`**, **`/billing/checkout-session`**, **`/billing/status`**.

## Verification

Commands run during implementation:

```bash
cd rust && cargo test --lib -q
cd rust && cargo test billing -q
cd python && python -m pytest -q
grep -R "aigov-py==" . --glob '!**/node_modules/**' --glob '!**/target/**' --glob '!**/.git/**'
```

## Remaining limitations

- Single subscription item id for metered usage; multi-item plans need manual or future extension.
- No UI, no tax, no invoice PDF handling in-app.
- `team_billing` / `team_subscriptions` (0012) remain unused by this path; consolidation would be a future migration if product requires UUID teams instead of string ledger tenants.
