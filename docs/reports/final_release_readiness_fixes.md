# Final release readiness fixes

## Summary

Aligned customer-facing documentation with implemented Stripe billing, set the composite GitHub Action’s **`require_export`** default to **`true`** to match the documented strict gate, corrected **`README.md`** CI semantics (**`submit-evidence-pack`** + **`verify-evidence-pack`** vs **`govai check`**), bumped stale **`aigov-py`** PyPI pin references to **`0.2.1`** (matching **`python/pyproject.toml`**), added a partial unique index so each non-null Stripe customer id maps to at most one ledger tenant, and clarified metered usage retry behaviour in **`docs/billing.md`**. **`Makefile`** **`audit` / `audit_bg`** now prebuild with **`--locked`**, start **`target/debug/aigov_audit`** explicitly, and align the Rust **`aigov_audit`** crate version with **`0.2.1`** (independent from the PyPI package name).

## Billing documentation alignment

- **`docs/index.md`**: product scope now lists hosted Stripe capabilities and links **`docs/billing.md`**; removed the incorrect claim that there is no automated billing in-repo.
- **`docs/hosted-pilot-runbook.md`**: removed “no billing yet”; added an operator Stripe checklist (secrets, webhook path, price mapping, enforcement) with link to **`docs/billing.md`**.

## GitHub Action export default

- **`action.yml`** and **`.github/actions/govai-check/action.yml`**: **`require_export`** default is **`"true"`** so **`verify-evidence-pack`** receives **`--require-export`** unless callers opt out.
- **`docs/github-action.md`**: explicit note that the default export cross-check is part of the full audit guarantee in CI.

## Stripe tenant uniqueness

- **`rust/migrations/0016_unique_stripe_customer_id.sql`**: partial unique index on **`tenant_billing_accounts(stripe_customer_id)`** where non-null.
- **`rust/src/db.rs`**: **`EXPECTED_SQLX_MIGRATION_COUNT`** set to **16** (directory parity test).

## Makefile `audit_bg` / Rust binary selection

**Root cause (CI):** the `aigov_audit` crate defines **multiple** binaries (`aigov_audit` + `portable_evidence_digest_once`). Plain `cargo run` is ambiguous unless **`--bin`** is set. **`make audit_bg`** also started **`cargo run`** in the background: the first-run **compile** often exceeds the **~12s** readiness poll window, so `curl GET /ready` never succeeded and Make reported failure even when compilation was still in progress.

**Fix:** **`Makefile`** now sets **`AIGOV_AUDIT_BIN ?= aigov_audit`**, uses **`cargo build --bin $(AIGOV_AUDIT_BIN) --locked`** before background start, launches **`rust/target/debug/$(AIGOV_AUDIT_BIN)`** with **`exec`** after **`cd '$(CURDIR)/rust'`** (stable path from repo root). **`audit`** uses **`cargo run --bin $(AIGOV_AUDIT_BIN) --locked`**. Readiness wait extended to **60 × 0.5s** (30s). Failure tail increased to **200** lines.

## Rust crate version (`aigov_audit`)

**`rust/Cargo.toml`** package version bumped **`0.1.0` → `0.2.1`** to align the shipped audit **crate** with the **`aigov-py==0.2.1`** **PyPI** release line — same product milestone, distinct artifact (**Rust binary** vs **Python CLI**). **`GET /` `version`** still comes from **`CARGO_PKG_VERSION`**.

## Verification

- `make audit_bg` / `make audit_stop` (requires reachable **`DATABASE_URL`** / Postgres, as in **`.github/workflows/govai-ci.yml`**).
- `make gate`
- `cd rust && cargo test -q`
- `cd python && python -m pytest -q`
- `cd dashboard && npm test`

## Evaluation gate

- Docs and shipped action behaviour agree on billing presence and on **`require_export`** default **`true`**.
- PyPI pin narrative matches **`python/pyproject.toml`** (**`0.2.1`**).
- Migration count matches the **`rust/migrations/`** file set; new index enforces one tenant per Stripe customer id when the id is set.
- **`make audit`** / **`audit_bg`** select the **`aigov_audit`** binary explicitly, prebuild before background start avoids readiness races with compilation, **`--locked`** keeps CI deterministic.

## Human approval gate

- Confirm no production database contains duplicate non-null **`stripe_customer_id`** values before applying migration **0016** (migration will fail if duplicates exist).
- Confirm downstream workflows that relied on implicit **`require_export: false`** either set **`require_export: false`** explicitly or accept stricter export verification.
- **`make audit_bg`** still **fails closed** if Postgres is unreachable or **`GET /ready`** never returns 200; operators must supply the same env as CI (**`DATABASE_URL`**, **`GOVAI_AUTO_MIGRATE=true`** behaviour, etc.).
