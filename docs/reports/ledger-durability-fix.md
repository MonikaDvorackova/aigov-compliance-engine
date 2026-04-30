## Summary

This change hardens hosted deployments by making audit ledger persistence **explicit** in staging/prod. The service now requires `GOVAI_LEDGER_DIR` in staging/prod and validates it at startup (create if missing, prove writability with a temporary probe file).

## Risk assessment

- Before: hosted containers could silently write audit evidence to the process working directory, which may be **ephemeral**. A restart or reschedule could lose the audit ledger.
- After: staging/prod **fail fast** unless ledger storage is explicitly configured and writable, preventing silent evidence loss due to ephemeral storage defaults.
- Residual risk: durability still depends on operator configuration (persistent volume / durable disk, backups). This change ensures misconfiguration is detected early.

## Evaluation gate

- Startup validation:
  - staging/prod fail-fast when `GOVAI_LEDGER_DIR` is missing/empty
  - directory is created when absent, and writability is verified via a temporary probe file
- Confirm staging/prod do not start with a non-writable `GOVAI_LEDGER_DIR`
- `cargo check`
- `cargo test`

## Human approval gate

- Confirm this is reliability hardening only:
  - this does not change billing
  - this does not enable Stripe
  - this is reliability hardening

## Rollback plan

- Revert this change and redeploy the previous artifact.
- If rollback is required, ensure the deployment explicitly sets `GOVAI_LEDGER_DIR` anyway to avoid reintroducing silent ephemeral ledger storage.

