# Audit report: release cleanup docs and CI consistency

## Summary

This change aligns release documentation, CI build flags, tenant wording, and operator-facing help text with the current GovAI release contract.

## Scope

The change does not alter compliance verdict semantics, evidence requirements, tenant isolation implementation, or fail-closed gate behavior.

## Evaluation gate

Verified release cleanup consistency:
- CI builds the explicit audit binary with locked dependencies.
- Architecture and operator documentation use the explicit audit binary invocation.
- Tenant wording states that ledger isolation is derived from API key mapping.
- X-GovAI-Project is metadata / billing / usage context only.
- Health and readiness wording remains aligned with the accepted release contract.

## Human approval gate

This change touches release documentation, CI workflow clarity, and operator-facing error/help text. Human review is required to confirm that the public release contract remains accurate and that no compliance gate behavior was weakened.
