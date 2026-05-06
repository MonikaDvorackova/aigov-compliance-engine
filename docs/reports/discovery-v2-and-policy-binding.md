---
title: Discovery v2 and policy binding
audience: customers, operators
scope: docs-only
---

## Summary

GovAI is moving from “a CI gate” to a deterministic AI governance execution layer by expanding:

- discovery (context awareness)
- policy binding (signals → required evidence)
- enforcement clarity (better explanations in outputs)

This report documents the upgrade while confirming the production-safety constraints:

- no Rust decision logic changes
- no change to `VALID` / `INVALID` / `BLOCKED` semantics
- no API schema/payload changes
- no new verdict types or exit codes

---

## Evaluation gate

### Deterministic discovery expansion

Discovery v2 expands repository scanning to emit richer, deterministic signals:

- `llm_used`
- `model_types` (`llm`, `classifier`, `embedding`)
- `user_facing`
- `pii_possible`
- `external_dependencies`

The scan is heuristic-only (dependency manifests, code signatures, file extensions, and dataset headers/schemas).

### Mapping to required_evidence (policy binding layer)

A new deterministic binding layer maps discovery signals to **additional** required evidence codes:

- If `llm_used` → require `evaluation_reported` and `usage_policy_defined`
- If `user_facing` → require `human_approved`
- If `pii_possible` → require `privacy_review_completed`

This mapping:

- outputs a flat deterministic set: `Set[str]`
- augments policy-required evidence (set union)
- does not implement policy logic inside the core engine

---

## Human approval gate

### Semantics and enforcement are unchanged

This upgrade explicitly does **not** change:

- Rust decision logic
- verdict semantics (`VALID` / `INVALID` / `BLOCKED`)
- exit codes
- API schemas or payloads

Human approval remains a deterministic evidence requirement: when it is required and missing, the verdict remains `BLOCKED` (existing semantics).

### Better explanation (append-only)

CLI summary output is extended in an **append-only** way to improve operator clarity:

- adds `triggered_by` (when local discovery context is available)
- upgrades `next_action` with deterministic mappings from `missing_evidence` to actionable hints

