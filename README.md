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

- **Free — €0:** local testing and evaluation, limited runs, PyPI CLI (`aigov-py==0.1.1`), audit evidence export.
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
python -m pip install "aigov-py==0.1.1"
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

## Hosted pilot prerequisites

GovAI is **ready for GitHub Marketplace draft and hosted pilot onboarding**.

It is **not yet a full self-serve SaaS**.

Hosted backend and API key provisioning are still **operator managed**.

Repeatable operator + customer steps (pilot runbook):

- `docs/hosted-pilot-runbook.md`

Minimum hosted-pilot path (what must exist before a new pilot user can reach `VALID`):

- **How a pilot user gets `base_url`**: the operator provides a hosted HTTPS audit API base URL (the GovAI audit service), for example `https://audit.example.com`.
- **How a pilot user gets an API key**: the operator provisions and distributes a bearer token (one per customer/team). This is manual or semi-automated in a pilot.
- **How a pilot user creates/receives `run_id`**: the pilot user generates a UUID (or the operator provides one). The same `run_id` must be reused for evidence submission, the CI gate, and export.
- **How evidence is submitted**: evidence events are appended to the hosted audit service via `POST /evidence` (either via `govai run demo-deterministic` for onboarding, or via your CI/app pipeline emitting evidence events).
- **How the run reaches `VALID`**: the run transitions `BLOCKED → VALID` only after all required evidence is appended for the same `run_id` and policy rules pass; the authoritative source is `GET /compliance-summary`.
- **How CI gate checks `VALID`**: the GitHub Action runs `govai check`, which calls `GET /compliance-summary` and passes only when the server returns `VALID`.

## Canonical flow (discovery → requirements → BLOCKED → evidence → VALID → export → CI)

GovAI is designed around **one evidence run id** (`run_id`) and **one authoritative decision endpoint** (`GET /compliance-summary`).

Canonical customer flow:

1. **Discovery finds AI usage** (signals are recorded as evidence for a specific `run_id`).
2. **GovAI derives requirements** from the current policy and any discovery signals (required evidence can increase when discovery indicates AI usage).
3. **The run is `BLOCKED` while evidence is missing** (the summary reports `verdict: BLOCKED` and lists missing required evidence items).
4. **The customer submits the missing evidence** for the same `run_id` (additional events are appended via `POST /evidence`).
5. **The run becomes `VALID`** once the required evidence is present and policy rules pass (the authoritative source is still `GET /compliance-summary`).
6. **The customer exports audit JSON** for archiving and review (`govai export-run` or `GET /api/export/<run_id>`).
7. **The CI gate passes only on `VALID`** (`govai check` exits 0 only when the server verdict is `VALID`; otherwise it fails the job).

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

If you are onboarding a new pilot customer, follow `docs/hosted-pilot-runbook.md` end-to-end first (hosted backend + key + deterministic demo + CI gate + export).

### Minimal copy-paste GitHub Actions workflow (strict gate)

1) Set repository configuration in **Settings → Secrets and variables → Actions**:

- Variable `GOVAI_AUDIT_BASE_URL`: `https://<your GovAI audit API base URL>`
- Variable `GOVAI_RUN_ID`: `<your evidence run id>` (not GitHub’s `github.run_id`)
- Secret `GOVAI_API_KEY`: `<your API key>` (required; missing key fails CI immediately)

2) Add this workflow file to your repo at `.github/workflows/govai-check.yml`:

```yaml
name: GovAI compliance gate

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  govai-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: GovAI compliance check (must be VALID)
        uses: Kovali/GovAI@v1
        with:
          run_id: ${{ vars.GOVAI_RUN_ID }}
          base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
          api_key: ${{ secrets.GOVAI_API_KEY }}
```

See `docs/github-action.md` for the action behavior details (strict fail-fast on missing config).

### First-time end-to-end (reach `BLOCKED` then `VALID`)

To validate your setup before relying on the CI gate, run the hosted deterministic onboarding flow locally against your GovAI audit API:

```bash
python -m pip install --upgrade pip
python -m pip install "aigov-py==0.1.1"

export GOVAI_AUDIT_BASE_URL="https://<your GovAI audit API base URL>"
export GOVAI_API_KEY="YOUR_API_KEY"

export GOVAI_RUN_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"

export GOVAI_DEMO_RUN_ID="$GOVAI_RUN_ID"
govai run demo-deterministic
govai check --run-id "$GOVAI_RUN_ID"
```

Expected behavior:

- First, the run reports `verdict: BLOCKED` and lists missing required evidence.
- After the demo appends the remaining evidence for the same `run_id`, the run becomes `verdict: VALID`.
- The CI gate passes only when the server verdict is `VALID`.

## Operator-hosted backend (Docker Compose quickstart)

This repo includes a minimal operator-hosted path to run the Rust audit service + Postgres locally via Docker Compose (intended as a **quickstart**, not production hardening).

```bash
docker compose up -d --build
```

Smoke test:

```bash
curl -sS http://127.0.0.1:8088/status
curl -sS http://127.0.0.1:8088/health
```

Details and limitations: `docs/hosted-backend-deployment.md` → “Operator-hosted quickstart (Docker Compose)”.

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

Minimal definitions and non-claims:

- `docs/trust-model.md`
- `docs/cvut-teaching.md` (teaching-friendly)

## Current maturity

GovAI is **ready for hosted pilots with manual or semi-automated onboarding** (for example: an admin provisions `GOVAI_AUDIT_BASE_URL` and an API key, and you run the canonical onboarding flow).

It is **not yet a full self-serve SaaS** (no productized signup, automated provisioning, or account lifecycle).

It is **not yet billing-ready** (no self-serve checkout and no automated billing).

## Marketplace draft checklist

- **root action exists**: `action.yml` exists at the repository root.
- **strict gate fails on missing config**: missing `run_id`, `base_url`, or `api_key` fails fast.
- **gate passes only on VALID**: the action exits 0 only when the backend verdict is `VALID`.
- **BLOCKED output shows missing evidence**: `BLOCKED` is surfaced as a compliance failure, not a silent skip.
- **hosted base URL and API key are required**: customers must configure `GOVAI_AUDIT_BASE_URL` and `GOVAI_API_KEY`.
- **support contact is listed**: support contact for Marketplace users is `support@govbase.dev`.
