# GovAI Private Pilot Onboarding

One-page guide for engineering or compliance teams joining the GovAI private pilot.

---

## What you get

- CI compliance gate for **one** AI system or pipeline you scope with the pilot team
- A single deterministic decision per run: **VALID**, **INVALID**, or **BLOCKED**
- **Audit evidence export** (machine-readable JSON) for the same run
- **GitHub Action** integration (composite action installs the official PyPI CLI and runs `govai check`)
- **Onboarding support** during the pilot (scoping, configuration, and feedback)

GovAI is **not** legal certification, does **not** replace legal or compliance review, and does **not** guarantee full coverage of your obligations.

---

## What you need before starting

- **Python 3.11+** where you install the CLI or run helper scripts
- A **GitHub repository** with CI (or another CI system, if you wire the same steps there)
- **GovAI audit endpoint base URL** — set as environment variable **`GOVAI_AUDIT_BASE_URL`** (provided by the pilot; hosted or self-hosted)
- **Optional API key** — set as **`GOVAI_API_KEY`** if your endpoint requires Bearer authentication
- **One stable run identifier** — **`GOVAI_RUN_ID`** — shared across evidence submission, `govai check`, and export for that release or test run

---

## Install the CLI

From PyPI only:

```bash
python -m pip install --upgrade pip
python -m pip install "aigov-py==0.1.0"
govai --help
```

Set `GOVAI_AUDIT_BASE_URL` (and `GOVAI_API_KEY` if required) in the same shell or CI job before running `govai` commands.

---

## Understand `GOVAI_RUN_ID`

- **`GOVAI_RUN_ID` identifies one evidence run** in the audit service: all events for that run share this string.
- Use the **same** value for:
  - submitting evidence (`POST /evidence` payloads include this `run_id`)
  - running **`govai check`**
  - running **`govai export-run`**
- **Do not** assume GitHub’s workflow **`github.run_id`** is your GovAI run id unless your integration explicitly maps it to the id the audit service expects. They are different concepts unless you deliberately bridge them.
- **Practical choices:**
  - **Commit SHA** for CI runs (stable for that build), or  
  - A **UUID** for manual or ad hoc tests

Example (generate a UUID for a local or one-off run):

```bash
export GOVAI_RUN_ID="$(python - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
```

---

## Add the GitHub Action

Official composite action (pin a semver tag such as `@v1`):

`MonikaDvorackova/aigov-compliance-engine/.github/actions/govai-check@v1`

Details and inputs: [github-action.md](github-action.md).

**Important:** Whatever step submits evidence for the run must use the **same** `GOVAI_RUN_ID` as the check step, and evidence submission for that run should complete **before** `govai check` runs (same workflow job or an earlier job that this job needs).

Minimal workflow pattern:

```yaml
name: GovAI compliance gate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  govai-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Option A: fixed pilot run id in repo variables
      # Option B: derive per commit, e.g. run_id: ${{ github.sha }} (must match evidence submission)

      - name: GovAI compliance check
        uses: MonikaDvorackova/aigov-compliance-engine/.github/actions/govai-check@v1
        with:
          run_id: ${{ vars.GOVAI_RUN_ID }}
          base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}
          api_key: ${{ secrets.GOVAI_API_KEY }}
```

Configure **Settings → Secrets and variables → Actions**:

- `GOVAI_AUDIT_BASE_URL` — **variable** (required)
- `GOVAI_RUN_ID` — **variable** if you pass a fixed id (or supply `run_id` from another step output)
- `GOVAI_API_KEY` — **secret** only if your audit API enforces auth

Omit or leave empty `api_key` if your pilot endpoint does not require a key.

---

## Interpret verdicts

| Verdict | Meaning | CI |
|--------|---------|-----|
| **VALID** | Evidence is complete enough for the **configured policy** on the audit service. | May continue (exit 0 for `govai check`). |
| **INVALID** | Evidence was evaluated and **failed** the policy (e.g. failed evaluation or disallowed state). | Must stop; fix evidence or policy scope with the pilot team. |
| **BLOCKED** | Evidence is **missing**, incomplete, unavailable, or **approval / promotion** requirements are not satisfied. | Must stop; submit or fix evidence, then re-run. |

---

## Export audit evidence

With `GOVAI_AUDIT_BASE_URL` and `GOVAI_API_KEY` set if needed:

```bash
govai export-run --run-id "$GOVAI_RUN_ID" > govai-evidence.json
```

You can attach `govai-evidence.json` to internal review, an audit package, or pilot feedback. The file is **operational evidence** from GovAI; it is **not** a legal certification.

---

## Minimal troubleshooting

| Symptom | Likely cause | Next action |
|--------|----------------|-------------|
| **`govai`: command not found** | CLI not installed or the Python **scripts** directory is not on `PATH`. | Re-run `python -m pip install "aigov-py==0.1.0"`; activate the intended venv; ensure the same Python’s `bin` (or `Scripts` on Windows) is on `PATH`; in CI, use the composite action or invoke the installed `govai` from the same job’s Python environment. |
| **Connection / URL errors** | **`GOVAI_AUDIT_BASE_URL`** missing, wrong, or unreachable from CI. | Set the exact base URL provided for the pilot; no trailing slash issues—use the form your onboarding contact specifies; check firewall / allowlists. |
| **Wrong run / empty export** | **`GOVAI_RUN_ID`** missing or **different** between submit, check, and export. | Use one id end-to-end; re-read [Understand `GOVAI_RUN_ID`](#understand-govai_run_id). |
| **`BLOCKED` verdict** | Required events not present or ordering / prerequisites not met. | Inspect compliance summary payload from the audit API or pilot dashboard; add missing evidence with the same `GOVAI_RUN_ID`. |
| **401 / unauthorized** | Missing, wrong, or expired **`GOVAI_API_KEY`**. | Store the key as a secret; ensure the job exports it to the env the CLI reads; confirm project header requirements with your pilot contact if applicable. |

---

## Pilot success criteria

During the pilot, success means:

- GovAI runs in **your** CI on the agreed branch or release path  
- **One** scoped AI system or pipeline is covered end-to-end  
- **Failed or incomplete evidence blocks release** (non-`VALID` verdict fails the gate)  
- You produce at least one **`govai export-run`** artifact for a real run  
- Your team can **explain** what **VALID**, **INVALID**, and **BLOCKED** mean for your policy

For deeper product and API reference, see the [documentation index](index.md).
