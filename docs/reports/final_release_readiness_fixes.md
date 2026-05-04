# Final release readiness fixes

## Summary

Aligned customer-facing documentation with implemented Stripe billing, set the composite GitHub Action’s **`require_export`** default to **`true`** to match the documented strict gate, corrected **`README.md`** CI semantics (**`submit-evidence-pack`** + **`verify-evidence-pack`** vs **`govai check`**), bumped stale **`aigov-py`** PyPI pin references to **`0.2.1`** (matching **`python/pyproject.toml`**), added a partial unique index so each non-null Stripe customer id maps to at most one ledger tenant, and clarified metered usage retry behaviour in **`docs/billing.md`**.

## Billing documentation alignment

- **`docs/index.md`**: product scope now lists hosted Stripe capabilities and links **`docs/billing.md`**; removed the incorrect claim that there is no automated billing in-repo.
- **`docs/hosted-pilot-runbook.md`**: removed “no billing yet”; added an operator Stripe checklist (secrets, webhook path, price mapping, enforcement) with link to **`docs/billing.md`**.

## GitHub Action export default

- **`action.yml`** and **`.github/actions/govai-check/action.yml`**: **`require_export`** default is **`"true"`** so **`verify-evidence-pack`** receives **`--require-export`** unless callers opt out.
- **`docs/github-action.md`**: explicit note that the default export cross-check is part of the full audit guarantee in CI.

## Stripe tenant uniqueness

- **`rust/migrations/0016_unique_stripe_customer_id.sql`**: partial unique index on **`tenant_billing_accounts(stripe_customer_id)`** where non-null.
- **`rust/src/db.rs`**: **`EXPECTED_SQLX_MIGRATION_COUNT`** set to **16** (directory parity test).

## Verification

- `make gate`
- `cd rust && cargo test -q`
- `cd python && python -m pytest -q`
- `cd dashboard && npm test`

## Evaluation gate

- Docs and shipped action behaviour agree on billing presence and on **`require_export`** default **`true`**.
- PyPI pin narrative matches **`python/pyproject.toml`** (**`0.2.1`**).
- Migration count matches the **`rust/migrations/`** file set; new index enforces one tenant per Stripe customer id when the id is set.

## Human approval gate

- Confirm no production database contains duplicate non-null **`stripe_customer_id`** values before applying migration **0016** (migration will fail if duplicates exist).
- Confirm downstream workflows that relied on implicit **`require_export: false`** either set **`require_export: false`** explicitly or accept stricter export verification.
