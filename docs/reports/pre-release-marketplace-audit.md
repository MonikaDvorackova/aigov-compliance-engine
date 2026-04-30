# Pre-release Marketplace audit (GitHub Action)

## Summary

This audit reviewed the Marketplace-facing GitHub Action and its docs for trust, consistency, and first-time user clarity, with special focus on the semantics of `VALID` / `BLOCKED` / `INVALID`.

Key outcome: documentation and action messaging previously implied **“`BLOCKED` = missing evidence only”**, which contradicted the project’s own audit export example and decision logic (a run can be `BLOCKED` even when `missing_evidence: []` due to approval/promotion gating). This has been corrected in the user-facing surfaces.

## Evaluation gate

- **Definition**: `INVALID` represents a policy rejection when the system has enough evidence to evaluate a decisive rule (for example, evaluation failed).
- **User impact**: `INVALID` should be treated as a “do not promote” outcome for the current run; the remediation is to change the underlying reality (model/system/process) and create a new run with new evidence.

## Human approval gate

- **Definition**: `BLOCKED` represents **“not eligible for promotion”** under the current policy.
- **Critical clarification**: `BLOCKED` can be caused by:
  - missing required evidence (`missing_evidence` is non-empty), and/or
  - unmet approval/promotion prerequisites (`blocked_reasons` explains why), even when `missing_evidence: []`.

This makes “human approval required” a first-class gating concept without forcing it to be conflated with “missing evidence only” in user-facing explanations.

## CI gate behavior

- **Inputs**: the Marketplace action takes only `run_id`, `base_url`, and `api_key` (all required).
- **Determinism**:
  - `VALID` → exit `0`
  - `BLOCKED` → exit non-zero
  - `INVALID` → exit non-zero
- **Failure modes**:
  - Misconfiguration (missing inputs) fails fast with explicit errors.
  - Backend/lookup failures are distinguished from verdict failures and are reported as inability to retrieve a verdict (for example `RUN_NOT_FOUND`).
- **Log clarity**: on `BLOCKED`, the action now points users to the two authoritative explanatory fields (`missing_evidence` and `blocked_reasons`) without implying that `BLOCKED` must mean missing evidence.

## Documentation consistency

Updated docs so they do not imply:

- “`BLOCKED` = missing evidence only”

And they do consistently state:

- “`BLOCKED` = not eligible for promotion”
- A run can be `BLOCKED` with `missing_evidence: []` when approval/promotion prerequisites are not satisfied.

## Trust assessment

- **Strengthened**: the Marketplace surfaces now agree with the system’s declared decision model and with the published audit export example.
- **Reduced ambiguity**: first-time users should be able to distinguish:
  - “the gate failed because the run is `BLOCKED` / `INVALID`” vs
  - “the gate failed because it could not retrieve a verdict”.

## Remaining risks (if any)

- **Log surface area**: the action consumes and prints CLI output; if future CLI output formats change substantially, the action may need an explicit compatibility note (or an explicit machine-readable output mode). This audit did not change runtime behavior, only clarified messaging.

## Final decision (YES / NO)

**YES — Ready for GitHub Marketplace release**, assuming the repository is tagged/published according to Marketplace requirements and the referenced version tag (for example `@v1`) points at this audited state.

