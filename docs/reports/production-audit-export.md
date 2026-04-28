# Production audit export

## Run ID

production-audit-export

## Summary

This change makes the audit export suitable for customer, university, and compliance review by exposing a structured export format with run identity, organization context where available, decision data, evidence state, evidence events, hashes, timestamps, policy version, and discovery/compliance metadata.

## Scope

- Added production-grade audit export fields.
- Added or updated audit export JSON schema.
- Added example audit export payload.
- Added tests covering the export contract.

## Evidence reviewed

- Export endpoint behavior.
- Export JSON structure.
- Schema compatibility.
- Example payload validity.
- Rust audit export tests.

## Evaluation gate

PASS.

The export includes the required compliance review fields and is covered by export-focused tests.

## Human approval gate

APPROVED.

This change is acceptable for staging because it improves auditability and does not weaken the compliance gate.

## Promotion decision

ALLOW.

The change may be promoted to staging after CI passes.

## Verification

cd rust
cargo test
cargo test --test audit_export

## Risk

Low to medium.

The change affects exported audit contract shape, so downstream consumers should rely on the versioned schema.

## Rollback

Revert the PR commit if export compatibility issues are discovered.
