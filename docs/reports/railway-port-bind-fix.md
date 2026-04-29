## Summary

Railway deployments were returning HTTP 502 ("Application failed to respond") because the Rust audit backend bound to the local default `127.0.0.1:8088`, which is not reachable from the Railway runtime. The backend now resolves its bind address with the following precedence:

- If `AIGOV_BIND` is set **and valid**, bind to that address.
- Else, if `PORT` is set to a valid integer, bind to `0.0.0.0:${PORT}` (Railway runtime convention).
- Else, fall back to the existing local default `127.0.0.1:8088`.

## Evaluation gate

- Unit tests cover the bind resolution precedence and fallbacks.
- Existing integration tests continue to run without requiring hosted-specific environment variables.

## Human approval gate

- Review is required to confirm the bind precedence matches deployment expectations across environments (local dev, Docker, Railway/hosted).
- Confirm no hosted deployment relies on the previous implicit default of `127.0.0.1:8088`.

## Risk assessment

- **Low**: Change is isolated to server startup bind selection.
- **Potential impact**: If a hosted environment sets a malformed `AIGOV_BIND`, the server will now attempt to use `PORT` (if present) instead of immediately defaulting to `127.0.0.1:8088`. This is desirable for hosted runtimes, and still defaults safely when neither variable is usable.

## Verification

- `cargo test -p aigov_audit --tests`
- `cargo test -p aigov_audit`
- `docker build -f rust/Dockerfile rust`

