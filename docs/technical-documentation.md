# Technical documentation (v0.1)

**Authoritative layout for the current implementation:** [ARCHITECTURE.md](../ARCHITECTURE.md), [DEMO_FLOW.md](../DEMO_FLOW.md), [OPEN_SOURCE_SCOPE.md](../OPEN_SOURCE_SCOPE.md). This file retains a compact technical summary.

## Scope

Proof-of-concept for:

- Tamper-evident audit logging (hash-chained JSONL records)
- Policy-as-code enforcement before append (`v0.4_human_approval`)
- Dataset fingerprint and governance fields in `data_registered`
- Per-run exportable evidence bundle and Markdown report

## Rust evidence service (`rust/`)

- **Ingest:** `POST /evidence` — body: `EvidenceEvent` (`event_id`, `event_type`, `ts_utc`, `actor`, `system`, `run_id`, `payload`).
- **Chain:** `GET /verify`, `GET /verify-log`
- **Bundle:** `GET /bundle?run_id=…`, `GET /bundle-hash?run_id=…`
- **Summary:** `GET /compliance-summary?run_id=…` — `ok`, `schema_version` (`aigov.compliance_summary.v2`), `policy_version`, `run_id`, `current_state` (inner `schema_version`: `aigov.compliance_current_state.v2`, same projection as bundle `identifiers` for canonical fields)
- **Storage:** append-only `audit_log.jsonl` (relative to process cwd when running from `rust/`).
- **Other:** `GET /status` (`{"ok":true,"policy_version":"…"}`); `GET /`, `/health` — service metadata.

Authenticated routes (Supabase JWT): `GET /api/me`, `POST /api/assessments`.

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

Mechanisms above can be **discussed** in terms of Articles 9–13 (risk, data, documentation, logging, transparency) for research and communication. The **implementation** remains a small PoC; mapping does not imply regulatory completeness.
