# Pilot CI and operator readiness hardening

This report documents CI and operator readiness cleanup for hosted pilot safety.

## Evaluation gate

Changes evaluated:

- `govai-ci` exercises API-key based tenant mapping via `GOVAI_API_KEYS_JSON`.
- report-required core change detection includes `python/aigov_py/**`.
- `Makefile` keeps local auto-migrate convenience while allowing `GOVAI_AUTO_MIGRATE` override.
- hosted backend docs clarify production-like migration policy.
- GitHub Action docs document version bump lockstep expectations.

Verification commands:

git diff --check
python3 scripts/gate_reports.py
rg -n "GOVAI_API_KEYS_JSON|ci-test-api-key" .github/workflows/govai-ci.yml
rg -n "python/aigov_py" .github/workflows/compliance.yml
rg -n "GOVAI_AUTO_MIGRATE" Makefile docs/hosted-backend-deployment.md

## Human approval gate

Human review required before merging to staging:

- Confirm hosted pilot CI should require API-key tenant mapping.
- Confirm `python/aigov_py/**` belongs in report-required core scope.
- Confirm production guidance for `GOVAI_AUTO_MIGRATE` matches operator policy.
- Confirm no fail-closed behavior was weakened.
