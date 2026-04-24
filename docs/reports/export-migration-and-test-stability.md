# Export migration and test stability

## Summary

Fixes migration ordering and stabilizes audit export test coverage.

## Evaluation gate

Verified that `GET /api/export/{run_id}` returns HTTP 200 and includes `decision`, `evidence_hashes`, and `chain_head_record_sha256`.

## Human approval gate

No production export behavior was changed. Scope is limited to migration numbering and test setup.

## Verification

- `cargo test --manifest-path rust/Cargo.toml --test export_http`
- `python -m pytest python/tests/test_cli_terminal_sdk.py`
