# Pipe-safe CI debug listings

This report documents a logging-only CI hardening change.

The compliance workflow previously used debug listing commands that piped `ls` into `head` under `set -euo pipefail`. With many files, `head` may close the pipe early and `ls` can exit with a broken pipe error, causing a false CI failure.

The workflow now uses pipe-safe `find ... | sort | head` listing commands for debug output. This does not change compliance gates, report validation, artifact generation, hosted verification, or production enforcement semantics.

## Evaluation gate

No evaluation behavior was weakened. This change only affects diagnostic listing output in CI.

The actual compliance gates remain unchanged and still fail closed for missing reports, invalid report content, missing artifacts, failed evidence verification, or non-VALID GovAI verdicts.

## Human approval gate

No human approval behavior was weakened. This change does not alter approval requirements, report section requirements, or hosted artifact-bound verification.
