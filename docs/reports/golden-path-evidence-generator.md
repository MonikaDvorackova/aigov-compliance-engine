# Golden path evidence generator

## Evaluation gate

This change adds a deterministic golden-path evidence generator for onboarding.

Validated changes:
- `govai demo-golden-path` command
- deterministic evidence bundle generation
- digest manifest generation
- copy-paste verify command
- safe API key handling in printed commands
- proactive local audit readiness hint
- golden path documentation
- regression tests

Verification:
- python -m pytest -q
- cd rust && cargo test --lib && cd ..
- python -m aigov_py.cli demo-golden-path
- git diff --check

## Human approval gate

Reviewed as low-risk onboarding and developer-experience change.

No changes were made to:
- Rust decision logic
- VALID / INVALID / BLOCKED semantics
- fail-closed behavior
- schemas or API payloads
- evidence format
- existing CLI command behavior
