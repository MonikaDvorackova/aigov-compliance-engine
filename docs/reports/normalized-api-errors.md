# Normalized API errors

## Summary

This change normalizes user-facing API error responses across core endpoints.

## Scope

- Adds a consistent error response shape with `ok`, `error`, `code`, and `message`.
- Covers missing tenant context, policy violations, and usage limit failures.
- Fixes idempotent Postgres constraint migration syntax.

## Report gate expectations (CI)

CI enforces a **fail-closed** documentation gate over **all** `docs/reports/*.md` files via `scripts/gate_reports.py` (invoked by `make gate`). Each report must contain the exact level-2 headings:

- `## Evaluation gate`
- `## Human approval gate`

Why this exists:

- Ensures every change set has an explicit statement of what was evaluated and what requires human review.
- Prevents “placeholder” or incomplete reports from silently passing.

How to pass CI:

- Add both required headings (as shown in this report).
- If you generated a report via tooling, re-run `make report_prepare` (or re-generate the report) so the required sections are present.

## Evaluation gate

Failure responses now expose stable machine-readable error fields and a non-empty user-facing message.

## Human approval gate

No automatic approval behavior was changed. Existing policy and approval gates remain enforced.

## Risk assessment

Risk is low to medium. The change affects error payloads and tests but does not redesign API routing, tenant isolation, billing logic, or policy enforcement.

## Verification

- `cargo test --manifest-path rust/Cargo.toml --test billing_http`
- `cargo test --manifest-path rust/Cargo.toml`
