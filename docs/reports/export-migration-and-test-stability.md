# Export migration and test stability

## Summary

This change fixes a migration version conflict and stabilizes the audit export HTTP test.

## Scope

- Renumbered `password_reset_tokens` migration to avoid duplicate SQLx migration version.
- Updated export HTTP test setup to create the tenant audit log before ingestion.
- Verified audit export includes decision and evidence hash fields.

## Evaluation gate

The export endpoint was tested through `rust/tests/export_http.rs`.

Verified:

- export returns HTTP 200
- response includes `decision`
- response includes `evidence_hashes`
- `chain_head_record_sha256` matches the last ingested `record_hash`

## Human approval gate

No production behavior change was made to audit export logic.

This change is limited to:

- migration ordering
- test setup
- export feature test coverage

## Verification

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/govai_test_export" \
cargo test --manifest-path rust/Cargo.toml --test export_http

python -m pytest python/tests/test_cli_terminal_sdk.py
:q
