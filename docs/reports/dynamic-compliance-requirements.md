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
2. `BLOCKED` if the run is not eligible for promotion yet (for example because `missing_evidence` is non-empty and/or an approval/promotion prerequisite is unmet and explained via `blocked_reasons`).
3. `VALID` if required evidence is present, prerequisites are satisfied, and evaluation passed.
4. `BLOCKED` otherwise (still “not eligible for promotion”, not an error).

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

## Evaluation gate

The change preserves the evaluation gate as the first authoritative verdict rule.

If `evaluation_passed == false`, the compliance verdict is `INVALID`, even when all required evidence is present.

If `evaluation_passed == true` and no required evidence is missing, the compliance verdict can become `VALID`.

## Human approval gate

This change does not remove or modify the existing human approval evidence model.

Human approval state remains available in `current_state.approval`.

The new dynamic requirements engine only changes how required evidence is represented and how missing required evidence blocks the compliance summary verdict.

## Evaluation gate

The change preserves the evaluation gate as the first authoritative verdict rule.

If `evaluation_passed == false`, the compliance verdict is `INVALID`, even when all required evidence is present.

If `evaluation_passed == true` and no required evidence is missing, the compliance verdict can become `VALID`.

## Human approval gate

This change does not remove or modify the existing human approval evidence model.

Human approval state remains available in `current_state.approval`.

The new dynamic requirements engine only changes how required evidence is represented and how missing required evidence blocks the compliance summary verdict.
