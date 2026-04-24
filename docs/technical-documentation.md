# Technical documentation

**Authoritative layout for the current implementation:** [ARCHITECTURE.md](../ARCHITECTURE.md), [DEMO_FLOW.md](../DEMO_FLOW.md), [OPEN_SOURCE_SCOPE.md](../OPEN_SOURCE_SCOPE.md). **Canonical HTTP v1 contract:** [`api/govai-http-v1.openapi.yaml`](../api/govai-http-v1.openapi.yaml). This file retains a compact technical summary.

## Scope

Implemented scope:

- Tamper-evident audit logging (hash-chained JSONL records)
- Policy-as-code enforcement before append (`v0.4_human_approval`)
- Dataset fingerprint and governance fields in `data_registered`
- Per-run exportable evidence bundle and Markdown report

---

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

## Rust evidence service (`rust/`)

- **Ingest:** `POST /evidence` — body: `EvidenceEvent` (`event_id`, `event_type`, `ts_utc`, `actor`, `system`, `run_id`, `payload`).
- **Usage / export:** `GET /usage`, `GET /api/export/:run_id`.
- **Chain:** `GET /verify`, `GET /verify-log`
- **Bundle:** `GET /bundle?run_id=…`, `GET /bundle-hash?run_id=…`
- **Summary:** `GET /compliance-summary?run_id=…` — `ok`, `schema_version` (`aigov.compliance_summary.v2`), `policy_version`, `run_id`; when `ok` is true — `verdict` (`VALID` / `INVALID` / `BLOCKED`) and `current_state` (inner `schema_version`: `aigov.compliance_current_state.v2`, same projection as bundle `identifiers` for canonical fields).
- **Storage:** append-only `audit_log.jsonl` (relative to process cwd when running from `rust/`).
- **Other:** `GET /status` (`ok`, `policy_version`, `environment`); `GET /`, `/health` — service metadata (`GET /` is **internal** per OpenAPI).

Authenticated routes (Supabase JWT; **stable** enterprise surface): `GET /api/me`, `POST /api/assessments`, `/api/compliance-workflow*` — see OpenAPI.

## Python ML pipeline

- `python -m aigov_py.pipeline_train` — sklearn `LogisticRegression` on Iris; posts events to `AIGOV_AUDIT_URL` (default `http://127.0.0.1:8088`).

## Policy / event sequence (enforced in Rust)

The policy enforces payload shapes and ordering for a governed promotion path, including:

- `data_registered` (dataset + governance metadata + `dataset_governance_commitment`, `ai_system_id`, `dataset_id`, …)
- `model_trained` (after `data_registered` for the same `run_id`)
- `evaluation_reported` (metric / threshold / passed)
- `risk_recorded` → `risk_mitigated` → `risk_reviewed` (assessment and risk linkage)
- `human_approved` (linkage to assessment, risk, dataset commitment, scope)
- `model_promoted` (evaluation passed, approved human and risk review linkage)

See `rust/src/policy.rs` for the exact rules.

## Exports and Makefile

- `make bundle RUN_ID=…` → `aigov_py.export_bundle` (expects `docs/evidence/<RUN_ID>.json` and `docs/reports/<RUN_ID>.md`).
- `make report_prepare RUN_ID=…` → fetch evidence, render report, export bundle, verify CLI.

## Integrity

- `make verify` — calls `GET /verify` on the running service (full chain).

## EU AI Act (mapping only)

Mechanisms above can be described in terms of Articles 9–13 (risk, data, documentation, logging, transparency) as a framing for engineering mechanisms. Mapping does not imply regulatory completeness.
