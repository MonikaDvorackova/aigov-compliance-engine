# GovAI

GovAI is a system for governance of ML runs through structured evidence and policy-gated lifecycle events.

It records what happened, enforces what is allowed next, and derives a verifiable compliance decision.

---

## 5 minute demo

```bash
cd python
pip install -e ".[dev]"

govai run demo
```

Expected output:

VALID

Requires a running audit service.

## What this solves

**Without GovAI:**

- logs are scattered across systems
- no verifiable audit trail
- compliance decisions are manual and non-reproducible

**With GovAI:**

- every step is recorded as structured evidence
- decisions are derived, not guessed
- full audit chain is verifiable end-to-end

## How it works

GovAI models an ML run as a sequence of events written to an append-only log.
A policy layer enforces which events are allowed next.
From that log, the system derives:

- bundle → full evidence for a run
- compliance summary → final decision
- audit chain → verifiable history

**Distribution:** PyPI/installable package **`aigov-py`**, Python import **`govai`**, terminal command **`govai`**.

## Quickstart

```bash
# Start audit service
export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DBNAME'
make audit_bg
curl -sS http://127.0.0.1:8088/status
```

The system computes a compliance state from accepted events under policy; the outputs below reflect that state for the given run.

Expected:

```json
{"ok": true, "policy_version": "v0.5_dev", "environment": "dev"}
```

(`environment` reflects the server deployment tier, e.g. `dev`, `staging`, or `prod`.)

### Optional: API key auth

When the audit process is started with **`GOVAI_API_KEYS`** (comma-separated bearer secrets; optional per-key caps as `secret:max_requests`), most gated audit routes require **`Authorization: Bearer <key>`**. **`GET /bundle-hash`** and **`GET /verify-log`** stay open (no gate). If **`GOVAI_API_KEYS`** is unset, behavior matches an open local server.

```bash
export GOVAI_API_KEYS="test-key"
# restart audit service so it picks up the env var
```

Python:

```python
client = GovAIClient("http://127.0.0.1:8088", api_key="test-key")
```

CLI: set **`GOVAI_API_KEY`** to a value listed in **`GOVAI_API_KEYS`** so `govai` audit calls (e.g. `compliance-summary`, `fetch-bundle`, `check`) send the header. The **`govai`** CLI also honors **`--api-key`** if you already use it.

```bash
# Protected route (e.g. GET /verify); unauthenticated requests return 401 with {"ok":false,"error":"unauthorized"}.
curl -sS -H "Authorization: Bearer test-key" "http://127.0.0.1:8088/verify"
```

```bash
# Install Python package
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cd ..
```

```bash
# Minimal Python example
source python/.venv/bin/activate
python <<'PY'
import uuid
from datetime import datetime, timezone

from govai import GovAIClient, submit_event, get_compliance_summary, verify_chain

def now_utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

client = GovAIClient("http://127.0.0.1:8088")
run_id = str(uuid.uuid4())

submit = submit_event(
    client,
    {
        "event_id": str(uuid.uuid4()),
        "event_type": "data_registered",
        "ts_utc": now_utc(),
        "actor": "quickstart",
        "system": "govai_quickstart",
        "run_id": run_id,
        "payload": {
            "ai_system_id": "expense-ai",
            "dataset_id": "expense_dataset_v1",
            "dataset": "customer_expense_records",
            "dataset_version": "v1",
            "dataset_fingerprint": "sha256:demo",
            "dataset_governance_id": "gov_expense_v1",
            "dataset_governance_commitment": "basic_compliance",
            "source": "internal",
            "intended_use": "expense classification",
            "limitations": "demo dataset",
            "quality_summary": "validated sample",
            "governance_status": "registered",
        },
    },
)

summary = get_compliance_summary(client, run_id)
chain = verify_chain(client)

print("RUN_ID=" + run_id)
print("submit_event=", submit)
print("get_compliance_summary=", summary)
print("verify_chain=", chain)
PY
```

Example output:

```json
{"ok": true, "record_hash": "<hex>", "policy_version": "v0.5_dev", "environment": "dev"}
```

```json
{"ok": true, "schema_version": "aigov.compliance_summary.v2", "run_id": "<uuid>"}
```

```json
{"ok": true, "policy_version": "v0.5_dev"}
```

```bash
# CLI
source python/.venv/bin/activate
govai init --url http://127.0.0.1:8088
```

