# Tenant-scoped error hints

## Summary
Adds a safe hint to tenant-scoped RUN_NOT_FOUND responses without changing tenant isolation semantics.

## Evaluation gate
- RUN_NOT_FOUND remains RUN_NOT_FOUND.
- HTTP status remains unchanged.
- The hint explains the current tenant context.
- The response does not reveal whether the resource exists in another tenant.

## Human approval gate
Reviewed for tenant isolation safety and non-disclosure of cross-tenant resource existence.

## Tests
- cargo test -p aigov_audit --tests
