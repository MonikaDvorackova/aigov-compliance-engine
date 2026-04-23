# Audit report: tenant scoped ledger isolation

## Summary

This change enforces tenant scoped ledger isolation for audit routes.

## Scope

Changed files:
- `rust/src/govai_api.rs`
- `rust/src/project.rs`
- `rust/tests/billing_http.rs`
- `rust/tests/tenant_isolation_http.rs`

## What changed

- ledger access is now resolved per request
- `X-GovAI-Project` is the primary tenant source
- Bearer token fingerprint is the fallback tenant source
- ledger paths are tenant scoped as `audit_log__<tenant>.jsonl`
- in `staging` and `prod`, missing tenant context returns `400` with `missing_tenant_context`

## Compatibility

Preserved where possible:
- `GET /bundle` keeps `200` with `ok:false` for non success cases
- `GET /bundle-hash` keeps `200` with `ok:false` for non success cases
- `GET /compliance-summary` keeps `200` with `ok:false` for non success cases
- `GET /verify` keeps `200` with `ok:false` for verification failures
- `GET /api/export/:run_id` keeps prior error classification except for missing tenant context in non dev

Intentional behavioral change:
- ledger touching routes now require tenant context in `staging` and `prod`

Affected routes:
- `POST /evidence`
- `GET /bundle`
- `GET /bundle-hash`
- `GET /compliance-summary`
- `GET /verify`
- `GET /verify-log`
- `GET /api/export/:run_id`

## Risks

- clients in `staging` and `prod` must provide tenant context via `X-GovAI-Project` or Bearer token
- open style verification/hash routes are now tenant context dependent in non dev

## Validation

- `cargo test --manifest-path rust/Cargo.toml`
- all Rust tests passed, including tenant isolation coverage

