# Audit Report: Requirement Source Provenance

## Scope
Adds structured source provenance to compliance requirements.

## Changes
- Introduced structured requirement model:
  - code
  - source (policy | discovery | lifecycle)
  - description
- Applied to required, satisfied/provided, and missing evidence.
- Preserved backward compatibility with existing string arrays.
- Ensured deterministic ordering by requirement code.

## Evaluation gate
The change is additive and does not alter compliance evaluation logic.

Verdict semantics remain unchanged:
- existing required evidence remains required
- existing satisfied/provided evidence remains satisfied/provided
- existing missing evidence remains missing
- BLOCKED, INVALID, and VALID outcomes are not changed by this report

Validation:
- cargo test --test audit_export
- cargo test --test export_http
- cargo test

## Human approval gate
This change does not modify human approval logic.

Human approval requirements, approval status handling, and approval based blocking behavior remain unchanged.

## Impact on Verdict
None. Verdict semantics unchanged.

## Determinism
Requirement ordering is deterministic by requirement code.

## Compatibility
Existing fields are preserved:
- required
- satisfied
- missing
- required_evidence
- provided_evidence
- missing_evidence

New structured fields are additive:
- required_requirements
- satisfied_requirements
- provided_requirements
- missing_requirements

## Validation
All Rust tests passed locally:
- cargo test --test audit_export
- cargo test --test export_http
- cargo test
