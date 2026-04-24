# GovAI documentation

Short entry point for the **GovAI Compliance Engine** — append-only evidence, policy-gated lifecycle events, and derived compliance reads. For full setup and demos, see the [root README](../README.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

---

## Table of contents

- [GovAI documentation](#govai-documentation)
  - [Table of contents](#table-of-contents)
  - [Overview](#overview)
  - [Why GovAI](#why-govai)
  - [Quickstart](#quickstart)
  - [Concepts](#concepts)
    - [Event](#event)
    - [Bundle](#bundle)
    - [Compliance summary](#compliance-summary)
    - [Audit chain](#audit-chain)
  - [Example Flow](#example-flow)
  - [API surface (Python + CLI)](#api-surface-python--cli)
    - [HTTP (Rust audit service)](#http-rust-audit-service)
    - [Python (`govai` package)](#python-govai-package)
    - [CLI (`govai`)](#cli-govai)

---

## Overview

GovAI is a system for governance of ML runs: training and lifecycle steps are recorded as events in an append-only log; policy decides which events may be appended next. **Bundles** and **compliance summaries** are **derived** from that log — they are not separate sources of truth.

Operationally, the stack answers: **can this run be promoted?** A run maps to a **compliance state** (e.g. VALID / INVALID / BLOCKED) following a fixed order: **evaluation → approval → promotion**.

**Disclaimer:** This is a **research prototype**. It does not provide legal compliance or certification. Identifiers and contracts are regulation-agnostic unless you add a separate presentation layer.

---

## Why GovAI

GovAI provides:

- an append-only evidence ledger (`POST /evidence`)
- policy enforcement at write time (out-of-order or missing prerequisites are rejected)
- a single authoritative decision for a run (`GET /compliance-summary` → `VALID | INVALID | BLOCKED`)

---

## Quickstart

For a minimal onboarding flow with exact commands (API key → first evidence → compliance check → interpretation), use:

- [quickstart-5min.md](quickstart-5min.md)

Notes:

- The single authoritative decision is `GET /compliance-summary` (verdict `VALID | INVALID | BLOCKED`).
- `govai run demo` is the fastest way to produce a complete, policy-satisfying evidence sequence.

---

## Concepts

### Event

A single recorded fact about a system action.

### Bundle

A complete set of events representing one run.

### Compliance summary

The final decision derived from evidence.

### Audit chain

A cryptographically verifiable sequence of events.

---

## Example Flow

A minimal compliance run:

register data  
train model  
report evaluation  
record and review risk  
approve promotion  
promote model  
compute compliance summary  
verify audit chain  

Example API sequence:

POST /evidence  
POST /evidence  
POST /evidence  
POST /evidence  
POST /evidence  
POST /evidence  
POST /evidence  
POST /evidence  
GET /compliance-summary?run_id=...  
GET /verify

Result: VALID / INVALID / BLOCKED

---

## API surface (Python + CLI)

**Canonical v1 contract:** [`api/govai-http-v1.openapi.yaml`](../api/govai-http-v1.openapi.yaml) (implicit v1 paths; breaking-change and deprecation rules are defined in `info.description`). **`GET /` is internal** (ops banner only); documented SDK/CLI flows use **stable** paths only.

### HTTP (Rust audit service)

**Auth:** `POST /evidence`, `GET /usage`, `GET /verify`, `GET /bundle`, `GET /compliance-summary`, and `GET /api/export/:run_id` require a Bearer token when audit API keys are enforced. `GET /bundle-hash` and `GET /verify-log` are intentionally unauthenticated.

**Tenant isolation (required):**

- **Canonical tenant source**: `X-GovAI-Project: <project>`
- **Safe fallback (when header is absent)**: API key fingerprint (derived from Bearer token), when present
- **Non-dev enforcement**: in `staging` / `prod`, any route that touches the audit ledger will return `400` with a normalized error body when neither `X-GovAI-Project` nor a Bearer token is present.

#### Normalized error format (all endpoints)

All error responses include:

- `ok: false`
- `error`: machine-readable code/category
- `code`: machine-readable discriminator (usually equals `error`; for `policy_violation` it is the specific policy rule code)
- `message`: human-friendly explanation

Optional fields like `details`, `policy_version`, `metering`, `used`, `limit`, etc. may appear depending on the endpoint.

Example (missing tenant context):

```json
{
  "ok": false,
  "error": "missing_tenant_context",
  "code": "missing_tenant_context",
  "message": "Missing tenant context. Provide `X-GovAI-Project` header (recommended) or a bearer API key (tenant fingerprint fallback).",
  "policy_version": "v0.5_prod"
}
```

**`GET /usage` contract (minimal monetization surface):**

- When `GOVAI_METERING` is **off** (legacy quota mode), the response is scoped to a stable tenant id derived from `X-GovAI-Project` (if set), else API key fingerprint, else `default`:
  - `metering: "off"`, `tenant_id`, `period_start`, `evidence_events_count`, `limit`
- When `GOVAI_METERING` is **on** (team metering mode), the response is scoped to the API key → team mapping:
  - `metering: "on"`, `team_id`, `year_month`, `plan`, `new_run_ids`, `evidence_events`, `limits`

#### Endpoint: `GET /usage`

- **Auth**: Bearer token required when audit API keys are enabled.
- **Optional header**: `X-GovAI-Project: <project>`  
  Used only for legacy quota scoping when `GOVAI_METERING=off`. If omitted, the server falls back to API key fingerprint (when present), else `default`.
- **Parameters**: none.
- **Success (metering off) example**:

```json
{
  "metering": "off",
  "tenant_id": "team-alpha",
  "period_start": "2026-04-01",
  "evidence_events_count": 42,
  "limit": 1000
}
```

- **Success (metering on) example**:

```json
{
  "metering": "on",
  "team_id": "0b15f7f0-6e2b-4d0b-9f0f-2b6e5f4c6e5a",
  "year_month": "2026-04",
  "plan": "free",
  "new_run_ids": 3,
  "evidence_events": 120,
  "limits": {
    "max_runs_per_month": 100,
    "max_events_per_month": 100000,
    "max_events_per_run": 5000
  }
}
```

- **Failure behavior**: may return `401` (`unauthorized`) or `403` (`team_not_configured_for_api_key`) depending on server mode and configuration (always with `code` + `message`).

#### Endpoint: `GET /api/export/:run_id`

- **Auth**: Bearer token required when audit API keys are enabled.
- **Headers**: `X-GovAI-Project` required for explicit tenant selection; in `staging` / `prod` you must provide either `X-GovAI-Project` or a Bearer token (tenant context required).
- **Path parameter**: `run_id` (string, required).
- **Success example (shape)**:

```json
{
  "ok": true,
  "schema_version": "aigov.audit_export.v1",
  "policy_version": "v0.4_human_approval",
  "environment": "dev",
  "exported_at_utc": "2026-04-23T12:34:56Z",
  "run": { "run_id": "..." },
  "evidence_hashes": {
    "bundle_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "chain_head_record_sha256": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    "log_chain": [
      {
        "event_id": "…",
        "ts_utc": "…",
        "event_type": "…",
        "prev_hash": null,
        "record_hash": "…"
      }
    ]
  },
  "decision": {
    "human_approval": null,
    "promotion": null,
    "evaluation_passed": true
  },
  "timestamps": { "first_event_ts_utc": "...", "last_event_ts_utc": "..." }
}
```

- **Failure behavior**:
  - `400` with `{"ok":false,"error":"run_id_required",...}` when empty.
  - `404` with `{"ok":false,"error":"run_not_found",...}` when the run has no events.

#### Endpoint: `GET /verify`

- **Auth**: Bearer token required when audit API keys are enabled.
- **Headers**: `X-GovAI-Project` required for explicit tenant selection; in `staging` / `prod` you must provide either `X-GovAI-Project` or a Bearer token (tenant context required).
- **Success example**:

```json
{ "ok": true, "policy_version": "v0.4_human_approval" }
```

- **Failure behavior**: HTTP `200` with normalized error fields (`ok:false`, `error`, `code`, `message`, `policy_version`) when the chain is invalid.

| Method | Path | Role |
|--------|------|------|
| POST | `/evidence` | Append one event (policy-gated) |
| GET | `/usage` | Usage + limits (shape depends on metering mode) |
| GET | `/bundle` | Bundle JSON for a run |
| GET | `/bundle-hash` | Canonical bundle hash |
| GET | `/compliance-summary` | Compliance summary + state |
| GET | `/verify` | Chain verification |
| GET | `/verify-log` | Verify on-disk audit log |
| GET | `/api/export/:run_id` | Machine-readable audit export JSON |

### Python (`govai` package)

- `GovAIClient`
- `submit_event`
- `get_compliance_summary`
- `get_usage`
- `export_run`
- `verify_chain`
- `current_state_from_summary`

### CLI (`govai`)

| Command | Purpose |
|---------|---------|
| `govai init` | Configure CLI |
| `govai run demo` | Run full deterministic compliance flow |
| `govai compliance-summary` | Fetch summary |
| `govai verify` | Verify audit chain |
| `govai export-run` | Fetch machine-readable audit export JSON |

Deeper detail: [ARCHITECTURE.md](../ARCHITECTURE.md)
