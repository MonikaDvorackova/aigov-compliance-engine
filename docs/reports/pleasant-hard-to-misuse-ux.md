# Pleasant hard-to-misuse UX diagnostics

## Evaluation gate

This change improves onboarding and diagnostic usability without changing compliance verdict semantics, schemas, payloads, or core decision logic.

Validated changes:
- clearer GitHub Action PASS / FAIL logs
- read-only govai doctor preflight command
- improved CI readiness diagnostics
- README Hosted vs Local onboarding guidance
- minimal customer repo example
- test-only Rust expected string alignment

Verification:
- python -m pytest -q
- cd rust && cargo test
- git diff --check

## Human approval gate

Reviewed as low-risk UX / DX hardening.

No changes were made to:
- VALID / INVALID / BLOCKED semantics
- fail-closed behavior
- schema structure
- audit export payloads
- enforcement logic
