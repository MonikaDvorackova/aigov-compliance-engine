> **Superseded tenant model:** Ledger tenant isolation is derived strictly from API key mapping via `GOVAI_API_KEYS_JSON`. `X-GovAI-Project` is metadata only and does not determine the ledger.

# Audit report: tenant scoped ledger isolation

## Summary

This report captured work to enforce **tenant-scoped ledger isolation** on GovAI audit routes. The narrative below retains the original scope list for history. **Operational truth today:** the ledger tenant is always resolved from the API key via **`GOVAI_API_KEYS_JSON`**; **`X-GovAI-Project` does not determine the ledger** (it is not a tenant selector).

## Scope

Changed files (original change set):

- `rust/src/govai_api.rs`
- `rust/src/project.rs`
- `rust/tests/billing_http.rs`
- `rust/tests/tenant_isolation_http.rs`
- `.github/workflows/compliance.yml`
- `.github/workflows/govai-check.yml`

## What changed

- Ledger access is resolved per request from **API key → tenant** mapping in **`GOVAI_API_KEYS_JSON`**.
- **`X-GovAI-Project`** may be sent for metering, client metadata, or correlation; it **does not** select which tenant ledger is read or written.
- Ledger paths are tenant scoped as `audit_log__<tenant>.jsonl` (per configured ledger directory and tenant id).
- In `staging` and `prod`, requests that require a tenant for ledger routes must present an API key that maps in **`GOVAI_API_KEYS_JSON`**; missing mapping yields **`missing_tenant_context`** (or equivalent) rather than silently using another tenant.

**Historical claims (no longer accurate — do not use for operations):**

- ~~`X-GovAI-Project` is the primary tenant source~~
- ~~Bearer token fingerprint is the fallback tenant source~~

## Compatibility

Prior response semantics are preserved where possible:

- `GET /bundle` keeps `200` with `ok:false` for non success cases.
- `GET /bundle-hash` keeps `200` with `ok:false` for non success cases.
- `GET /compliance-summary` keeps `200` with `ok:false` for non success cases.
- `GET /verify` keeps `200` with `ok:false` for verification failures.
- `GET /api/export/:run_id` keeps prior error classification except for missing tenant context in non dev where tenant mapping is required.

## Intentional behavioral change

Ledger-touching routes require a **mapped API key** (tenant context from **`GOVAI_API_KEYS_JSON`**) in `staging` and `prod` where tenant enforcement applies.

Affected routes (tenant-scoped ledger reads/writes):

- `POST /evidence`
- `GET /bundle`
- `GET /bundle-hash`
- `GET /compliance-summary`
- `GET /verify`
- `GET /verify-log`
- `GET /api/export/:run_id`

## CI change

The compliance workflow runs `govai check` against the local audit service in the same job where the audit service is started. The external GovAI audit gate is skipped when `GOVAI_AUDIT_BASE_URL` is not configured.

## Risks

- Clients in `staging` and `prod` must use an API key that appears in **`GOVAI_API_KEYS_JSON`** with the intended tenant mapping.
- `GET /bundle-hash` and `GET /verify-log` remain open in auth terms as implemented, but ledger data is still scoped to the tenant implied by the API key.

## Validation

- `cargo test --manifest-path rust/Cargo.toml`
- Rust tests passed, including route level tenant isolation coverage.

## Evaluation gate

The change was evaluated against its intended safety and compatibility goals.

Checks performed:

- Tenant ledger isolation is enforced per request from API key mapping.
- Tenant A cannot read Tenant B data through bundle, compliance summary, or export routes when different keys map to different tenants.
- Ingest writes only to the resolved tenant ledger.
- Development mode behavior remains documented in env and operator runbooks.
- Staging and production reject missing tenant context for ledger-touching routes when mapping is required.

Result: passed.

## Human approval gate

This change requires human approval because it modifies core audit ledger behavior and tenant resolution expectations.

Approval checklist:

- Tenant isolation model reviewed (API key mapping as source of truth).
- Compatibility impact reviewed.
- Intentional behavior change documented.
- Rust test suite passed.
- CI workflow impact documented.

Approval status: pending reviewer approval through the pull request review process.
