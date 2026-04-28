# Tenant usage tracking

## Summary

This change adds minimal tenant-scoped usage tracking for hosted customers.

## Scope

Tracked operations:

- evidence submissions
- compliance checks
- exports
- discovery scans counter support

Billing and payment enforcement are intentionally out of scope.

## Evaluation gate

Usage tracking must not affect compliance verdicts.

Expected behavior:

- evidence submissions increment only the authenticated tenant usage
- compliance checks increment only the authenticated tenant usage
- exports increment only the authenticated tenant usage
- tenants cannot read or affect each other usage
- GET /usage returns usage scoped to the authenticated tenant

## Human approval gate

No human approval decision is changed by this PR.

This change only records operational counters for hosted customer usage visibility. It does not approve, reject, promote, or block any compliance run.

## Tests

```bash
cd rust
cargo test -p aigov_audit --test usage_ops_http
cargo test -p aigov_audit --tests
