# Operator readiness polish

## Evaluation gate

This report covers final operator readiness documentation polish.

Evaluated changes:

- hosted deployment docs use explicit `aigov_audit` binary commands
- pilot runbook treats `GET /ready` as the primary operational readiness probe
- `GET /health` remains documented as liveness-only after successful startup
- `govai-ci.yml` is labelled as a non-production smoke workflow
- README links operators to the canonical probe contract

No verdict semantics, fail-closed behavior, tenant isolation behavior, or hosted gate enforcement were changed.

## Human approval gate

Human review should confirm:

- the hosted pilot runbook no longer implies `/health` proves operational readiness
- the explicit `aigov_audit` command matches Makefile and CI behavior
- the workflow comment correctly points operators to `compliance.yml` / `govai-compliance-gate`
- only one `docs/reports/*.md` basename is changed in this PR
