# GitHub Actions: GovAI artefact-bound compliance gate

This repository publishes a reusable **composite GitHub Action** that installs the GovAI CLI from **PyPI** (`aigov-py==0.2.0`) and runs the **production semantic path**:

1. `govai submit-evidence-pack` — replays CI-generated evidence events from `<artifacts_path>/<run_id>.json` to the hosted ledger.
2. `govai verify-evidence-pack` — **mandatory:** hosted **`GET /bundle-hash`** digest **`events_content_sha256`** matches **`evidence_digest_manifest.json`**. **Optional** unless **`--require-export`** (or action input **`require_export: true`**): cross-check **`GET /api/export/:run_id`** against that digest. **Then** a **`VALID`** compliance verdict from **`GET /compliance-summary`**.

A green job using **this action** therefore means CI artefacts were anchored by digest on the ledger and evaluated as **`VALID`** — **not** merely that the hosted API accepted an ad-hoc or synthetic submission.

**`govai check` alone** does **not** prove artefact continuity; treat it as a policy readout **without** cryptographic binding to CI outputs. Prefer **`submit-evidence-pack` + `verify-evidence-pack`** for anything that behaves as a release gate.

## Synthetic smoke workflow (explicitly labelled)

Manual workflow **`.github/workflows/govai-smoke.yml`** is labelled **SYNTHETIC SMOKE TEST ONLY**. It pushes scripted curls and optionally runs **`govai check`**; it runs **only** on **`workflow_dispatch`** — not automatically on merges to **`main`**. Use it for demos and connectivity probes, never as proof of artefact-bound production compliance.

Authoritative artefact-bound production gate for this repo: **`.github/workflows/compliance.yml`**, **`govai-compliance-gate`** (after **`evidence_pack`**).

## Configure branch protection so this job is required before merges

**Required (production):** require the **`.github/workflows/compliance.yml`** workflow and, specifically, a job that runs the same artefact-bound path as **`govai-compliance-gate`** (hosted **`submit-evidence-pack` + `verify-evidence-pack`** with real CI artefacts). You may also require the composite action from this repo with downloaded artefacts if that is your only hosted gate.

**Do not** treat the following as sufficient for production on their own:

- **`.github/workflows/govai-smoke.yml`** — manual **synthetic** smoke only (`workflow_dispatch`), not an artefact-bound merge gate.
- **`govai check`** (or a job that only runs **`check`**) — policy readout **without** cryptographic binding to CI **`evidence_digest_manifest.json`**.

Point required checks at the workflow/job that invokes **`submit-evidence-pack` + `verify-evidence-pack`** **with real CI artefacts**.

## Action behaviour

- Sets up **Python 3.11**
- Installs **`aigov-py==0.2.0`** from PyPI
- Validates **`artifacts_path`** is an existing directory
- Runs **`submit-evidence-pack`** then **`verify-evidence-pack`** with **`--path`** and **`--run-id`** (pass **`require_export: true`** to add **`--require-export`**)
- Exit codes propagated from **`verify-evidence-pack`**: **`1`** ERROR (infra/digest/export), **`2`** INVALID, **`3`** BLOCKED, **`4`** USAGE (`python/aigov_py/cli_exit.py`)

## Official action reference

Publish path (example):

`your-org/your-repo@<tag>` (root **`action.yml`**), or `./.github/actions/govai-check` for forks.

## Inputs

| Input | Required | Purpose |
|--------|----------|---------|
| **`run_id`** | Yes | Must match the ledger id and CI artefact names: **`docs/reports/<run_id>.md`**, **`<run_id>.json`**, and the digest manifest. Composite-action callers supply any id they control (UUID, product id, etc.). **This repo’s `compliance.yml`** emits **`basename-${{ github.run_id }}-${{ github.run_attempt }}`** for hosted runs (one **`docs/reports/<basename>.md`** per PR; CI copies it to **`docs/reports/<run_id>.md`** before **`make run`**) so workflow reruns do not reuse a stale hosted ledger row for the same basename. |
| **`artifacts_path`** | Yes | Directory containing **`evidence_digest_manifest.json`** and `<run_id>.json` (e.g. from **`actions/download-artifact`**). **`events_content_sha256`** in the manifest is the **source-of-truth** digest checked against **`GET /bundle-hash`**. |
| **`base_url`** | Yes | GovAI audit base URL (**`GOVAI_AUDIT_BASE_URL`**). |
| **`api_key`** | Yes | Bearer token (**`GOVAI_API_KEY`** secret). |
| **`project`** | No (default **`github-actions`**) | **`X-GovAI-Project`** header. |
| **`require_export`** | No (default **`false`**) | When **`true`**, passes **`--require-export`** so a missing or failed **`/api/export`** cross-check fails the step (exit **1**). |

## Required repository secrets / variables

- **`GOVAI_AUDIT_BASE_URL`** (repository variable recommended)
- **`GOVAI_API_KEY`** (secret)

## Minimal usage (caller supplies downloaded artefact dir)

```yaml
jobs:
  govai-hosted-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with:
          name: evidence_packs
          path: artefacts

      - name: Artefact-bound GovAI gate
        uses: Kovali/GovAI@v1
        with:
          run_id: ${{ vars.GOVAI_RUN_ID }}
          artifacts_path: artefacts
          base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
          api_key: ${{ secrets.GOVAI_API_KEY }}
```

## Example misconfiguration (**USAGE / exit 4**)

Missing **`artifacts_path`**, **`api_key`**, or missing directory → action exits **`4`** with **`::error::`** annotations.

## Verdict semantics

| CLI exit | Meaning |
|----------|---------|
| **0** | **`VERIFY_OK`**: digest continuity verified and verdict **`VALID`**. |
| **1** | Error: transport, manifest/bundle-hash mismatch, export inconsistency — not a verdict. |
| **2** | Verdict **`INVALID`**. |
| **3** | Verdict **`BLOCKED`**. |
| **4** | Usage/configuration (missing **`run_id`** / artefacts). |

**Operational probes:** **`GET /health`** (liveness) vs **`GET /ready`** (Postgres + migrations + ledger writable) — readiness belongs behind load balancers for safe traffic shifting.

## Local dev (this repo)

```yaml
- uses: ./.github/actions/govai-check
  with:
    run_id: ${{ needs.build.outputs.report_run_id }}
    artifacts_path: downloaded-artefacts-dir
    base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
    api_key: ${{ secrets.GOVAI_API_KEY }}
```

## CLI install (without composite action)

```bash
python -m pip install --upgrade pip
python -m pip install "aigov-py==0.2.0"
govai verify-evidence-pack --path ./artefacts --run-id "$GOVAI_RUN_ID"
```

See also: **[customer-quickstart.md](customer-quickstart.md)** (update install pin after release tagging).
