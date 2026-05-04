# Audit report: tenant scoped ledger isolation

> **Superseded tenant model:** Ledger **tenant isolation** is **`GOVAI_API_KEYS_JSON` → API key** only. **`X-GovAI-Project`** is **not** a ledger isolation boundary (optional metadata / billing / usage labels). The body below is retained as a historical snapshot of the original change; read it together with this notice.

## Summary

This change enforces tenant scoped ledger isolation for GovAI audit routes.

## Scope

Changed files:
- `rust/src/govai_api.rs`
- `rust/src/project.rs`
- `rust/tests/billing_http.rs`
- `rust/tests/tenant_isolation_http.rs`
- `.github/workflows/compliance.yml`
- `.github/workflows/govai-check.yml`

## What changed

- Ledger access is resolved per request from the **API key** mapping (**`GOVAI_API_KEYS_JSON`**).
- **`X-GovAI-Project`** is **not** used to choose the ledger (billing / usage views may still reference it separately).
- Ledger paths are tenant scoped as `audit_log__<tenant>.jsonl` (where `<tenant>` is the mapped ledger `tenant_id`).
- In `staging` and `prod`, missing or unknown API keys for ledger routes yield auth errors (for example **`MISSING_API_KEY`** / unknown key), not ledger isolation via headers.

## Compatibility

Prior response semantics are preserved where possible:
- `GET /bundle` keeps `200` with `ok:false` for non success cases.
- `GET /bundle-hash` keeps `200` with `ok:false` for non success cases.
- `GET /compliance-summary` keeps `200` with `ok:false` for non success cases.
- `GET /verify` keeps `200` with `ok:false` for verification failures.
- `GET /api/export/:run_id` keeps prior error classification except where non-dev auth / API-key rules apply.

## Intentional behavioral change

Ledger touching routes in `staging` and `prod` require a valid **API key** present in **`GOVAI_API_KEYS_JSON`** (ledger `tenant_id` comes **only** from that mapping):
- Optional **`X-GovAI-Project`** is metadata / billing context only and **does not** isolate the ledger.

Affected routes:
- `POST /evidence`
- `GET /bundle`
- `GET /bundle-hash`
- `GET /compliance-summary`
- `GET /verify`
- `GET /verify-log`
- `GET /api/export/:run_id`

## CI change

The compliance workflow now runs `govai check` against the local audit service in the same job where the audit service is started. The external GovAI audit gate is skipped when `GOVAI_AUDIT_BASE_URL` is not configured.

## Risks

- Clients in `staging` and `prod` must authenticate with an API key mapped in **`GOVAI_API_KEYS_JSON`** for ledger access.
- `GET /bundle-hash` and `GET /verify-log` remain open in auth terms where configured, but resolved ledger data still follows **API-key** tenant mapping (not **`X-GovAI-Project`**).

## Validation

- `cargo test --manifest-path rust/Cargo.toml`
- Rust tests passed, including route level tenant isolation coverage.

## Evaluation gate

The change was evaluated against its intended safety and compatibility goals.

Checks performed:
- Tenant ledger isolation is enforced per request.
- Tenant A cannot read Tenant B data through bundle, compliance summary, or export routes.
- Ingest writes only to the resolved tenant ledger.
- Ledger `tenant_id` resolves from **`GOVAI_API_KEYS_JSON`** for the presented API key (never from **`X-GovAI-Project`**).
- Development mode without a configured key map can resolve ledger access to the **`default`** tenant (see server code paths).
- Staging and production reject unauthenticated or unknown API keys for ledger touching routes (per current auth rules).

Result: passed.

## Human approval gate

This change requires human approval because it modifies core audit ledger behavior and introduces non-dev **API-key / tenant-map** requirements for ledger access.

Approval checklist:
- Tenant isolation model reviewed.
- Compatibility impact reviewed.
- Intentional behavior change documented.
- Rust test suite passed.
- CI workflow impact documented.

Approval status: pending reviewer approval through the pull request review process.
