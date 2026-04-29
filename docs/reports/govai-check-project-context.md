# GovAI check: project/tenant context consistency

## Goal

Ensure `POST /evidence` and `govai check` run under the **same**:

- `run_id` (evidence correlation key)
- tenant/project context (header `X-GovAI-Project`)

Target project context:

- `X-GovAI-Project: github-actions`

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

- `GET /compliance-summary` is performed under the same tenant/project context as `POST /evidence`.

## Notes

- The Rust audit API uses `X-GovAI-Project` as a first-class tenant scoping mechanism (recommended by server error hints).
- This change ensures the GitHub Action “initialize run with minimal evidence” step and the compliance gate query are scoped identically, avoiding `RUN_NOT_FOUND` from cross-tenant/project mismatches.


## Evaluation gate

`POST /evidence` and `govai check` must use the same `GOVAI_RUN_ID`, `GOVAI_AUDIT_BASE_URL`, `GOVAI_API_KEY`, and `X-GovAI-Project` context.

## Human approval gate

This change is approved because it makes tenant/project context explicit and consistent across evidence submission and compliance checking. It does not bypass evidence validation or authorization.