Expected:

```json
{"ok": true, "audit_base_url": "http://127.0.0.1:8088"}
```

```bash
export RUN_ID='<paste RUN_ID>'

govai compliance-summary --run-id "$RUN_ID"
govai verify --json --run-id "$RUN_ID"
```

Expected:

```json
{
  "run_id": "<uuid>",
  "verdict": "VALID",
  "checks": [
    { "id": "governance_chain", "ok": true },
    { "id": "evidence_events", "ok": true }
  ]
}
```

---

## Why GovAI

GovAI turns AI system behavior into verifiable evidence.

Instead of trusting logs or model outputs, you get a deterministic audit trail:
events → hash chain → compliance verdict.

This makes AI systems auditable, testable, and enforceable in CI.

## Example Use Case

### 1. Problem

A **retail bank** maintains an **online transaction fraud scoring model** that gates card-not-present authorizations. Model releases are tied to internal **model risk management** and **second-line review**: each production candidate must show **which data** was used, **how** it was evaluated, **who** approved deployment, and **when** the artifact was released. The bank’s current practice mixes **CI job logs**, **ticketing**, and **email** for sign-off. That breaks down under scrutiny: timestamps and approvers are not bound to a single immutable sequence, **steps can be repeated or skipped** without a machine check, and reconstructing “what was true at release time” requires manual correlation across systems. **Traceability** from a deployed model version back to dataset identity, metrics, and human decision is slow and error-prone.

### 2. How GovAI is used

GovAI is the **audit ledger and policy gate** for one **training and release cycle** identified by a single `run_id`.

**Control flow (strict order):**

1. **Training pipeline** (batch job or CI) generates a **`run_id`** and emits **`data_registered`**: the service accepts `POST /evidence` only if the payload matches the policy schema for that event type.
2. The same job emits **`model_trained`** after registration for that `run_id`; policy **rejects** `model_trained` if no prior `data_registered` exists for that run.
3. After evaluation completes offline or in CI, the pipeline emits **`evaluation_reported`** with measured metric fields; pass/fail follows **policy** (see evaluation bullet below).
4. **Risk workflow** emits **`risk_recorded`**, then **`risk_reviewed`**, linking the run to an assessment record.
5. A **named approver** (model risk or delegated role) emits **`human_approved`**, referencing the assessment, dataset commitment, and scope for that `run_id`.
6. **Release automation** emits **`model_promoted`** as the **final release decision** only when prior events for that `run_id` satisfy policy; otherwise append fails and promotion does not enter the log.

**Policy enforcement:** Each successful append is evaluated by **embedded policy** for the server tier (`v0.5_dev`, `v0.5_staging`, or `v0.5_prod` from **`AIGOV_ENVIRONMENT`** / **`AIGOV_ENV`** / **`GOVAI_ENV`**; default is dev — see `rust/src/govai_environment.rs`) before write. **Out-of-order or missing prerequisites** result in **rejection of the event**, not a silent partial state: you cannot record promotion without evaluation and approval, and you cannot skip dataset registration before training. **Event emission** is explicit: clients call `POST /evidence` with structured JSON; the ledger stores **append-only** records. If an event is rejected, the client must correct missing prerequisites and re-emit the event for the same `run_id`; rejected events are not persisted.

**CI/CD gating:** The deploy job **reads GovAI** (compliance summary or `govai verify`) for the target `run_id` before changing production artifacts or infrastructure. If the outcome is not **VALID**, the pipeline **stops** and that deployment does not run.

### 3. What data flows through the system

- **`run_id`** — UUID for one candidate release path (one chain of evidence for that training job and its decisions).
- **`actor`** — Who caused the event (e.g. CI principal `fraud-train-ci`, human `reviewer:jane.doe@bank`, release job `fraud-promote-prod`).
- **`system`** — Logical producer (e.g. `fraud-model-training-pipeline`, `model-risk-workbench`, `artifact-promotion-service`).
- **Dataset identifiers and hashes** — In `data_registered` payload: `dataset_id`, `dataset_version`, `dataset_fingerprint` (e.g. SHA-256 of the approved snapshot), `dataset_governance_id`, `dataset_governance_commitment`, plus `ai_system_id` binding the dataset to the fraud engine’s registered AI system id.
- **Evaluation metrics** — In `evaluation_reported` payload: measured values (e.g. precision/recall at a score cutoff, false positive rate). **Thresholds and pass rules live in policy**, not per request; the client supplies metrics, and **policy** determines whether **`passed`** is true for that policy version.
- **Approval data** — In `human_approved` payload: linkage to the **assessment** id, confirmation of reviewed risk, and references to the same **dataset commitment** and **scope** policy requires for that run.
- **Promotion data** — In `model_promoted` payload: artifact location or version handle the bank uses (e.g. container digest, model registry id) so the ledger event ties the **released binary** to the **same `run_id`**.

