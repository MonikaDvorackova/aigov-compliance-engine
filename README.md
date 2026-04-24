# GovAI

GovAI is a CI compliance gate for AI systems with audit evidence export.

## Product Scope

GovAI is a CI compliance gate for AI systems with audit evidence export.

It:

- accepts evidence via POST /evidence
- enforces policy constraints at write time
- produces deterministic decision via GET /compliance-summary
- blocks CI if verdict != VALID
- exports audit data via GET /api/export/:run_id

Guarantees:

- deterministic decision for given evidence + policy_version
- append-only evidence log
- hash chaining integrity

Non-guarantees:

- not a legal certification
- not full compliance coverage
- does not generate missing evidence

## When to use GovAI

- deploying ML models via CI/CD
- enforcing approval workflows before release
- requiring audit evidence for decisions

## Decision states

VALID:  
All required evidence present. Deployment allowed.

INVALID:  
Evidence present but fails policy. Deployment rejected.

BLOCKED:  
Required evidence missing. Deployment halted.

## Install

    cd python
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e ".[dev]"
    cd ..

## Quickstart

Start the audit service, emit evidence, and read the authoritative decision from `GET /compliance-summary`.

Minimal onboarding (API key → first evidence → compliance check → interpretation):

- `docs/quickstart-5min.md`

    export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DBNAME'
    make audit_bg
    curl -sS http://127.0.0.1:8088/status

Expected (representative):

    {"ok": true, "policy_version": "v0.5_dev", "environment": "dev"}

    source python/.venv/bin/activate
    python <<'PY'
    import uuid
    from datetime import datetime, timezone

    from govai import GovAIClient, submit_event

    def now_utc() -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    run_id = str(uuid.uuid4())
    client = GovAIClient("http://127.0.0.1:8088")

    ai_system_id = "expense-ai"
    dataset_id = "expense_dataset_v1"
    model_version_id = "expense_model_v3"
    risk_id = "risk_expense_model_v3"

    events = [
        ("data_registered", {
            "ai_system_id": ai_system_id,
            "dataset_id": dataset_id,
            "dataset": "customer_expense_records",
            "dataset_version": "v1",
            "dataset_fingerprint": "sha256:sample",
            "dataset_governance_id": "gov_expense_v1",
            "dataset_governance_commitment": "basic_compliance",
            "source": "internal",
            "intended_use": "expense classification",
            "limitations": "sample dataset",
            "quality_summary": "validated sample",
            "governance_status": "registered",
        }),
        ("model_trained", {
            "ai_system_id": ai_system_id,
            "model_version_id": model_version_id,
            "training_code_ref": "git:local",
        }),
        ("evaluation_reported", {
            "ai_system_id": ai_system_id,
            "model_version_id": model_version_id,
            "metric": "f1",
            "value": 0.92,
            "passed": True,
        }),
        ("risk_recorded", {
            "ai_system_id": ai_system_id,
            "risk_id": risk_id,
            "severity": "medium",
        }),
        ("risk_reviewed", {
            "ai_system_id": ai_system_id,
            "risk_id": risk_id,
            "decision": "approve",
            "reviewer": "quickstart",
        }),
        ("human_approved", {
            "ai_system_id": ai_system_id,
            "approver": "quickstart",
            "approved_scope": "deploy",
            "dataset_id": dataset_id,
            "model_version_id": model_version_id,
        }),
        ("model_promoted", {
            "ai_system_id": ai_system_id,
            "model_version_id": model_version_id,
            "release_target": "prod",
        }),
    ]

    for (event_type, payload) in events:
        submit_event(client, {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "ts_utc": now_utc(),
            "actor": "quickstart",
            "system": "expense_pipeline",
            "run_id": run_id,
            "payload": payload,
        })

    print(run_id)
    PY

    export RUN_ID='<paste run_id>'
    curl -sS "http://127.0.0.1:8088/compliance-summary?run_id=$RUN_ID"

Expected (representative):

    {
      "ok": true,
      "schema_version": "aigov.compliance_summary.v2",
      "policy_version": "v0.5_dev",
      "environment": "dev",
      "run_id": "<uuid>",
      "verdict": "VALID",
      "current_state": {
        "model": {
          "evaluation_passed": true,
          "promotion": {
            "state": "promoted"
          }
        },
        "approval": {
          "human_approval_decision": "approved"
        }
      }
    }

## Why GovAI

If you cannot prove why a specific model version was deployed, you do not have a deployment decision — you have a story.

GovAI makes deployment decisions verifiable and reproducible by:

- accepting lifecycle events as structured evidence (POST /evidence) into an append-only ledger
- enforcing policy at write time (out-of-order or missing prerequisites are rejected)
- projecting a single authoritative decision for a run: GET /compliance-summary → VALID / INVALID / BLOCKED

Decision authority: the only authoritative decision source is GET /compliance-summary. The database, UI, workflow rows, and CLI are consumers of that decision; they do not derive it.

## Example: ML pipeline audit

This example shows the decision path for an expense classification release candidate:

events → append-only evidence → GET /compliance-summary → decision

Key identifiers:

- ai_system_id: expense-ai
- dataset_id: expense_dataset_v1
- model_version_id: expense_model_v3
- risk_id: risk_expense_model_v3

Minimal event flow (in order):

1. data_registered (dataset identity + fingerprint)
2. model_trained (ties a model version to the run)
3. evaluation_reported (metrics as evidence; policy decides pass/fail)
4. risk_recorded + risk_reviewed (explicit risk linkage and review outcome)
5. human_approved (named approval)
6. model_promoted (release intent, only accepted when prerequisites are satisfied)

The result is never inferred locally. The decision is read from:

    curl -sS "http://127.0.0.1:8088/compliance-summary?run_id=$RUN_ID"

and interpreted only by its returned fields (verdict, current_state, and the policy metadata).

Result:

GET /compliance-summary → verdict: VALID

Because:

- evaluation passed
- risk reviewed
- human approved
- promotion event accepted

Non-happy paths:

- INVALID → evaluation or risk conditions not met
- BLOCKED → missing human approval or promotion prerequisites

## CI Integration

Use govai check to gate deployments. It does not compute compliance locally — it calls GET /compliance-summary and exits non-zero unless the server verdict is VALID.

    export RUN_ID='<your run id>'
    govai check "$RUN_ID"

## Audit export (machine-readable)

To export a run into a **stable JSON** document that includes the **decision** fields and **hashes** (bundle SHA-256 + append-only chain hashes), use:

    govai export-run --run-id "$RUN_ID"

HTTP equivalent:

    curl -sS "http://127.0.0.1:8088/api/export/$RUN_ID"

## GitHub Actions integration

GovAI can be used as a CI compliance gate. See `docs/github-action.md`.

## Core vs Non-Core

- Core: the append-only audit log, policy enforcement at POST /evidence, and the single authoritative projection GET /compliance-summary (decision + state).
- Non-Core: workflow tables/queues and helper tooling/CLI wrappers. They may display or transport evidence, but they do not decide.

## Pricing

Free:

- limited runs per month
- limited events per run
- includes:
  - compliance summary
  - CI gate
  - audit export

Pro:

- higher limits
- includes everything in Free

Enterprise:

- custom limits
- includes:
  - SLA
  - security review support
  - custom policy configuration

Note:
Limits are exposed via GET /usage.

## Auditability and Trust

- append-only logs
- hash chaining (prev_hash → record_hash)
- deterministic decision (policy_version)
- exportable audit JSON
