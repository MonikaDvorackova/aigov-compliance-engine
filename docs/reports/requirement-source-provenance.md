# Audit Report: Requirement Source Provenance

## Scope
Adds structured source provenance to compliance requirements.

## Changes
- Introduced structured requirement model:
  - code
  - source (policy | discovery | lifecycle)
  - description
- Applied to:
  - required_evidence
  - provided/satisfied evidence
  - missing_evidence
- Preserved backward compatibility with string arrays
- Ensured deterministic ordering by requirement code

## Impact on Verdict
None. Verdict semantics unchanged.

## Determinism
Requirement ordering is deterministic (sorted by code).

## Compatibility
Existing fields preserved:
- required
- satisfied
- missing

New fields are additive:
- required_requirements
- satisfied_requirements
- missing_requirements

## Validation
- cargo test --test audit_export
- cargo test --test export_http
- cargo test

All tests passing.