Each event also carries **`event_id`**, **`event_type`**, **`ts_utc`**, and a **`payload`** object shaped by schema and policy for that type.

### 4. What output you get (decision + audit)

**Decision states** (from compliance verification over the run):

Several `run_id`s can be in flight at once; **only** runs whose projected state is **VALID** are eligible for promotion.

- **VALID** — Evaluation requirements are met, human approval is present, and the run is in a state where **promotion is allowed** under policy (all required evidence for that verdict is present and consistent).
- **BLOCKED** — Required steps are **missing or incomplete** (e.g. evaluation not passed, approval not recorded, or promotion attempted without prerequisites). The run must not be treated as releasable until the chain is completed.
- **INVALID** — **Evaluation failed** (or equivalent governance rule): the run is **not eligible** for production regardless of later events; do not promote.

**Audit output:**

- **Ordered event chain** — For a given `run_id`, **read APIs** derive a single ordered sequence from the append-only log (e.g. bundle and compliance summary). Reviewers see the **same order** policy enforced at write time.
- **Hash integrity** — Each record links to the previous via cryptographic hash; **`GET /verify`** (and CLI `govai verify`) reports whether the **chain is intact** and matches stored hashes.
- **Traceability** — From **production** (artifact referenced in `model_promoted`) back to **dataset fingerprint**, **metrics and pass/fail**, **risk lifecycle**, and **approver identity**, without relying on a separate ticket system as the source of truth; suitable for internal audit, regulators, and third-party review.

## Example: ML pipeline audit

Minimal example: register a dataset event and evaluate compliance.

```bash
source python/.venv/bin/activate
python <<'PY'
import uuid
from govai import GovAIClient, submit_event, get_compliance_summary

client = GovAIClient("http://127.0.0.1:8088")
run_id = str(uuid.uuid4())

submit_event(client, {
    "event_id": str(uuid.uuid4()),
    "event_type": "data_registered",
    "ts_utc": "2024-01-01T00:00:00Z",
    "actor": "pipeline",
    "system": "ml_training",
    "run_id": run_id,
    "payload": {
        "ai_system_id": "expense-ai",
        "dataset_id": "expense_dataset_v1",
        "dataset": "customer_expense_records",
        "dataset_version": "v1",
        "dataset_fingerprint": "sha256:demo",
        "dataset_governance_id": "gov_expense_v1",
        "dataset_governance_commitment": "basic_compliance",
        "source": "internal",
        "intended_use": "expense classification",
        "limitations": "demo dataset",
        "quality_summary": "validated sample",
        "governance_status": "registered"
    },
})

summary = get_compliance_summary(client, run_id)
print(summary)
PY
```

Expected:

```json
{
  "ok": true,
  "run_id": "<uuid>",
  "current_state": {
    "model": {
      "evaluation_passed": null
    }
  }
}
```

## CI Integration

Fail the build if compliance is not satisfied.

```bash
govai verify --json --run-id "$RUN_ID"
```

Expected:

```json
{
  "run_id": "<uuid>",
  "verdict": "VALID",
  "checks": [
    { "id": "governance_chain", "ok": true }
  ]
}
```

### Example: blocked deployment

```bash
bash examples/blocked_deployment.sh
```

Expected:

```json
{
  "verdict": "INVALID"
}
```

This results in a blocked deployment (non-zero exit code).

## Core vs Non-Core

Core (requires audit reports):

- `python/govai/**`
- `rust/**`
- architecture definitions (`ARCHITECTURE.md`, `docs/strong-core-contract-note.md`)

Non-core:

- CLI wrappers (`python/aigov_py/cli.py` and related terminal tooling)
- dashboard
- tooling

## Decision-Oriented Compliance

The run detail page is designed to answer a single question:

Can this model be promoted to production?

Each run resolves to one of three states:

