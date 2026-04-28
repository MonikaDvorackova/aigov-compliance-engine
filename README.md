# GovAI

GovAI is a CI compliance gate for AI systems with audit evidence export.

## Product Scope

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

## Private pilot and pricing

**Private pilot:** Email [hello@govbase.dev](mailto:hello@govbase.dev?subject=GovAI%20private%20pilot%20request) with subject `GovAI private pilot request` to scope a pilot (one AI system or CI pipeline, hosted or self-hosted audit endpoint, feedback during the pilot). This is not a productized signup flow.

See docs/pilot-onboarding.md for private pilot setup.

**Indicative tiers** (no self-service checkout or automated billing on this site):

- **Free — €0:** local testing and evaluation, limited runs, PyPI CLI (`aigov-py==0.1.0`), audit evidence export.
- **Pro — €199/month:** production CI, higher run/event limits, GitHub Action, hosted audit endpoint, standard support.
- **Enterprise — Custom:** regulated or larger teams, custom limits, self-hosted or dedicated deployment, SSO/access control where supported, audit and procurement support.

## Decision states

VALID:  
All required evidence present. Deployment allowed.

INVALID:  
Evidence present but fails policy. Deployment rejected.

BLOCKED:  
Required evidence missing. Deployment halted.

## Install

**GovAI CLI (PyPI — official):**

```bash
python -m pip install --upgrade pip
python -m pip install "aigov-py==0.1.0"
```

**Repository contributors** (editable install from a clone of this repo):

```bash
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cd ..
```

## Quickstart

Start the audit service, emit evidence, and read the authoritative decision from `GET /compliance-summary`.

Quickstarts:

- `docs/customer-onboarding-10min.md` (hosted customer onboarding — canonical)
- `docs/quickstart-5min.md` (local demo)
- `docs/customer-quickstart.md` (legacy customer / CI quickstart)
- `docs/pilot-onboarding.md` (private pilot onboarding)

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

    curl -sS "http://127.0.0.1:8088/compliance-summary?run_id=$GOVAI_RUN_ID"

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

Use `govai check` to gate deployments. It does not compute compliance locally — it calls `GET /compliance-summary` and exits non-zero unless the server verdict is `VALID`.

Use **one** GovAI evidence run id (`GOVAI_RUN_ID`) for every evidence submission, the gate, and export.

    export GOVAI_AUDIT_BASE_URL='https://your-audit-service'
    export GOVAI_RUN_ID='<your evidence run uuid>'
    govai check --run-id "$GOVAI_RUN_ID"

See `docs/github-action.md` for the composite GitHub Action (installs `aigov-py==0.1.0` from PyPI).

## Audit export (machine-readable)

To export a run into a **stable JSON** document that includes the **decision** fields and **hashes** (bundle SHA-256 + append-only chain hashes), use:

    govai export-run --run-id "$GOVAI_RUN_ID"

HTTP equivalent:

    curl -sS "http://127.0.0.1:8088/api/export/$GOVAI_RUN_ID"

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
