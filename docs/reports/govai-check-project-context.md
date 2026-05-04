# GovAI check: project/tenant context consistency

## Goal

Ensure `POST /evidence` and `govai check` run under the **same**:

- `run_id` (evidence correlation key)
- **ledger tenant** (the caller’s API key as mapped in **`GOVAI_API_KEYS_JSON`** — this is the only ledger isolation boundary)
- optionally the same **`X-GovAI-Project`** value for consistent metadata / billing / usage labels (this header does **not** select the ledger)

Target project label (optional, for consistent headers across steps):

- `X-GovAI-Project: github-actions`

**Ledger isolation:** using one API key across multiple projects shares the same ledger. Separate tenants require separate API keys.

## What changed

### 1) GitHub workflow: `POST /evidence` now sends `X-GovAI-Project`

In `.github/workflows/govai-check.yml`:

- `POST /evidence` now includes:
  - `-H "X-GovAI-Project: github-actions"`
- The workflow prints for debugging/traceability:
  - effective `GOVAI_RUN_ID`
  - effective `GOVAI_PROJECT`
  - the exact evidence JSON body sent to `POST /evidence`
  - the response body from `POST /evidence`

### 2) CLI: minimal support so `govai check` uses the same project header

In `python/aigov_py/cli.py`:

- Added global project resolution:
  - `--project <value>` (preferred)
  - or env `GOVAI_PROJECT`
  - or env `X_GOVAI_PROJECT` (compat)
- The CLI now constructs `GovAIClient(..., default_project=...)` for:
  - `govai check`
  - `govai compliance-summary`
  - `govai submit-evidence`
  - discovery submission subcommands that call `POST /evidence`

This makes `govai check` send `X-GovAI-Project` consistently, because `GovAIClient` attaches the header on its session.

### 3) GitHub Action: project context is configurable (default `github-actions`)

In `action.yml` and `.github/actions/govai-check/action.yml`:

- Added optional input `project` (default `github-actions`)
- Sets `GOVAI_PROJECT` for the action step so `govai check` uses the same header
- Prints effective `GOVAI_RUN_ID` and `GOVAI_PROJECT`

## How to verify

### Workflow path (`.github/workflows/govai-check.yml`)

- Ensure logs show:
  - `Effective GOVAI_RUN_ID=...`
  - `Effective GOVAI_PROJECT=github-actions`
  - `Evidence JSON body:` (printed)
  - `Evidence POST response:` (printed)
- Confirm the evidence request includes the header:

```bash
-H "X-GovAI-Project: github-actions"
```

### CLI path (local / debugging)

Run:

```bash
export GOVAI_AUDIT_BASE_URL="https://YOUR_AUDIT_BASE_URL"
export GOVAI_API_KEY="YOUR_API_KEY"
export GOVAI_RUN_ID="..."
export GOVAI_PROJECT="github-actions"

govai check --run-id "$GOVAI_RUN_ID"
```

Expected behavior:

- `GET /compliance-summary` uses the **same API key** and `run_id` as `POST /evidence` (same ledger tenant). Matching `X-GovAI-Project` keeps optional metadata consistent but does not define isolation.

## Notes

- Ledger tenant is derived **strictly** from the API key mapping in **`GOVAI_API_KEYS_JSON`**. **`X-GovAI-Project`** is optional metadata / billing / labeling context only and is **not** a ledger isolation boundary.
- Aligning `X-GovAI-Project` across the GitHub Action “initialize run with minimal evidence” step and the compliance gate avoids mismatched usage labels; **RUN_NOT_FOUND**-style mismatches are resolved by matching API key + `run_id`, not by the project header.


## Evaluation gate

`POST /evidence` and `govai check` must use the same `GOVAI_RUN_ID`, `GOVAI_AUDIT_BASE_URL`, and **`GOVAI_API_KEY`** (same ledger tenant from **`GOVAI_API_KEYS_JSON`**). Use the same optional **`X-GovAI-Project`** only when you want consistent project metadata across those calls.

## Human approval gate

This change is approved because it makes **API-key ledger tenant** and optional project metadata explicit and consistent across evidence submission and compliance checking. It does not bypass evidence validation or authorization.
