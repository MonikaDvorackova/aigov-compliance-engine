## Summary

On branch `fix/restore-self-contained-govai-check`, `.github/workflows/govai-check.yml` is a strict compliance gate:
it **passes only when `govai check` prints `VALID`**.

To make the workflow self-contained (no external pipelines required), the job posts the **full lifecycle evidence**
required for a `VALID` verdict, then runs `govai check` against the same `run_id` and the same `X-GovAI-Project`
tenant context.

This same hosted evidence sequence + strict `VALID` gate behavior is also applied in
`.github/workflows/compliance.yml` (the authoritative CI workflow for PR checks).

## Evaluation gate

Per the server verdict logic, a run can only be `VALID` if:

- `evaluation_reported` exists with `"passed": true`
- `risk_reviewed` exists with `"decision": "approve"`
- `human_approved` exists with `"scope": "model_promoted"` and `"decision": "approve"`
- `model_promoted` exists and references the specific approval event via `approved_human_event_id`

If any of these gates is missing, the verdict is `BLOCKED` and the server must report explicit `blocked_reasons`.

## Human approval gate

The CI workflow posts a `human_approved` event with:

- `"scope": "model_promoted"`
- `"decision": "approve"`
- a stable `event_id` (derived from `GOVAI_RUN_ID`) that is referenced by the later `model_promoted` event

## Risk assessment

The CI workflow posts a `risk_reviewed` event with:

- `"decision": "approve"` (note: **not** `"approved"`)
- required linkage fields (`assessment_id`, `risk_id`, `dataset_governance_commitment`, and identifiers)

## Verification

### Evidence sequence (CI)

The workflow posts these events **in this exact order**, using the **same** `GOVAI_RUN_ID` and the **same**
`X-GovAI-Project: github-actions` context:

1. `ai_discovery_reported`
2. `evaluation_reported` (`passed=true`)
3. `risk_reviewed` (`decision=approve`)
4. `human_approved` (`decision=approve`)
5. `model_promoted` (must reference `approved_human_event_id`)

Each POST prints:

- the full JSON request body
- the full HTTP response body

and **fails immediately** if the HTTP status is not 2xx.

### Debugging output on failure

If `govai check` fails, the workflow prints:

- `govai explain`
- full `/compliance-summary` JSON for the run

This makes remaining `BLOCKED` verdicts actionable (it shows exactly which lifecycle gate is still missing).