- VALID – all requirements met (evaluation passed, approval granted, promotion allowed)
- INVALID – evaluation failed
- BLOCKED – at least one required step is missing or unresolved

The decision follows a strict rule order:

evaluation → approval → promotion

## What the UI shows

- a dominant decision (VALID / INVALID / BLOCKED)
- a single-line explanation
- readiness signals:
  - Evaluation
  - Approval
  - Promotion
  - Primary risk (if present)

All technical details (hashes, raw payloads, audit diagnostics) are separated into a secondary view.

## Design guarantees

- No inconsistent states between decision and signals
- No false VALID results when audit data is missing or invalid
- Decisions are scannable in seconds

## Example

VALID  
All requirements met. Promotion is allowed.

BLOCKED  
Approval required before promotion.

INVALID  
Evaluation failed. Do not promote.

---

## AIGov Compliance Engine (v0.1)

**Research prototype** — governance-by-design reference for ML runs: append-only, hash-chained evidence in a Rust service, policy checks before append, Python training and reporting, and optional Supabase-backed UI ingest. **This software does not provide legal compliance, certification, or a warranty of any kind.**

The **core abstractions** (identifiers, evidence events, bundle, projection, compliance summary) are **regulation-agnostic**. The [EU AI Act](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) appears only as **illustrative mapping** for documentation and thesis context—not as legal advice or exhaustive compliance.

## What it does

- **Append-only audit ledger** — Rust service appends hash-chained JSONL (`rust/audit_log.jsonl`) on successful `POST /evidence`; **`policy_version`** in API responses follows the deployment tier (`v0.5_dev` / `v0.5_staging` / `v0.5_prod`; see `rust/src/govai_environment.rs` and `rust/src/main.rs`).
- **HTTP surface (Rust, same process)** — Core: `GET /`, `GET /health`, `GET /status`. Audit log: `POST /evidence`, `GET /verify`, `GET /bundle`, `GET /bundle-hash`, `GET /compliance-summary`, `GET /verify-log`, `GET /api/export/:run_id` (machine export JSON). Postgres-backed console: `GET /api/me`, `POST /api/assessments`, `GET`/`POST /api/compliance-workflow`, `GET /api/compliance-workflow/:run_id`, `POST /api/compliance-workflow/:run_id/review`, `POST /api/compliance-workflow/:run_id/promotion`.
- **Bundle and compliance views** — `GET /bundle`, `/bundle-hash`, `/compliance-summary` derive from the log; `GET /verify` checks chain integrity; `GET /verify-log` returns compact chain JSON for local/CI checks.
- **Reference training pipeline** — Python `pipeline_train` trains sklearn `LogisticRegression`, emits events to the audit URL, then stops for human approval; `approve` / `promote` complete the lifecycle.
- **Reports and packs** — Markdown audit reports, audit manifest JSON, and ZIP packs under `docs/` via Makefile targets.
- **Optional dashboard** — Next.js app reads runs from Supabase after `db_ingest` (see [DEMO_FLOW.md](DEMO_FLOW.md)).

**Core vs prototype:** the portable core is the Rust ledger + policy + bundle/summary HTTP surface and identifier contracts in [docs/strong-core-contract-note.md](docs/strong-core-contract-note.md). The `prototype_domain` demo and optional Supabase/dashboard paths are integration/demo layers. Boundary detail: [OPEN_SOURCE_SCOPE.md](OPEN_SOURCE_SCOPE.md).

## Prerequisites

- **Rust** (2021) — `rust/`
- **Python ≥ 3.10** — venv under `python/.venv`, `pip install -e .` from `python/`
- **PostgreSQL** — **`DATABASE_URL`** required (Rust builds a pool at startup)

Optional: **Supabase** credentials for `db_ingest` and the dashboard; Rust **`/api/me`**, **`/api/assessments`**, and **`/api/compliance-workflow`** routes need **`SUPABASE_URL`** (JWKS) and a valid Bearer JWT (see [ARCHITECTURE.md](ARCHITECTURE.md)).

```bash
cd python && python -m venv .venv && . .venv/bin/activate && pip install -e .
```

## Python governance library (`import govai`)

Thin **HTTP client** for the **Rust audit API** (`POST /evidence`, `GET /bundle`, `GET /bundle-hash`, `GET /compliance-summary`, `GET /verify`). Shipped in the **`aigov-py`** distribution under the import path **`govai`**. Use **`GovAIClient`** from `govai` for those routes. **`GovaiClient`** in `aigov_py.client` is separate: it only implements **`create_assessment`** → **`POST /api/assessments`** (Supabase JWT and team resolution as in your deployment; see [ARCHITECTURE.md](ARCHITECTURE.md)).

