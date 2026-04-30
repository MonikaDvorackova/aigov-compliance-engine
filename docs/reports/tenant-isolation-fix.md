# Summary

This change fixes a **cross-tenant access vulnerability** in the audit ledger by making the tenant identity **server-controlled** and derived **only from the API key** (via `GOVAI_API_KEYS_JSON`). Client-controlled headers such as `x-govai-project` no longer influence which tenant ledger is read/written.

# Risk assessment

- **Impact before fix**: A client could spoof `x-govai-project` to read/write another tenant’s ledger (cross-tenant data access and tampering). Some audit endpoints were also reachable without authentication.
- **Impact after fix**: Ledger isolation is enforced by a server-owned API key → tenant mapping; audit routes require authentication when the mapping is configured (staging/prod). Spoofing `x-govai-project` has no effect on ledger tenancy.
- **Residual risk**: If `GOVAI_API_KEYS_JSON` is misconfigured (missing/invalid) in staging/prod, the service fails fast at startup to avoid insecure operation.

## Evaluation gate

- Verify `GOVAI_API_KEYS_JSON` is present and valid in staging/prod.
- Confirm requests with a valid API key are routed to the expected tenant ledger file.
- Confirm changing `x-govai-project` does not change the ledger tenant selection.

## Human approval gate

- Security reviewer confirms the tenant isolation mechanism is server-controlled and not influenced by request headers.
- Ops reviewer confirms `GOVAI_API_KEYS_JSON` is set in target environments and keys are rotated/managed appropriately.

# Rollback plan

- Revert the deployment to the previous release artifact.
- Remove/disable `GOVAI_API_KEYS_JSON` only if reverting to the prior behavior is acceptable for the environment (note: this would reintroduce cross-tenant risk; treat as emergency-only and time-boxed).
