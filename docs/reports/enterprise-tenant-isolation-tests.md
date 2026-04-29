# Enterprise tenant isolation tests

## Summary

This change adds integration tests proving enterprise tenant isolation across compliance workflow and assessment endpoints.

## Evaluation gate

The evaluation gate verifies that tenant-scoped enterprise endpoints do not expose or allow access to resources owned by another team.

Expected result:

- Team B cannot read Team A compliance workflow resources.
- Team B cannot mutate Team A compliance workflow resources.
- Team B cannot explicitly select Team A through `x-govai-team-id`.
- Team B cannot create assessments in Team A scope.
- Cross-tenant responses do not include Team A identifiers, names, or resource identifiers.

## Human approval gate

No production behavior was changed.

Approval is limited to confirming that the added tests correctly encode the existing tenant isolation model and do not weaken authentication, authorization, or tenant scoping.

## Scope

Test coverage was added for compliance workflow and assessment endpoints.

## Production impact

No production logic was changed. Only integration tests and test-only development dependencies were added.

## Validation

Run from `rust/`:

```bash
cargo test --test tenant_isolation_enterprise_http -- --nocapture
cargo test
