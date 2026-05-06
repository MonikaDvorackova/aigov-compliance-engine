# Production hardening: Stripe, ledger integrity, and API contract

This report documents production hardening for three identified blockers: Stripe webhook verification, ledger checkpoint integrity, and API contract alignment.

## Evaluation gate

Stripe webhook verification now follows Stripe-compatible signing semantics using `t + "." + raw_body`, raw webhook secret bytes, timestamp tolerance, and deterministic tests.

Ledger integrity now includes checkpoint verification so tampering with prior ledger content is detected against a persisted checkpoint digest.

API contract documentation now matches actual authentication behavior for protected endpoints, with contract tests for authentication and hard failure semantics.

## Human approval gate

These changes preserve fail-closed behavior and do not weaken compliance verdict semantics, tenant isolation, evidence requirements, approval requirements, or artifact-bound CI verification.
