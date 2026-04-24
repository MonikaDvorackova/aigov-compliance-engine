# GitHub Actions: GovAI compliance gate

This repository includes a reusable **composite GitHub Action** that runs `govai check` as a CI gate.

`govai check` calls the GovAI audit service `GET /compliance-summary` for a `run_id` and:

- prints the compliance verdict (`VALID`, `INVALID`, or `BLOCKED`)
- exits **0 only when the verdict is `VALID`**

That means your workflow **fails CI unless the verdict is `VALID`**.

This should be used as a **required check** before merging to `main`.

## What the action does

- Sets up **Python 3.11**
- Installs the GovAI CLI from this action repository (`python/`, which provides `govai`)
- Runs `govai check <run_id>`
- Fails the job automatically if the verdict is not `VALID` (non-zero exit code)

## Action inputs

Action: `.github/actions/govai-check`

- **`run_id`** (required): GovAI run ID to check
- **`base_url`** (required): GovAI audit service base URL (e.g. `https://govai.example.com`)
- **`api_key`** (optional): GovAI API key (Bearer token)

## Required repository Variable / Secret

In customer CI, you typically configure these as GitHub repository settings:

- **Variable** `GOVAI_RUN_ID`: run identifier produced by your pipeline
- **Variable** `GOVAI_AUDIT_BASE_URL`: GovAI audit service base URL
- **Secret** `GOVAI_API_KEY` (optional): API key, if your GovAI audit service requires auth

## Minimal copy-paste workflow (customer usage)

When this action is published (example name below), use:

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
        uses: govai/check-action@v1
        with:
          run_id: ${{ vars.GOVAI_RUN_ID }}
          base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
          api_key: ${{ secrets.GOVAI_API_KEY }}

# Configure branch protection so this job is a required check
# before merging to main.
```

Important: this repository does **not** currently publish `aigov-py` to PyPI, so the action must install the CLI from the action repository contents. External usage therefore requires pinning to a Git ref (`@v1`, commit SHA, etc.) that includes the `python/` package directory.

## Local usage in this repo (before publishing)

Until the action is published, reference it from this repo directly:

```yaml
- name: GovAI compliance check
  uses: ./.github/actions/govai-check
  with:
    run_id: ${{ vars.GOVAI_RUN_ID }}
    base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
    api_key: ${{ secrets.GOVAI_API_KEY }}
```
