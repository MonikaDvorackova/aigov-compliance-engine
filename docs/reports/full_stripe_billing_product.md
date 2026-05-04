# Full Stripe billing product (hosted GovAI)

## Summary

GovAI now exposes a **hosted customer billing path** backed by Stripe: multi–billing-unit subscription line items, Checkout, Billing Portal, invoice listing, idempotent metered usage reporting, Stripe Tax delegation (optional), subscription/invoice webhooks for dunning state, optional **billing enforcement** on audit APIs, dashboard **Billing** page, and a **reconciliation** export. Ledger identity is **`GOVAI_API_KEYS_JSON` → `tenant_id`**; `X-GovAI-Project` is not a billing security boundary.

## Data model

Aligned with **staging** migrations **0013** (`govai_billing_usage_trace`) and **0014** (`tenant_billing_accounts`, `billing_usage_reports`). Migration **`0015_stripe_billing_subscription_items.sql`** adds only what is new on top of 0014:

| Change | Role |
|--------|------|
| `tenant_billing_accounts.latest_invoice_id` | Optional column (additive). |
| `tenant_billing_subscription_items` | Unique `(tenant_id, billing_unit)` → Stripe subscription item + price; indexes on item id and price id. |
| `govai_stripe_webhook_events` | Webhook idempotency by Stripe event id. |
| `tenant_billing_usage_attributions` | Per-run usage rows for reconciliation. |

`EXPECTED_SQLX_MIGRATION_COUNT` is **15** (migrations `0001`–`0015`).

## Stripe price mapping

Environment variables map Stripe **price ids** to GovAI **billing units**:

- `GOVAI_STRIPE_PRICE_EVIDENCE_EVENT`
- `GOVAI_STRIPE_PRICE_COMPLIANCE_CHECK`
- `GOVAI_STRIPE_PRICE_AUDIT_EXPORT`
- `GOVAI_STRIPE_PRICE_DISCOVERY_SCAN`

Legacy: `GOVAI_STRIPE_PRICE_ID` maps to `evidence_event` when unit-specific vars are unset.

Unknown subscription item prices log a structured JSON line to stderr and are skipped.

## Checkout flow

`POST /billing/checkout-session` with `success_url`, `cancel_url`. Builds a Stripe Checkout Session in **subscription** mode with one line item per configured price; optional `automatic_tax[enabled]=true` when `GOVAI_STRIPE_AUTOMATIC_TAX=on`.

## Billing portal

`POST /billing/portal-session` with `return_url`. Requires `stripe_customer_id`; otherwise `404` + `BILLING_ACCOUNT_NOT_FOUND`.

## Invoice visibility

`GET /billing/invoices` lists Stripe invoices for the tenant’s Stripe customer only.

## Usage reporting

`POST /billing/report-usage` with optional `billing_unit` (default `evidence_event`). Quantity = count of attribution rows in the resolved billing window. Stripe usage record id stored on success; duplicates for the same period are **not** double-reported.

## Reconciliation

`GET /billing/reconciliation?from&to&billing_unit?` returns usage buckets with `runs[]` (`run_id`, `occurred_at`, `verdict`) and `billing_reports[]` from `billing_usage_reports`. Strictly tenant-scoped.

## Tax handling

No internal tax math. Optional Stripe automatic tax at Checkout; operators configure **Stripe Tax** in Stripe.

## Dunning and payment recovery

Webhooks: `invoice.payment_failed`, `invoice.payment_action_required` → `past_due`; `invoice.paid` refreshes subscription; subscription objects keep status in sync. No GovAI-sent dunning emails.

## Billing enforcement

`GOVAI_BILLING_ENFORCEMENT=on`: middleware returns **`403`** + `BILLING_INACTIVE` unless subscription is `active` or `trialing`. Exemptions: checkout, status, portal, webhook, health/ready.

## Dashboard billing page

`dashboard/app/(app)/billing/page.tsx` + `BillingClient.tsx`; nav entry **`/billing`**. Uses `NEXT_PUBLIC_GOVAI_API_BASE_URL` and sessionStorage API key (documented in `lib/govaiHostedBilling.ts`).

## Verification

Commands run locally:

- `cd rust && cargo test --lib -q` — pass (86 tests).
- `cd rust && cargo test stripe_billing_product -q` — pass when `DATABASE_URL` set (1 integration test).
- `cd python && python -m pytest -q` — pass (115 tests).
- `cd dashboard && npm test` — pass (119 tests).

## Remaining limitations

- **API key is stored in sessionStorage for MVP purposes** on the dashboard billing page; not a hardened production pattern.
- Stripe **usage records** require compatible metered prices on subscription items.
- Attribution coverage starts from deployment of this version forward unless backfilled.
- Process-wide `GOVAI_API_KEYS_JSON` init: run billing integration tests with `--test-threads=1` if other tests conflict in one process.
