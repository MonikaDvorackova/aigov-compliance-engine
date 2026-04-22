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

Without GovAI:

- logs are scattered across systems
- no verifiable audit trail
- compliance decisions are manual and non-reproducible

With GovAI:

- every step is recorded as structured evidence
- decisions are derived, not guessed
- full audit chain is verifiable end-to-end

---

## Quickstart

```bash
cd python
pip install -e ".[dev]"

govai run demo
```

Requires a running audit service.

Expected output:

```
VALID
```

Prerequisites: Rust, Python ≥ 3.10, PostgreSQL (`DATABASE_URL`).

**Deployment tier** (`dev` / `staging` / `prod`): variable precedence, defaults, and migrations — [env-resolution.md](env-resolution.md).

Start the audit service (default `http://127.0.0.1:8088`; see README for `make audit_bg`).

Other flows: `make run` → approve → promote, or `make flow_full`.

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
GET /verify?run_id=...

Result: VALID / INVALID / BLOCKED

---

## API surface (Python + CLI)

### HTTP (Rust audit service)

**Billing:** Successful `POST /evidence` appends increment **`govai_usage_counters`** (canonical); `GOVAI_METERING` team tables are telemetry only. Per-key HTTP caps are not billing. See root README.

**`GET /usage` contract:** The response **always** includes canonical billing fields sourced from **`govai_usage_counters`** (`tenant_id`, `period_start`, `evidence_events_count`, `limit`) for the same billing scope as ingest. Fields such as **`team_id`**, **`plan`**, **`year_month`**, **`new_run_ids`**, **`evidence_events`** (team table), and **`limits`** are **optional telemetry** when `GOVAI_METERING` is on and a team mapping exists. **Missing telemetry does not imply incorrect billing**—the canonical counter is authoritative.

| Method | Path | Role |
|--------|------|------|
| POST | `/evidence` | Append one event (policy-gated) |
| GET | `/usage` | Canonical monthly evidence count + limit (`govai_usage_counters`) |
| GET | `/bundle` | Bundle JSON for a run |
| GET | `/bundle-hash` | Canonical bundle hash |
| GET | `/compliance-summary` | Compliance summary + state |
| GET | `/verify` | Chain verification |
| GET | `/verify-log` | Verify on-disk audit log |

### Python (`govai` package)

- `GovAIClient`
- `submit_event`
- `get_compliance_summary`
- `verify_chain`
- `current_state_from_summary`

### CLI (`govai`)

| Command | Purpose |
|---------|---------|
| `govai init` | Configure CLI |
| `govai run demo` | Run full deterministic compliance flow |
| `govai compliance-summary` | Fetch summary |
| `govai verify` | Verify audit chain |

Deeper detail: [ARCHITECTURE.md](../ARCHITECTURE.md)
