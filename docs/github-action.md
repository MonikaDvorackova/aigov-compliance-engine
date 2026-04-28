# GitHub Actions: GovAI compliance gate

This repository includes a reusable **composite GitHub Action** that installs the GovAI CLI from **PyPI** (`aigov-py==0.1.0`) and runs `govai check` as a CI gate.

`govai check` calls the GovAI audit service `GET /compliance-summary` for a run id and:

- prints the compliance verdict (`VALID`, `INVALID`, or `BLOCKED`)
- exits **0 only when the verdict is `VALID`**

That means your workflow **fails CI unless the verdict is `VALID`**.

Configure branch protection so this job is a **required check** before merging to `main`.

## What the action does

- Sets up **Python 3.11**
- Installs **`aigov-py==0.1.0`** from PyPI (provides the `govai` CLI)
- Runs `govai check --run-id <run_id>` with your GovAI audit base URL and optional API key
- Fails the job if the verdict is not `VALID` (non-zero exit code)

## Official action reference

Use the GovAI GitHub Action (pin a semver tag such as `@v1`):

`Kovali/GovAI/.github/actions/govai-check@v1`

## Action inputs

- **`run_id`** (required): **GovAI evidence run id** — the same string you use as `run_id` when posting events to `POST /evidence`, in `govai check`, and in `govai export-run`. This is **not** GitHub’s numeric `github.run_id`; store your UUID (or other server-accepted id) in a repository variable such as `GOVAI_RUN_ID` and pass it here.
- **`base_url`** (required): GovAI audit service base URL (e.g. `https://govai.example.com`). Maps to env `GOVAI_AUDIT_BASE_URL` for the CLI.
- **`api_key`** (optional): GovAI API key (Bearer token). Maps to env `GOVAI_API_KEY` for the CLI.

## Required repository variables / secrets

Configure in **Settings → Secrets and variables → Actions**:

| Name | Type | Required | Purpose |
|------|------|----------|---------|
| `GOVAI_AUDIT_BASE_URL` | Variable | Yes | Base URL of the GovAI audit API |
| `GOVAI_RUN_ID` | Variable | Yes* | Evidence run id shared across evidence submission, `govai check`, and export |
| `GOVAI_API_KEY` | Secret | Yes (for the customer-facing CI gate) | Bearer token for the audit API |

\*Or supply `run_id` from another step/job output instead of `vars.GOVAI_RUN_ID`.

Use **one** `GOVAI_RUN_ID` value for the whole release pipeline: every `POST /evidence` for that deployment, the `govai check` step, and `govai export-run` must refer to the **same** id.

## Fail-fast behavior (customer-facing gate)

The repository’s customer-facing workflow gate (`.github/workflows/govai-check.yml`) is **strict**:

- If any of these are missing, the job **fails immediately** (non-zero exit code):
  - `GOVAI_AUDIT_BASE_URL`
  - `GOVAI_API_KEY`
  - `GOVAI_RUN_ID`
- This is intentional so a misconfigured gate cannot “skip green” and accidentally allow merges.

The **composite action** input `api_key` remains optional for teams running a demo / fork / unauthenticated audit API, but the primary customer gate workflow requires it.

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
        uses: Kovali/GovAI/.github/actions/govai-check@v1
        with:
          run_id: ${{ vars.GOVAI_RUN_ID }}
          base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
          api_key: ${{ secrets.GOVAI_API_KEY }}
```

## Example misconfiguration failure output

If the gate is enabled but not configured, you’ll see errors like:

```text
::error::Missing required configuration: GOVAI_API_KEY
::error::GovAI compliance gate cannot run because it must authenticate to the GovAI audit API to fetch the compliance verdict.
::error::Fix: Set repository Secret GOVAI_API_KEY (Settings → Secrets and variables → Actions → Secrets).
```

## Local usage in this repository

Reference the action from the same repo (omit `actions/checkout` only if you do not need your application sources):

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
python -m pip install "aigov-py==0.1.0"
govai check --run-id "$GOVAI_RUN_ID"
```

See also: [customer-quickstart.md](customer-quickstart.md).
