# Audit report: tenant scoped ledger isolation

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

- Ledger access is resolved per request.
- `X-GovAI-Project` is the primary tenant source.
- Bearer token fingerprint is the fallback tenant source.
- Ledger paths are tenant scoped as `audit_log__<tenant>.jsonl`.
- In `staging` and `prod`, missing tenant context returns `400` with `missing_tenant_context`.

## Compatibility

Prior response semantics are preserved where possible:
- `GET /bundle` keeps `200` with `ok:false` for non success cases.
- `GET /bundle-hash` keeps `200` with `ok:false` for non success cases.
- `GET /compliance-summary` keeps `200` with `ok:false` for non success cases.
- `GET /verify` keeps `200` with `ok:false` for verification failures.
- `GET /api/export/:run_id` keeps prior error classification except for missing tenant context in non dev.

## Intentional behavioral change

Ledger touching routes now require tenant context in `staging` and `prod`:
- `X-GovAI-Project`, or
- Bearer token fallback.

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

- Clients in `staging` and `prod` must provide tenant context.
- `GET /bundle-hash` and `GET /verify-log` remain open in auth terms, but are tenant context dependent in non dev environments.

## Validation

- `cargo test --manifest-path rust/Cargo.toml`
- Rust tests passed, including route level tenant isolation coverage.

## Evaluation gate

The change was evaluated against its intended safety and compatibility goals.

Checks performed:
- Tenant ledger isolation is enforced per request.
- Tenant A cannot read Tenant B data through bundle, compliance summary, or export routes.
- Ingest writes only to the resolved tenant ledger.
- Bearer token fallback resolves to a deterministic tenant fingerprint.
- Development mode without tenant context resolves to the default tenant ledger.
- Staging and production reject missing tenant context for ledger touching routes.

Result: passed.

## Human approval gate

This change requires human approval because it modifies core audit ledger behavior and introduces a non dev tenant context requirement.

Approval checklist:
- Tenant isolation model reviewed.
- Compatibility impact reviewed.
- Intentional behavior change documented.
- Rust test suite passed.
- CI workflow impact documented.

Approval status: pending reviewer approval through the pull request review process.
