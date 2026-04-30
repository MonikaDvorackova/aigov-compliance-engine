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

