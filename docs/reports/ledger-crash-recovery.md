# Ledger crash recovery and hot-path hardening

## Summary

This change improves ledger reliability and CI validation correctness.

It includes:
- crash recovery for trailing partial JSONL records
- tolerant ledger parsing
- ledger hot-path index state to reduce full-ledger scans during ingest
- CI correction so PR validation does not call the production Railway endpoint

The change does not alter public API response shapes, billing behavior, Stripe behavior, tenant isolation, or metering semantics.

## Risk assessment

Before this change:
- a crash during append could leave a trailing partial JSONL line and brick future ledger reads
- evidence ingest could perform full-ledger scans and exceed hosted proxy timeouts
- PR validation could call a production Railway backend running `main` instead of validating the current PR commit

After this change:
- trailing partial records are treated as recoverable tail corruption
- valid committed records remain usable
- append hot path can use sidecar state/index files instead of scanning the full tenant ledger
- PR validation uses the local audit service from the checked-out commit
- hosted validation remains restricted to main/release validation

Residual risk:
- sidecar state/index files must remain consistent with the ledger
- cross-process ledger locking is still a separate future hardening item
- full production scaling still requires additional operational hardening

## Evaluation gate

Verified:
- trailing partial ledger corruption is detected and repaired
- non-tail corruption still fails hard
- hash chain remains valid after repair and append
- duplicate event_id behavior remains deterministic
- ledger hot path avoids full-ledger scan when sidecar state/index exists
- PR validation no longer calls the production Railway endpoint
- make gate passes
- cargo check passes
- cargo test passes

## Human approval gate

This is an integrity and CI correctness change.

It does not:
- enable Stripe
- enable billing
- charge users
- change public API contracts
- weaken authentication
- weaken tenant isolation
- weaken ledger durability enforcement

## Rollback plan

Revert this PR if ledger repair, sidecar index behavior, or CI validation behavior causes regressions.

Rollback impact:
- trailing partial ledger recovery would be removed
- hot-path index optimization would be removed
- CI may again validate PRs against hosted production if the workflow condition is reverted
