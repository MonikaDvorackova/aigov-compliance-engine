# GovAI

Package name: aigov-py  
Import: govai  
CLI: govai  

## Quickstart

```bash
# Start audit service
export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DBNAME'
make audit_bg
curl -sS http://127.0.0.1:8088/status
```

Expected:

```json
{"ok": true, "policy_version": "v0.4_human_approval"}
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
{"ok": true, "record_hash": "<hex>", "policy_version": "v0.4_human_approval"}
```

```json
{"ok": true, "schema_version": "aigov.compliance_summary.v2", "run_id": "<uuid>"}
```

```json
{"ok": true, "policy_version": "v0.4_human_approval"}
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

- **Append-only audit ledger** — Rust service appends hash-chained JSONL (`rust/audit_log.jsonl`) on successful `POST /evidence`; policy version is `v0.4_human_approval` (see `rust/src/main.rs`).
- **Bundle and compliance views** — `GET /bundle`, `/bundle-hash`, `/compliance-summary` derive from the log; `GET /verify` checks chain integrity.
- **Reference training pipeline** — Python `pipeline_train` trains sklearn `LogisticRegression`, emits events to the audit URL, then stops for human approval; `approve` / `promote` complete the lifecycle.
- **Reports and packs** — Markdown audit reports, audit manifest JSON, and ZIP packs under `docs/` via Makefile targets.
- **Optional dashboard** — Next.js app reads runs from Supabase after `db_ingest` (see [DEMO_FLOW.md](DEMO_FLOW.md)).

**Core vs prototype:** the portable core is the Rust ledger + policy + bundle/summary HTTP surface and identifier contracts in [docs/strong-core-contract-note.md](docs/strong-core-contract-note.md). The `prototype_domain` demo and optional Supabase/dashboard paths are integration/demo layers. Boundary detail: [OPEN_SOURCE_SCOPE.md](OPEN_SOURCE_SCOPE.md).

## Prerequisites

- **Rust** (2021) — `rust/`
- **Python ≥ 3.10** — venv under `python/.venv`, `pip install -e .` from `python/`
- **PostgreSQL** — **`DATABASE_URL`** required (Rust builds a pool at startup)

Optional: **Supabase** credentials for `db_ingest` and the dashboard; Rust **`/api/me`** / **`/api/assessments`** need **`SUPABASE_URL`** (JWKS) and a valid Bearer JWT (see [ARCHITECTURE.md](ARCHITECTURE.md)).

```bash
cd python && python -m venv .venv && . .venv/bin/activate && pip install -e .
```

## Python governance library (`import govai`)

Thin **HTTP client** for the **Rust audit API** (`POST /evidence`, `GET /bundle`, `GET /bundle-hash`, `GET /compliance-summary`, `GET /verify`). Shipped in the **`aigov-py`** distribution under the import path **`govai`**. Use **`GovAIClient`** from `govai` — not **`GovaiClient`** in `aigov_py.client`, which targets product/assessment HTTP routes when you wire that separately.

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

**Exit codes:** `0` — success (including `verify` with verdict VALID); `1` — HTTP/network or assessment API error; `2` — invalid usage or `verify` verdict INVALID.

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
```

Subcommands: `init`, `verify`, `fetch-bundle`, `report`, `export-bundle`, `compliance-summary`, `create-assessment`, `finalize`, `evidence`. Global flags: `--config`, `--audit-base-url`, `--api-key`, `--timeout`, `--compact-json`.

Tests: `cd python && pytest tests/test_cli_terminal_sdk.py`.

## Quick start (five steps)

1. **Set `DATABASE_URL`** to a reachable Postgres connection string.

2. **Start the evidence service** (default `http://127.0.0.1:8088`, override with `AIGOV_BIND`):

   ```bash
   make audit_bg
   ```

   On success the server prints `govai listening on http://…` (see `rust/src/main.rs`); `make audit_bg` prints `ready on http://127.0.0.1:8088` when the `/status` probe succeeds.

3. **Sanity check:** `make status` → `{"ok":true,"policy_version":"v0.4_human_approval"}`; `make verify` → JSON with `"ok":true` and `"policy_version"` when the chain is valid.

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
| Liveness | `make status` | `{"ok":true,"policy_version":"v0.4_human_approval"}` |
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

## License

Apache License 2.0 — see [LICENSE](LICENSE).
