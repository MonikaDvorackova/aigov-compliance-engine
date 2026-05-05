# Pilot CI and operator readiness hardening

This report documents CI and operator readiness cleanup for hosted pilot safety.

## Evaluation gate

Changes evaluated:

- `govai-ci` now exercises API-key based tenant mapping via `GOVAI_API_KEYS_JSON`.
- report-required core change detection now includes `python/aigov_py/**`.
- `Makefile` keeps local auto-migrate convenience while allowing `GOVAI_AUTO_MIGRATE` override.
- hosted backend docs clarify production-like migration policy.
- GitHub Action docs document version bump lockstep expectations.

Verification commands:

```bash
git diff --check
python3 scripts/gate_reports.py
rg -n "GOVAI_API_KEYS_JSON|ci-test-api-key" .github/workflows/govai-ci.yml
rg -n "python/aigov_py" .github/workflows/compliance.yml
rg -n "GOVAI_AUTO_MIGRATE" Makefile docs/hosted-backend-deployment.md
cat > docs/reports/pilot-ci-operator-readiness.md <<'EOF'
# Pilot CI and operator readiness hardening

This report documents CI and operator readiness cleanup for hosted pilot safety.

## Evaluation gate

Changes evaluated:

- `govai-ci` now exercises API-key based tenant mapping via `GOVAI_API_KEYS_JSON`.
- report-required core change detection now includes `python/aigov_py/**`.
- `Makefile` keeps local auto-migrate convenience while allowing `GOVAI_AUTO_MIGRATE` override.
- hosted backend docs clarify production-like migration policy.
- GitHub Action docs document version bump lockstep expectations.

Verification commands:

```bash
git diff --check
python3 scripts/gate_reports.py
rg -n "GOVAI_API_KEYS_JSON|ci-test-api-key" .github/workflows/govai-ci.yml
rg -n "python/aigov_py" .github/workflows/compliance.yml
rg -n "GOVAI_AUTO_MIGRATE" Makefile docs/hosted-backend-deployment.md
