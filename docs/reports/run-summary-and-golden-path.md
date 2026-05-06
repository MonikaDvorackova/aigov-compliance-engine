# Run summary and golden path

## Evaluation gate

This change improves user-facing diagnostics and onboarding without changing compliance verdict semantics, schemas, payloads, exit codes, or backend decision logic.

Validated changes:
- appended one-screen GovAI summary for CLI checks
- appended one-screen GovAI summary for GitHub Action gate output
- added output-only reason codes
- added deterministic golden path documentation
- linked golden path from README and GitHub Action docs

Verification:
- python -m pytest -q
- cd rust && cargo test && cd ..
- python -c "import yaml; yaml.safe_load(open('action.yml', encoding='utf-8')); print('action yaml ok')"
- git diff --check

## Human approval gate

Reviewed as low-risk UX / DX hardening.

No changes were made to:
- VALID / INVALID / BLOCKED semantics
- fail-closed behavior
- schema structure
- audit export payloads
- CLI exit codes
- backend enforcement logic
