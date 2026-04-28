## Deterministic GovAI demo (teaching / sales / onboarding)

This repository includes **one deterministic demo scenario** that shows the core GovAI workflow end-to-end using the **hosted audit API over HTTP**.

### What the demo proves

- **Evidence gating**: submitting incomplete evidence produces a **BLOCKED** decision.
- **Actionable remediation**: the service returns **missing evidence** so you know exactly what to submit next.
- **Policy completion**: submitting required evidence changes the decision to **VALID**.
- **Audit portability**: the run can be exported as **machine-readable audit JSON**.

### Why it does not need local Postgres

The demo calls the hosted GovAI audit service via `GOVAI_AUDIT_BASE_URL`. If that hosted service is configured with its own database, **your local machine does not need Postgres**.

### Required environment variables

- `GOVAI_AUDIT_BASE_URL` — base URL of the hosted GovAI audit service
- `GOVAI_API_KEY` — bearer token used as the Authorization credential for the audit API

If either is missing, the demo exits with **code 2** and prints setup instructions.

### Run the demo

From repo root:

```bash
export GOVAI_AUDIT_BASE_URL="https://YOUR_GOVAI_AUDIT_SERVICE"
export GOVAI_API_KEY="YOUR_API_KEY"

python -m aigov_py.cli run demo-deterministic
```

### Expected output

```text
run_id: <uuid>
(2/7) submit incomplete evidence
(3/7) check decision (expect BLOCKED)
verdict: BLOCKED
(4/7) missing evidence:
- risk_reviewed
- human_approved
- model_promoted
(5/7) submit required evidence
(6/7) check decision (expect VALID)
verdict: VALID
(7/7) export audit JSON
exported: docs/demo/audit_export_<uuid>.json
```

### Outputs

- Audit export written to `docs/demo/audit_export_<run_id>.json` (directory is created if missing).

### Smoke test command (no network)

```bash
python -m pytest -q python/tests/test_demo_deterministic.py
```

## Deterministic demo scenario (teaching / sales / onboarding)

This repository includes a **single deterministic demo flow** that proves the core GovAI value proposition:

- **Incomplete evidence is rejected** (verdict becomes **BLOCKED**) with an explicit list of what’s missing.
- **Submitting the missing evidence unblocks the run**, producing verdict **VALID**.
- You can **export a machine-readable audit JSON** for the run to support audits, integrations, and governance reporting.

### What the demo proves

- **Policy-gated promotion**: the system will not return `VALID` until required governance events exist (risk lifecycle, human approval, promotion).
- **Actionable remediation**: the service tells you exactly which evidence items are missing (`missing_evidence`).
- **Portable artifacts**: the audit export is a deterministic JSON payload you can archive or ship downstream.

### Requirements

This demo is designed to work against a **hosted GovAI audit service** and **must not require local Postgres**.

You must set:

- `GOVAI_AUDIT_BASE_URL` — base URL of your hosted GovAI audit service
- `GOVAI_API_KEY` — bearer token for the audit API

### Run the demo

From repo root:

```bash
export GOVAI_AUDIT_BASE_URL="https://YOUR_GOVAI_AUDIT_SERVICE"
export GOVAI_API_KEY="YOUR_API_KEY"

python -m aigov_py.cli run demo-deterministic
```

### Outputs

- Console shows the exact sequence:
  - create run id
  - submit incomplete evidence
  - show `BLOCKED`
  - print missing evidence
  - submit required evidence
  - show `VALID`
  - export audit JSON
- Writes audit export to:
  - `docs/demo/audit_export_<run_id>.json`

### Smoke test

The repo includes a mock-based smoke test that validates the deterministic transcript and file output without making network calls:

```bash
pytest -q python/tests/test_demo_deterministic.py
```

