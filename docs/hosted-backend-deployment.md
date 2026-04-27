# Hosted backend deployment (GovAI Audit Service)

This repo includes a Rust HTTP service (`aigov_audit`) that provides the **audit ledger** endpoints used by the Python terminal SDK and (optionally) the dashboard.

Goal for “hosted mode”: customers call your hosted URL and **do not run Rust or Postgres locally**.

## Hosted deployment checklist (exact)

- **Build artifact**
  - [ ] Build the Rust service (`aigov_audit`) into a container or host-native binary.
  - [ ] Ensure the runtime exposes an HTTP port and supports long-running processes.

- **Networking**
  - [ ] Public HTTPS URL provisioned (this is your **audit base URL**).
  - [ ] Ingress routes allowed for:
    - [ ] `POST /evidence`
    - [ ] `GET /compliance-summary`
    - [ ] `GET /status`
    - [ ] `GET /usage`
  - [ ] Healthcheck configured to call **`GET /health`** (or `GET /status` if you prefer).

- **Database (managed Postgres)**
  - [ ] Provision a Postgres database (managed).
  - [ ] Run migrations / schema bootstrap as required by this repo’s SQLx usage (see “Verification commands” below).
  - [ ] Set DB connection env var (see “Required env vars”).

- **Auth / API keys**
  - [ ] Set `GOVAI_API_KEYS` (recommended for hosted mode). Without it, the audit endpoints are **unauthenticated** (legacy local behavior).
  - [ ] Distribute one API key to each customer.

- **Base URL config**
  - [ ] Set `GOVAI_BASE_URL` so `GET /status` reports the canonical public URL.

- **Smoke test**
  - [ ] `GET /status` returns `ok: true`.
  - [ ] `POST /evidence` works with a valid API key.
  - [ ] `GET /compliance-summary?run_id=...` returns a verdict.
  - [ ] `GET /usage` returns usage for the same API key.

## Required environment variables (hosted mode)

### Always required

- **`GOVAI_DATABASE_URL`** (preferred) or **`DATABASE_URL`**
  - Postgres connection string for the hosted service.
  - If neither is set, the service fails fast on startup with an explicit error.

### Strongly recommended for hosted mode

- **`GOVAI_API_KEYS`**
  - Comma-separated bearer secrets.
  - Format: `key1,key2` or `key1:1000,key2:5000` (per-key request caps).
  - If unset/empty, auth for `POST /evidence`, `GET /compliance-summary`, `GET /usage` is **disabled** (local-friendly default).

- **`GOVAI_BASE_URL`**
  - Canonical public base URL (e.g. `https://audit.example.com`).
  - Returned by `GET /status` as `base_url` for ops/debugging.

### Optional (only if you use these features)

- **`AIGOV_BIND`**
  - Bind address for the server (default: `127.0.0.1:8088`).
  - In containers, typically set to `0.0.0.0:8088`.

- **`GOVAI_METERING`**
  - `on` enables team-scoped metering enforced on `POST /evidence`.
  - When `GOVAI_METERING=on`, `GOVAI_API_KEYS` must be non-empty (service fails fast otherwise).

- **`GOVAI_DEFAULT_PLAN`**
  - `free|team|growth|enterprise` (used when metering is on; default `free`).

- **`GOVAI_API_USAGE_STORE`**
  - `memory` (default) or `postgres` (persist per-key request counts).

- **Policy config**
  - **`AIGOV_POLICY_FILE`**: explicit policy file path (JSON).
  - **`AIGOV_POLICY_DIR`**: search dir for `policy.<env>.json` or `policy.json`.
  - **`AIGOV_APPROVER_ALLOWLIST`**: CSV override for approver identities (when allowlist enforcement is enabled).

- **Supabase auth (only for dashboard-oriented endpoints under `/api/*`)**
  - **`SUPABASE_URL`** (required for `/api/me`, assessments, workflow endpoints when they are used)
  - **`SUPABASE_JWT_AUD`** (optional audience check)

## Hosted-mode configuration path (for customers)

Customers only need:

- **Audit base URL**: your hosted URL (example `https://audit.example.com`)
- **API key**: one bearer token from you

In the Python terminal SDK, they configure:

- Base URL: `GOVAI_AUDIT_BASE_URL` (or the CLI config file written by `govai init`)
- API key: `GOVAI_API_KEY`

## Endpoints (hosted service contract)

- **`POST /evidence`**: append one evidence event (requires bearer token when `GOVAI_API_KEYS` is set)
- **`GET /compliance-summary?run_id=<id>`**: compute compliance verdict + missing evidence (requires bearer token when `GOVAI_API_KEYS` is set)
- **`GET /status`**: lightweight JSON status (`ok`, `policy_version`, `environment`, optional `base_url`)
- **`GET /usage`**: usage counters (requires bearer token when `GOVAI_API_KEYS` is set)
- **`GET /health`**: healthcheck endpoint (always `ok: true`)

## Verification commands

### Run locally against hosted settings (bind to all interfaces)

```bash
export AIGOV_BIND="0.0.0.0:8088"
export GOVAI_DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME"
export GOVAI_API_KEYS="replace_with_real_secret"
export GOVAI_BASE_URL="https://audit.example.com"

cargo run -p aigov_audit
```

### Health / status

```bash
curl -sS "$GOVAI_BASE_URL/health"
curl -sS "$GOVAI_BASE_URL/status"
```

### Evidence append (requires API key when enabled)

```bash
RUN_ID="550e8400-e29b-41d4-a716-446655440000"
curl -sS -X POST "$GOVAI_BASE_URL/evidence" \
  -H "Authorization: Bearer replace_with_real_secret" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id":"e1",
    "event_type":"ai_discovery_reported",
    "ts_utc":"2026-04-21T12:00:00Z",
    "actor":"hosted-smoke",
    "system":"curl",
    "run_id":"'"$RUN_ID"'",
    "payload":{"openai":false,"transformers":false,"model_artifacts":false}
  }'
```

### Compliance summary

```bash
curl -sS "$GOVAI_BASE_URL/compliance-summary?run_id=$RUN_ID" \
  -H "Authorization: Bearer replace_with_real_secret"
```

### Usage

```bash
curl -sS "$GOVAI_BASE_URL/usage" \
  -H "Authorization: Bearer replace_with_real_secret"
```

## Notes / pending

- `GET /usage` is **implemented** already.
- If you want an always-on “hosted mode” hard requirement for auth (fail fast when `GOVAI_API_KEYS` is missing), add a deployment-side policy to enforce that (or extend startup checks). This doc keeps the current local-friendly default behavior.
