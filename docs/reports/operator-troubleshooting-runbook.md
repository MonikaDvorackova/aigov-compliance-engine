# Operator troubleshooting runbook update

## Evaluation gate

This change improves troubleshooting and operator documentation clarity.

Added:
- “Step 1: Identify failure type” (ERROR / BLOCKED / INVALID)
- explicit ERROR classification (auth / not found / backend / digest)
- “Everything looks correct but still BLOCKED” guidance
- “Minimum healthy system” definition for operators

Verification:
- manual review of docs/troubleshooting.md and docs/operator-runbook.md
- rg checks for added sections
- git diff --check

## Human approval gate

Reviewed as docs-only change.

No changes were made to:
- Rust decision logic
- VALID / INVALID / BLOCKED semantics
- fail-closed behavior
- schemas or API payloads
- CI behavior or exit codes
