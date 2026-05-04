# Evidence first-write initialization (API-key tenant ledger)

## Summary

`POST /evidence` must allow the **first evidence event** to initialize a new **ledger for the API-key tenant** (from **`GOVAI_API_KEYS_JSON`**) when that ledger does not exist yet.

Clients may still send optional labeling metadata, for example:

- `X-GovAI-Project: <project>` (metadata / billing / usage labels only — **not** the ledger isolation boundary)

This is required so GitHub Actions (and other clients) can:

1. Create a new run with a first evidence event, then
2. Call `govai check` / `GET /compliance-summary` with the **same API key** and `run_id` (same ledger tenant).

**Ledger isolation:** using one API key across multiple projects shares the same ledger. Separate tenants require separate API keys.

## Incident / failure mode

Observed failure on first write (no prior ledger file for the API-key tenant):

- Request:
  - `POST /evidence`
  - `Authorization: Bearer <key>`
  - `X-GovAI-Project: github-actions`
- Response:
  - `POLICY_VIOLATION` (`environment_policy`)
  - error details: `log not found: audit_log__github-actions.jsonl` (the `__…` suffix is the **tenant_id** from **`GOVAI_API_KEYS_JSON`** for that API key, not from **`X-GovAI-Project`**)

## Root cause

The ingest pipeline enforces the environment policy by reading existing events for a run.

For a **brand-new tenant ledger**, the tenant-scoped ledger file does not exist yet. The environment policy attempted to read it and treated “file not found” as an error, which prevented the first append from ever creating the ledger.

## Fix

Treat a missing tenant-scoped ledger file as an **empty ledger** (no events yet) when collecting existing events for a run.

This preserves:

- **payload validation** (the submitted event is still validated)
- **tenant isolation** (ledger path is determined **only** by the API-key tenant from **`GOVAI_API_KEYS_JSON`**; **`X-GovAI-Project` does not define the ledger path**)
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

A first `POST /evidence` request for a new **API-key tenant** ledger must return a successful response and initialize the ledger instead of failing with `log not found`.

## Human approval gate

This change is approved because first-write ledger initialization is required for hosted operation. It preserves **API-key-derived** tenant isolation and does not weaken compliance verdict logic.
