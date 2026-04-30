## Summary

`.github/workflows/govai-check.yml` is restored as a strict compliance gate: it **passes only on `VALID`**.
To make the self-contained run eligible for `VALID`, the workflow now submits the supported evidence
events required by the policy and verdict rules (instead of initializing the run with only discovery evidence).

## Root cause

The workflow previously initialized the run with only a minimal `ai_discovery_reported` event. Under the
current policy/verdict rules, that produces a real run but an expected verdict of `BLOCKED` because the run
is missing promotion prerequisites (passed evaluation, risk approval, human approval, and promotion).

A temporary change allowed `BLOCKED` to pass, which is incorrect for this workflow’s intended behavior.

## Fix

- Reverted the `BLOCKED`-as-pass behavior so the gate is `VALID`-only again.
- Added a dedicated “Submit required evidence” step that posts the supported event types and payloads
  required for `VALID`, using the same `run_id` and the same `X-GovAI-Project: github-actions` context
  as the initialization step and `govai check`.

Event types used (all supported by policy enforcement and docs):

- `ai_discovery_reported` (no findings; satisfies `ai_discovery_completed` requirement)
- `data_registered`
- `model_trained`
- `evaluation_reported` (`passed: true`)
- `risk_reviewed` (`decision: approve`)
- `human_approved` (`decision: approve`, `approver: compliance_officer`)
- `model_promoted` (references `approved_human_event_id`)

## Evaluation gate

This workflow is a real compliance gate:

- `VALID` → pass (exit 0)
- `BLOCKED` → fail
- `INVALID` → fail
- `RUN_NOT_FOUND` / HTTP errors / auth / connectivity failures → fail

## Human approval gate

Human review should confirm:

- the workflow remains `VALID`-only (no special-case pass for `BLOCKED`)
- evidence events posted in CI match the supported schema/policy in `rust/src/policy.rs` and `docs/manual-evidence-flow.md`
- the same project context (`X-GovAI-Project: github-actions`) is used consistently for all evidence posts and `govai check`


## Summary

We observed inconsistent `GET /compliance-summary` responses where:

- `verdict` was `BLOCKED`
- `requirements.missing` and `requirements.missing_requirements` were empty
- `blocked_reasons` was empty
- `current_state.model.promotion.state` indicated a lifecycle gate such as `"awaiting_risk_review"`

This is confusing for consumers: a `BLOCKED` verdict must always be accompanied by an explicit explanation in `blocked_reasons` and/or unmet evidence requirements.

This change makes `blocked_reasons` additive: it continues to expose **discovery-derived evidence blockers**, and now also exposes **lifecycle / promotion gate blockers** when evidence requirements are already satisfied.

## Evaluation gate

`verdict` can be `BLOCKED` even when discovery requirements are satisfied because promotion readiness requires more than discovery completion.

We now emit:

- `evaluation_required`: when `current_state.model.evaluation_passed` is `null` (no evaluation evidence yet)

Note: `evaluation_passed=false` remains an `INVALID` verdict (not a `BLOCKED` verdict).

## Human approval gate

Promotion readiness may require explicit human approval. We now emit:

- `approval_required`: when `current_state.approval.human_approval_decision != "approve"`

## Risk assessment

Promotion readiness may require an approved risk review. We now emit:

- `awaiting_risk_review`: when `current_state.approval.risk_review_decision != "approve"`

## Verification

- Add regression test: discovery-only run must be either `VALID`, or `BLOCKED` with non-empty `blocked_reasons`.
- Add invariant: there must never be `BLOCKED` with both empty `requirements.missing` and empty `blocked_reasons`.

Local commands:

```bash
cargo test -p aigov_audit --tests
cargo test -p aigov_audit
```

Manual API check:

- `curl` `GET /compliance-summary?run_id=<discovery-only-run>` must not return `BLOCKED` with both `requirements.missing=[]` and `blocked_reasons=[]`.

