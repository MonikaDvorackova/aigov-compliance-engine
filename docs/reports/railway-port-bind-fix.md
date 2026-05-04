## Summary

Railway deployments were returning HTTP 502 ("Application failed to respond") because the Rust audit backend bound to the local default `127.0.0.1:8088`, which is not reachable from the Railway runtime. The backend resolves its bind address with the following precedence:

- If `AIGOV_BIND` is **unset**, **empty**, or **whitespace-only**, then if `PORT` is a valid integer, bind to `0.0.0.0:${PORT}` (Railway runtime convention); otherwise fall back to `127.0.0.1:8088`.
- If `AIGOV_BIND` is **non-empty** after trimming, it **must** parse as a socket address (e.g. `0.0.0.0:8088`); otherwise **startup fails** with an explicit error (no silent fallback to `PORT`).

**Related doc alignment:** ledger tenant isolation is **API-key derived** via `GOVAI_API_KEYS_JSON`. `X-GovAI-Project` is optional project/metadata only and is **not** the ledger isolation boundary (see `docs/common-errors.md`).

## Evaluation gate

- Unit tests cover valid `AIGOV_BIND`, `PORT` fallback when `AIGOV_BIND` is unset/empty/whitespace, default bind when `PORT` is missing/invalid, **failure** on invalid non-empty `AIGOV_BIND`, and `AIGOV_BIND` winning over `PORT` when both are set and bind is valid.
- Existing integration tests continue to run without requiring hosted-specific environment variables.

## Human approval gate

- Review is required to confirm the bind precedence matches deployment expectations across environments (local dev, Docker, Railway/hosted).
- Confirm no hosted deployment relies on the previous implicit default of `127.0.0.1:8088`.
- Confirm no deployment relied on **invalid non-empty** `AIGOV_BIND` being ignored in favor of `PORT` (that behavior is removed for production fail-closed startup).

## Risk assessment

- **Low**: Change is isolated to server startup bind selection.
- **Potential impact**: A **non-empty malformed** `AIGOV_BIND` now **refuses startup** instead of falling back to `PORT`. Operators should unset or fix `AIGOV_BIND`; use unset/empty plus `PORT` when the platform injects only `PORT`.

## Verification

- `cargo test -p aigov_audit --tests`
- `cargo test -p aigov_audit`
- `docker build -f rust/Dockerfile rust`

