# Enterprise tenant isolation tests

## Summary

This change adds integration tests proving enterprise tenant isolation across compliance workflow and assessment endpoints.

## Scope

Test coverage was added for:

- Team A creating a compliance workflow resource in its own scope.
- Team B being unable to read Team A compliance workflow resources.
- Team B being unable to mutate Team A compliance workflow resources.
- Team B being unable to explicitly select Team A via `x-govai-team-id`.
- Team A creating an assessment in its own scope.
- Team B being unable to create assessments in Team A scope.
- Cross-tenant error responses not exposing Team A identifiers or resource existence.

## Production impact

No production logic was changed.

Only integration tests and test-only development dependencies were added.

## Validation

Run from `rust/`:

```bash
cargo test --test tenant_isolation_enterprise_http -- --nocapture
cargo test
