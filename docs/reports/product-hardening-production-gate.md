# Report: Product hardening — single production semantic path

Date: aligned with **`aigov-py` 0.2.1** CLI / composite action semantics.

---

## Evaluation gate

### What changed

- **GitHub marketplace-style composite (`action.yml` + `.github/actions/govai-check/action.yml`)** now installs **`aigov-py==0.2.1`** and runs **`submit-evidence-pack`** then **`verify-evidence-pack`** with a required **`artifacts_path`** (CI evidence artefacts + **`evidence_digest_manifest.json`**). **`govai check`** is no longer the default “green means compliant” behaviour for that integration.
- **`govai-check.yml`** was renamed to **`govai-smoke.yml`** and restricted to **`workflow_dispatch`** only: header states **SYNTHETIC SMOKE TEST ONLY**; no **`push`** / **`pull_request`** triggers on **`main`**, avoiding confusion with artefact-bound production CI.
- **`.github/workflows/compliance.yml`** waits on **`GET /ready`** (**200**) before posting evidence locally, replacing **`GET /health`** (liveness-only).
- **`python/aigov_py/cli_exit.py`**: **`EX_USAGE = 4`**; **`INVALID` (2)** and **`BLOCKED` (3)** are reserved for verdicts; **`USAGE`** captures argparse/missing-required-args for **`check`**, **`submit-evidence-pack`**, **`verify-evidence-pack`**.
- **`rust/src/govai_api.rs`**: **`GET /ready`** no longer echoes raw Postgres / migrate / ledger strings in JSON; responses use **`database not ready`** / **`migrations incomplete`** / **`ledger not ready`**; richer errors go to **`eprintln!`** server logs.

### Why the synthetic-only path was demoted from “default production”

A hosted API accepting a **scripted curl sequence** proves **existence** of *some* valid evidence chain for *some* `run_id`; it cannot prove **CI’s exported bundle** (**`\<run_id\>.json`**) matches what the ledger verifies under **`bundle-hash`**. **`events_content_sha256`** plus **`verify-evidence-pack`** closes that gap: **digest agreement is the cryptographic contract.**

---

## Human approval gate

### Why this makes the product trustworthy

- Operators and auditors can insist: **every release pipeline that turned green exposed concrete artefacts**, those artefacts were hashed at CI (**`events_content_sha256`** in **`evidence_digest_manifest.json`**), replayed (**`submit-evidence-pack`**), matched on the ledger (**`verify-evidence-pack`**), **and only then** surfaced **`VALID`**.
- **Smoke** remains available for onboarding and breakage detection but is **explicitly labelled** so it cannot be mistaken for an artefact-bound production gate.
