# Operator troubleshooting runbook

## Evaluation gate

This change adds operational troubleshooting documentation for GovAI.

Covered:
- ERROR vs BLOCKED vs INVALID diagnosis
- MISSING_API_KEY / 401
- RUN_NOT_FOUND
- /health vs /status vs /ready
- /status OK but /ready fails
- missing evidence debugging
- operator/customer support handoff

Verification:
- rg checks over docs
- git diff --check

## Human approval gate

Reviewed as docs-only change.

No changes were made to:
- Rust decision logic
- VALID / INVALID / BLOCKED semantics
- fail-closed behavior
- schemas or API payloads
- API or CLI behavior
- CI behavior or exit codes
