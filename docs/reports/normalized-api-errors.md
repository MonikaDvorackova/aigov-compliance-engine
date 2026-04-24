# Normalized API errors

## Summary

This change normalizes user-facing API error responses across core endpoints.

## Scope

- Adds a consistent error response shape with `ok`, `error`, `code`, and `message`.
- Covers missing tenant context, policy violations, and usage limit failures.
- Fixes idempotent Postgres constraint migration syntax.

## Evaluation gate

Failure responses now expose stable machine-readable error fields and a non-empty user-facing message.

## Human approval gate

No automatic approval behavior was changed. Existing policy and approval gates remain enforced.

## Risk assessment

Risk is low to medium. The change affects error payloads and tests but does not redesign API routing, tenant isolation, billing logic, or policy enforcement.

## Verification

- `cargo test --manifest-path rust/Cargo.toml --test billing_http`
- `cargo test --manifest-path rust/Cargo.toml`
