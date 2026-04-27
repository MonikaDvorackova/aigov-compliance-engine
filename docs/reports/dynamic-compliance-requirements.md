# Dynamic compliance requirements engine

## Summary

This change introduces a minimal dynamic compliance requirements model for compliance summary decisions.

## Changed files

- `rust/src/govai_api.rs`
- `rust/src/projection.rs`

## Requirements model

The compliance state now exposes structured evidence requirements:

- `required_evidence`
- `provided_evidence`
- `missing_evidence`

Each structured missing or required evidence item includes:

- `code`
- `source`

The initial source currently used by derived discovery requirements is `discovery`.

Legacy fields are preserved:

- `required`
- `satisfied`
- `missing`

## Decision logic

The compliance verdict is now derived as follows:

1. `INVALID` if evaluation explicitly failed.
2. `BLOCKED` if `missing_evidence` is non-empty.
3. `VALID` if required evidence is present and evaluation passed.
4. `BLOCKED` otherwise.

## API compatibility

`missing_evidence` is added to the compliance summary response as an additive top-level field.

Existing fields remain preserved.

## Testing

Ran:

```bash
cd rust && cargo test

Pak:

```bash
git status --short
git add docs/reports/dynamic-compliance-requirements.md
git commit -m "docs: add audit report for dynamic requirements"
git push
