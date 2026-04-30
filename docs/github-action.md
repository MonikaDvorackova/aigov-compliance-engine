# GitHub Actions: GovAI compliance gate

This repository includes a reusable **composite GitHub Action** that installs the GovAI CLI from **PyPI** (`aigov-py==0.1.1`) and runs `govai check` as a CI gate.

`govai check` calls the GovAI audit service `GET /compliance-summary` for a run id and:

- prints the compliance verdict (`VALID`, `INVALID`, or `BLOCKED`)
- exits **0 only when the verdict is `VALID`**

That means your workflow **fails CI unless the verdict is `VALID`**.

Configure branch protection so this job is a **required check** before merging to `main`.

## What the action does

- Sets up **Python 3.11**
- Installs **`aigov-py==0.1.1`** from PyPI (provides the `govai` CLI)
- Runs `govai check --run-id <run_id>` with your GovAI audit base URL and API key
- Fails the job if the verdict is not `VALID` (non-zero exit code)

## Official action reference

Use the GovAI GitHub Action (pin a semver tag such as `@v1`):

`Kovali/GovAI@v1`

## Action inputs

- **`run_id`** (required): **GovAI evidence run id** — the same string you use as `run_id` when posting events to `POST /evidence`, in `govai check`, and in `govai export-run`. This is **not** GitHub’s numeric `github.run_id`; store your UUID (or other server-accepted id) in a repository variable such as `GOVAI_RUN_ID` and pass it here.
- **`base_url`** (required): GovAI audit service base URL (e.g. `https://govai.example.com`). Maps to env `GOVAI_AUDIT_BASE_URL` for the CLI.
- **`api_key`** (required): GovAI API key (Bearer token). Maps to env `GOVAI_API_KEY` for the CLI.
- **`project`** (optional, default: `github-actions`): Tenant/project context sent as `X-GovAI-Project` by the CLI. Set this if your hosted GovAI admin provided a specific project identifier.

## Required repository variables / secrets

Configure in **Settings → Secrets and variables → Actions**:

| Name | Type | Required | Purpose |
|------|------|----------|---------|
| `GOVAI_AUDIT_BASE_URL` | Variable | Yes | Base URL of the GovAI audit API |
| `GOVAI_RUN_ID` | Variable | No* | Optional fallback run id (recommended only for **manual debugging**, not PR/push checks) |
| `GOVAI_API_KEY` | Secret | Yes (for the customer-facing CI gate) | Bearer token for the audit API |

\*Preferred: supply `run_id` from another step/job output (`UPSTREAM_GOVAI_RUN_ID`) or (for standalone checks) generate a fresh run id in the workflow and initialize it via `POST /evidence` before calling `govai check`.

Use **one** `GOVAI_RUN_ID` value for the whole release pipeline: every `POST /evidence` for that deployment, the `govai check` step, and `govai export-run` must refer to the **same** id.

## Fail-fast behavior (strict gate)

The repository’s customer-facing workflow gate (`.github/workflows/govai-check.yml`) is **strict**:

- If any of these are missing, the job **fails immediately** (non-zero exit code):
  - `GOVAI_AUDIT_BASE_URL`
  - `GOVAI_API_KEY`
- For PR/push usage, the workflow is **self-contained**: it generates a fresh `run_id` (unless an upstream run id is provided) and posts a minimal evidence event before running `govai check`.
- The job still fails unless the verdict is `VALID` — with minimal evidence only, the expected outcome is typically `BLOCKED` rather than `RUN_NOT_FOUND`.
- This is intentional so a misconfigured gate cannot “skip green” and accidentally allow merges.

The composite action is intentionally strict: missing `base_url`, `run_id`, or `api_key` fails immediately so a misconfigured gate cannot “skip green”.

## Minimal copy-paste workflow

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

      - name: GovAI compliance check
        uses: Kovali/GovAI@v1
        with:
          run_id: ${{ vars.GOVAI_RUN_ID }}
          base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
          api_key: ${{ secrets.GOVAI_API_KEY }}
```

## Example misconfiguration failure output

If the gate is enabled but not configured, you’ll see errors like:

```text
::error::Missing required input: api_key (set GOVAI_API_KEY as a GitHub Actions secret and pass it to the action)
```

## Example BLOCKED failure output (not eligible for promotion)

When the backend returns `BLOCKED`, the job fails (strict gate) and prints the verdict as a **compliance verdict** (not a fetch/connectivity failure). `BLOCKED` can happen due to missing required evidence and/or unmet approval/promotion prerequisites (in that case `missing_evidence` can be `[]`; see `blocked_reasons`):

```text
BLOCKED
blocked_reasons:
  - awaiting_approval_or_promotion: Run is not yet promotable: approval/promotion prerequisites are not satisfied.
::error::GovAI verdict: BLOCKED
::error::Run is not eligible for promotion yet — see missing_evidence and blocked_reasons in the govai check output above.
```

Note: a run can be `BLOCKED` even if all required evidence is present (`missing_evidence: []`). In that case, the backend is enforcing an approval/promotion prerequisite and explains it via `blocked_reasons`. See `docs/examples/audit_export_v1.example.json`.

## Local usage in this repository

Internal repository example (for developing GovAI itself). Marketplace users should use `Kovali/GovAI@v1`:

```yaml
- name: GovAI compliance check
  uses: ./.github/actions/govai-check
  with:
    run_id: ${{ vars.GOVAI_RUN_ID }}
    base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
    api_key: ${{ secrets.GOVAI_API_KEY }}
```

## CLI install (without the composite action)

```bash
python -m pip install --upgrade pip
python -m pip install "aigov-py==0.1.1"
govai check --run-id "$GOVAI_RUN_ID"
```

See also: [customer-quickstart.md](customer-quickstart.md).