**Install** (from repo root):

```bash
cd python && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
```

**Example**

```python
from govai import GovAIClient, get_compliance_summary, submit_event, verify_chain

base_url = "http://127.0.0.1:8088"  # audit service origin only (no path suffix)
client = GovAIClient(base_url, api_key=None)  # optional: Bearer if your deployment requires it

out = submit_event(client, {...})  # or client.submit_event(...)
summary = get_compliance_summary(client, run_id="...")
chain = verify_chain(client)  # or client.verify_chain(); body uses ok true/false (HTTP 200 either way)
```

**Decision / current state** — No separate decision URL. When `summary["ok"]` is true, read `summary["current_state"]`. Use `current_state_from_summary` / `decision_signals_from_summary` for common fields; VALID / INVALID / BLOCKED follows rule order in [Decision-Oriented Compliance](#decision-oriented-compliance).

**Tests:** `cd python && pytest tests/test_govai_sdk.py -v`

## Terminal SDK v0.1 (`govai` command)

Install the package from `python/` (`pip install -e .`). The **`govai`** executable is the primary CLI for the audit workflow: bundle fetch, report render, export, verification, compliance summary, and (when your deployment enables it) assessment APIs on the **same** Rust service.

**Config:** `govai init --url http://127.0.0.1:8088` writes `.govai/config.json` in the current directory. Override the path with env `GOVAI_CONFIG`. Precedence for the audit URL is: `GOVAI_AUDIT_BASE_URL` / `AIGOV_AUDIT_URL` / `AIGOV_AUDIT_ENDPOINT`, then `--audit-base-url`, then the config file, then `http://127.0.0.1:8088`. Optional bearer token: `GOVAI_API_KEY`, `--api-key`, or `govai init --store-api-key …`.

**Exit codes:** `0` — success (including `verify` with verdict VALID and `check` with VALID); `1` — HTTP/network, assessment API error, or unexpected exception; `2` — invalid usage, `verify` verdict INVALID / failed local checks, or `check` when the compliance label is not VALID (INVALID / BLOCKED).

**Canonical CLI workflow** (Rust service reachable; replace `RUN_ID` after your train/approve/promote steps, or use the Makefile demo to produce artifacts under `docs/`):

```bash
cd python && . .venv/bin/activate
govai init --url http://127.0.0.1:8088
export RUN_ID=<uuid>   # optional if you pass --run-id on every command
govai fetch-bundle --run-id "$RUN_ID"
govai report --run-id "$RUN_ID"
govai export-bundle --run-id "$RUN_ID"
govai verify --run-id "$RUN_ID"        # human-readable report; add --json for machine output
govai compliance-summary --run-id "$RUN_ID"
govai check "$RUN_ID"                  # prints VALID | INVALID | BLOCKED from /compliance-summary (exit 0 only if VALID)
```

Subcommands: `init`, `run demo`, `verify`, `fetch-bundle`, `compliance-summary`, `check`, `report`, `export-bundle`, `create-assessment`. Global flags: `--config`, `--audit-base-url`, `--api-key`, `--timeout`, `--compact-json`.

Tests: `cd python && pytest tests/test_cli_terminal_sdk.py`.

## Quick start (five steps)

1. **Set `DATABASE_URL`** to a reachable Postgres connection string.

2. **Start the evidence service** (default `http://127.0.0.1:8088`, override with `AIGOV_BIND`):

   ```bash
   make audit_bg
   ```

   On success the server prints `govai listening on http://…` (see `rust/src/main.rs`); `make audit_bg` prints `ready on http://127.0.0.1:8088` when the `/status` probe succeeds.

3. **Sanity check:** `make status` → `{"ok":true,"policy_version":"v0.5_dev","environment":"dev"}` (values reflect your env); `make verify` → JSON with `"ok":true` and `"policy_version"` when the chain is valid.

4. **Train:** `make run` → note `done run_id=<uuid> accuracy=<float> passed=<true|false>`, then `pending_human_approval`.

5. **Finish the run:** use that `RUN_ID`:

   ```bash
   RUN_ID=<uuid> make approve
   RUN_ID=<uuid> make promote
   RUN_ID=<uuid> make report_prepare
   ```

   This produces `docs/evidence/<RUN_ID>.json`, `docs/reports/<RUN_ID>.md`, `docs/audit/<RUN_ID>.json`, `docs/packs/<RUN_ID>.zip` and runs CLI verification.

**Optional:** `make flow_full` runs train → approve → promote → `report_prepare`, then prints **`GET /compliance-summary`** JSON (same prerequisites as `audit_bg`). `make demo_new` runs the same train → approve → promote → `report_prepare` → `db_ingest` (needs Supabase env for ingest). **`make gate`** checks that `docs/reports/*.md` contain `## Evaluation gate` and `## Human approval gate`.

## Demo commands and expected outputs

| Step | Command | Expected (representative) |
|------|---------|---------------------------|
| Service up | `make audit_bg` | `starting aigov_audit…` then `ready on http://127.0.0.1:8088`, or `aigov_audit already running…` |
| Liveness | `make status` | `{"ok":true,"policy_version":"v0.5_dev","environment":"dev"}` (tier-specific) |
| Chain | `make verify` | `"ok":true` and `policy_version`, or `"ok":false` with `error` |
| Train | `make run` | `done run_id=…`, `pending_human_approval`, printed `make bundle RUN_ID=…` hint |
| Approve | `RUN_ID=… make approve` | JSON with `"ok":true` and `record_hash` on success |
| Promote | `RUN_ID=… make promote` | JSON with `"ok":true` on success |
| Report pack | `RUN_ID=… make report_prepare` | Writes under `docs/`; `verify_cli` prints `AIGOV VERIFICATION REPORT` and ends with `VERDICT VALID` or `VERDICT INVALID` |
| Full flow + compliance summary | `RUN_ID=… make flow_full` | Same as report row, then stdout JSON from `/compliance-summary?run_id=…` (`ok`, `schema_version`, `current_state`, …) |
| CI gate | `make gate` | `gate OK; checked N reports` or `gate: no reports found; OK` |

UUIDs, accuracy, and hashes change every run. Full walkthrough: [DEMO_FLOW.md](DEMO_FLOW.md).

## Golden run reference path

Stable location for optional pinned snapshots and notes: **[docs/demo/golden-run/](docs/demo/golden-run/)** (see README there). Live reproduction always uses the Makefile flow above.

## Documentation

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, routes, storage paths |
| [DEMO_FLOW.md](DEMO_FLOW.md) | Commands and expected outputs in detail |
| [OPEN_SOURCE_SCOPE.md](OPEN_SOURCE_SCOPE.md) | Core vs demo vs optional; out of scope |
| [docs/THESIS_REFERENCE_SCOPE.md](docs/THESIS_REFERENCE_SCOPE.md) | Thesis vs repository |
| [docs/strong-core-contract-note.md](docs/strong-core-contract-note.md) | Identifiers and compliance-summary contract |
| [docs/technical-documentation.md](docs/technical-documentation.md) | Legacy notes (partially superseded for v0.1) |

## Roadmap

Work after v0.1 is organized into pragmatic horizons. Priority is reliability first, then usability, then expansion. No timelines, no promises.

### Next (immediate)

- API keys  
  Introduce consistent authentication across all services. Support issue, revoke, and basic scoping. Align behavior across API, CLI, and SDK.

- Hosted platform (foundations)  
  Stabilize self-hosting: configuration, health checks, logging, and Postgres-backed run storage. Add backup and restore procedures.

- Better SDKs (Python)  
  Improve typing, error handling, retries, and align methods with real workflows (submit → evaluate → approve → promote → summary → verify).

### Near-term

- Hosted platform (managed)  
  Provide a managed deployment option. Start with isolated (single-tenant) setups. Focus on provisioning and updates.

- Multi-project support  
  Enable separation of workloads within one org. Isolated runs and policies per project.

- Better SDKs (TypeScript)  
  Introduce a minimal TypeScript client for core flows only.

### Later

- Hosted platform (scale)  
  Improve efficiency and reliability after usage patterns are validated.

- API keys (advanced)  
  Add fine-grained scopes, rotation, audit logs, and optional IdP integration.

- Multi-project (advanced)  
  Cross-project reporting, shared templates, and migration tools.

- Better SDKs (maturity)  
  Stabilize APIs and introduce versioning. Consider generated clients if API surface stabilizes.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
