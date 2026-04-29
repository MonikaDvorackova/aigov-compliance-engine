## Summary

The standalone GitHub Actions workflow `govai-check.yml` was updated to be **self-contained** for pull request and push checks: it now generates a fresh `run_id` when no upstream run id is provided and **initializes that run** in the hosted audit ledger by submitting a minimal evidence event before executing `govai check`.

## Root cause

- The workflow resolved `GOVAI_RUN_ID` from `vars.GOVAI_RUN_ID` (or a manual input) and then executed `govai check --run-id "${GOVAI_RUN_ID}"`.
- The workflow did **not** submit any evidence for that run id first.
- After the hosted backend (Railway Postgres) reset, the previously configured static `GOVAI_RUN_ID` no longer existed in the tenant ledger, so `govai check` failed with `HTTP 404 RUN_NOT_FOUND` and missing `audit_log__<run_id>.jsonl`.

## Evaluation gate

- The CI job remains a **strict gate**: it fails unless the compliance verdict is `VALID`.
- The workflow now prevents the misleading `RUN_NOT_FOUND` failure mode by ensuring the run exists in the ledger before checking.
- With only minimal evidence, the expected verdict is typically `BLOCKED` (policy-dependent), which is an intentional “not ready” state rather than a missing-run error.

## Human approval gate

- No human approval bypass was introduced.
- The workflow keeps `workflow_dispatch` support to manually override `run_id` for debugging, but PR/push checks do not rely on a static repository variable run id.

## Risk assessment

- **Primary risk reduced**: eliminates a brittle dependency on a stale repository variable `GOVAI_RUN_ID` for PR checks, preventing `RUN_NOT_FOUND` after backend resets or ledger retention changes.
- **Residual risk**: the evidence submission step depends on correct `GOVAI_AUDIT_BASE_URL` and `GOVAI_API_KEY` configuration; missing configuration still fails fast (by design).
- **Policy risk**: initializing a run with minimal evidence may produce `BLOCKED` (expected) until full required evidence is posted for that same run id.

## Verification

- Workflow logic ensures the effective `run_id` is printed and is the **same value** used for:
  - `POST /evidence` (initialization event)
  - `govai check --run-id ...`
- The workflow uses the same `GOVAI_AUDIT_BASE_URL` and `GOVAI_API_KEY` for both the evidence POST and the subsequent check.
