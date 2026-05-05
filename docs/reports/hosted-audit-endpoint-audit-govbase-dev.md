# Audit report: canonical hosted audit endpoint

## Summary

This change aligns hosted/customer-facing documentation with the now-working hosted GovAI audit endpoint **`https://audit.govbase.dev`** and clarifies which localhost defaults remain intentionally valid for local development and local CI service jobs.

## Scope

- No changes to API routes, endpoint paths, verdict semantics, ledger isolation behavior, or local test assumptions.
- Documentation-only alignment plus Railway environment guidance updates.
- Local mode remains supported (Docker Compose and local runs) with `127.0.0.1:8088` as a valid loopback default.

## Evaluation gate

### Why localhost remains valid (local mode)

Local development, tests, and local CI service jobs commonly start the audit service on a loopback bind and fixed port:

- `AIGOV_BIND=127.0.0.1:8088` (default)
- Evidence producers (CLI / scripts) use `http://127.0.0.1:8088` as a default when a hosted base URL is not configured

This is intentionally preserved because it is the simplest safe default for:

- local development (no public listener)
- CI jobs that start the audit service inside the same runner VM
- deterministic tests that assume a local service address

### Why `https://audit.govbase.dev` is canonical for hosted/customer docs

For hosted pilots, customers must configure a stable public HTTPS origin for the audit service. The canonical hosted endpoint that is known to work is:

- `GOVAI_AUDIT_BASE_URL=https://audit.govbase.dev` (customer / caller config)
- `GOVAI_BASE_URL=https://audit.govbase.dev` (server-side config so `GET /status` can report a canonical `base_url`)

### Railway environment guidance

Hosted deployment guidance for Railway-shaped platforms:

- `GOVAI_BASE_URL=https://audit.govbase.dev`
- `AIGOV_ENVIRONMENT=prod` (production tier; code accepts `dev|staging|prod`)
- `AIGOV_BIND=0.0.0.0:8080` (or platform-provided `PORT` via `0.0.0.0:$PORT`)

### Verification commands (hosted)

```bash
curl -i https://audit.govbase.dev/health
curl -i https://audit.govbase.dev/ready
curl -i https://audit.govbase.dev/status
```

### Expected `/ready` result (hosted)

`GET /ready` returns HTTP 200 when the hosted service is operationally ready, including:

- `database_ping=true`
- `ledger_writable=true`
- `migrations_complete=true`

## Human approval gate

This change updates customer-facing hosted documentation and deployment guidance. Human review is required to confirm that hosted onboarding remains accurate while local defaults remain unchanged for local development and local CI service jobs.

