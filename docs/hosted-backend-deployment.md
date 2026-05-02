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
    - [ ] `GET /bundle-hash` (returns `bundle_sha256` and **`events_content_sha256`** for artefact-bound CI gates — schema **`aigov.evidence_digest.v1`**)
    - [ ] `GET /api/export/:run_id` (optional cross-check from `verify-evidence-pack`: `evidence_hashes.events_content_sha256`)
    - [ ] `GET /status`
    - [ ] `GET /usage`
  - [ ] **Liveness** probe: **`GET /health`** (process is up — no dependency checks).
  - [ ] **Readiness** probe (recommended behind a load balancer): **`GET /ready`** — returns **503** unless Postgres responds, **`_sqlx_migrations`** shows the expected number of successful applies, and the ledger directory is writable (see below).

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

### Required in staging / production (durable audit evidence)

- **`GOVAI_LEDGER_DIR`**
  - Example: `GOVAI_LEDGER_DIR=/var/lib/govai/ledger`
  - This directory **must be backed by persistent storage** (durable volume / durable disk).
  - The service will **fail startup in staging/prod** if this is missing, not creatable, or not writable.
  - Warning: **ephemeral container filesystems are unsafe** for audit evidence; do not rely on the process working directory.

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
  - Bind address for the server (default locally: **`127.0.0.1:8088`**).
  - On **Railway**, **Heroku-style** platforms, **`PORT`**, or other dynamic ports: use **`AIGOV_BIND="0.0.0.0:$PORT"`** (shell must expand `$PORT`; a plain `ENTRYPOINT` without a shell often does **not** expand it — use `sh -c '…'`).
  - **Do not** assume a fixed **8088** on hosted platforms; **`PORT`** must come from the platform when applicable.

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
- **`GET /health`**: **liveness** — process is running (`ok: true`); does **not** verify Postgres or the ledger disk.
- **`GET /ready`**: **readiness** — verifies Postgres, applied migrations marker, and ledger writability.

## Railway — production-shaped start command

Use the **`aigov_audit`** binary (repo build output: `./aigov_audit`). Typical **Railway Start Command**:

```bash
sh -c 'mkdir -p /var/lib/govai/ledger; GOVAI_LEDGER_DIR=/var/lib/govai/ledger AIGOV_BIND="0.0.0.0:$PORT" ./aigov_audit'
```

Mount **`GOVAI_LEDGER_DIR`** to a Railway volume or other durable filesystem. Do **not** use **`/tmp`** or any ephemeral-only path for real audit tiers: **`AIGOV_ENVIRONMENT=staging`** / **`prod`** requires a persistent ledger directory. **Losing or wiping `GOVAI_LEDGER_DIR` invalidates append-only audit continuity guarantees.**

Set at least:

- **`GOVAI_DATABASE_URL`** (or **`DATABASE_URL`**) — managed Postgres URL.
- **`GOVAI_API_KEYS`** — comma-separated bearer secrets (must align with tenant mapping when **`GOVAI_API_KEYS_JSON`** is used).
- **`GOVAI_API_KEYS_JSON`** — staging/production expect a JSON map of **`api_key → tenant_id`** (see Rust `audit_api_key` module): required for isolated hosted tenants on **`AIGOV_ENVIRONMENT=staging`** / **`prod`**.
- **`AIGOV_ENVIRONMENT`** — use **`staging`** or **`prod`** for hosted tiers (determines startup strictness).
- **`GOVAI_AUTO_MIGRATE`** — **`true`** in simple Railway setups, **or** run SQLx migrations as a separate release step.
- **`PORT`** — provided by Railway; **do not** hardcode **8088** for this platform.

Local and Docker Compose examples may still use **`127.0.0.1:8088`** or **`0.0.0.0:8088`** explicitly; hosted examples should always follow the platform’s **`PORT`**.

## Verification commands

### Run locally against hosted settings (bind to all interfaces)

```bash
export AIGOV_BIND="0.0.0.0:8088"
export GOVAI_DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME"
export GOVAI_LEDGER_DIR="/var/lib/govai/ledger"
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

## Operator-hosted quickstart (Docker Compose)

This is a **minimal operator-hosted path** for running the GovAI Rust audit service plus Postgres on a single machine using Docker Compose. It is intended for evaluation, internal environments, and “boring” first deployments.

Non-goals (this quickstart does **not** claim):

- high availability / multi-region
- zero-downtime deploys
- secret management beyond environment variables
- backups/restore automation (you must configure this yourself)

### Start

From the repo root:

```bash
docker compose up -d --build
```

The service listens on `http://127.0.0.1:8088`.

### Migrations

In this Compose setup, migrations run automatically on startup because it sets:

- `GOVAI_AUTO_MIGRATE=true`

Outside Compose, migrations are **off by default**. To enable, set `GOVAI_AUTO_MIGRATE=true` for the process.

### Smoke tests

```bash
curl -sS http://127.0.0.1:8088/status
curl -sS http://127.0.0.1:8088/health
```

### Operator env vars (recommended)

Edit `docker-compose.yml` and set:

- `GOVAI_API_KEYS` (otherwise core audit endpoints are unauthenticated)
- `GOVAI_BASE_URL` (shown in `GET /status`)

## CI and protected branches (downstream repositories)

- Require **`.github/workflows/compliance.yml`** and the **artefact-bound** hosted job (**`govai-compliance-gate`**: **`submit-evidence-pack` + `verify-evidence-pack`**) for merges that must mean “CI evidence was posted to the hosted ledger and evaluated **VALID**”. See **[github-action.md](github-action.md)**.
- Do **not** treat **`.github/workflows/govai-smoke.yml`** (manual **synthetic** smoke) or **`govai check` alone** as a production compliance gate.
- In automation (CI wait loops, load balancers), use **`GET /ready`** for **readiness**; **`GET /status`** and **`GET /health`** are not substitutes for database, migrations, and ledger writability.

## Notes / pending

- `GET /usage` is **implemented** already.
- **Staging/production** deployments fail fast today when **`GOVAI_API_KEYS_JSON`** is unset/invalid (**tenant isolation**), when **loopback binds** slip through (**`AIGOV_ENVIRONMENT=staging`** / **`prod`**), when **migrations** are incomplete without **`GOVAI_AUTO_MIGRATE`**, or when **`GOVAI_LEDGER_DIR`** is not durable — see server startup logs and **`GET /ready`** for live dependency status.
