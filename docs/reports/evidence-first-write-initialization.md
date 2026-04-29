# Evidence first-write initialization (tenant/project ledger)

## Summary

`POST /evidence` must allow the **first evidence event** to initialize a new tenant/project ledger when scoping is provided via:

- `X-GovAI-Project: <project>`

This is required so GitHub Actions (and other clients) can:

1. Create a new run with a first evidence event, then
2. Call `govai check` / `GET /compliance-summary` under the same tenant context.

## Incident / failure mode

Observed failure on first write (no prior ledger file for the tenant/project):

- Request:
  - `POST /evidence`
  - `Authorization: Bearer <key>`
  - `X-GovAI-Project: github-actions`
- Response:
  - `POLICY_VIOLATION` (`environment_policy`)
  - error details: `log not found: audit_log__github-actions.jsonl`

## Root cause

The ingest pipeline enforces the environment policy by reading existing events for a run.

For a **brand-new tenant ledger**, the tenant-scoped ledger file does not exist yet. The environment policy attempted to read it and treated “file not found” as an error, which prevented the first append from ever creating the ledger.

## Fix

Treat a missing tenant-scoped ledger file as an **empty ledger** (no events yet) when collecting existing events for a run.

This preserves:

- **payload validation** (the submitted event is still validated)
- **tenant isolation** (ledger path still depends on `X-GovAI-Project` / bearer fingerprint)
- **verdict logic** (no compliance checks were weakened; `govai check` can still return `BLOCKED` for incomplete evidence)

## Tests

Added an HTTP regression test that:

- does **not** pre-create the tenant ledger file
- performs `POST /evidence` with:
  - `Authorization: Bearer <test key>`
  - `X-GovAI-Project: github-actions`
  - `event_type=ai_discovery_reported`
  - `run_id=test_project_context_1`
- asserts:
  - response is `2xx`
  - tenant ledger file is created
  - ledger contains the `run_id`


## Evaluation gate

A first `POST /evidence` request for a new tenant/project ledger must return a successful response and initialize the ledger instead of failing with `log not found`.

## Human approval gate

This change is approved because first-write ledger initialization is required for hosted operation. It preserves tenant isolation and does not weaken compliance verdict logic.
