# Product story: README canonical flow + Marketplace prep (draft)

This report is an internal, documentation-only checkpoint for making the first-time user experience (README → CI gate) consistent and reviewable.

## Evaluation gate

GovAI treats evaluation results as **evidence** appended to a run (via `POST /evidence`) and projects a verdict via `GET /compliance-summary`.

Expected behavior:

- If evaluation evidence is missing, the run can be `BLOCKED` with missing required evidence.
- If evaluation evidence is present but fails the policy rule(s), the run can be `INVALID`.
- The CI gate (`govai check`) passes only when the projected verdict is `VALID`.

Operator note (non-claim): GovAI does not prove evaluation truthfulness; it records and evaluates the submitted evidence under the configured policy.

## Human approval gate

GovAI supports a “human approval required” style gate as **required evidence** for a run.

Expected behavior:

- If human approval evidence is missing, the run remains `BLOCKED` and the compliance summary lists the missing approval requirement(s).
- Once approval evidence is submitted (for the same `run_id`) and accepted, the run may transition to `VALID` assuming other requirements pass.
- The CI gate is strict: it fails CI on `BLOCKED` and `INVALID`, and succeeds only on `VALID`.

Operator note: “Human approval” is represented as evidence; identity/authorization strength depends on how your deployment authenticates evidence submission.

