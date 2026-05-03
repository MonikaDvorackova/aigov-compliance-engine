## Customer quickstart (legacy)

This document is kept for backwards compatibility.

For the canonical hosted onboarding flow, start here:

- [customer-onboarding-10min.md](customer-onboarding-10min.md)

## What is GovAI

GovAI is a CI gate that returns a compliance verdict for a given **GovAI evidence run id** (`GOVAI_RUN_ID`). Your pipeline submits audit evidence events with that id, then CI calls `govai check` with the **same** id and blocks merges or deploys unless the verdict is `VALID`.

Use **one** value for `GOVAI_RUN_ID` end-to-end: evidence submission → `govai check` → `govai export-run`.

## Prerequisites

- Python 3.10+
- `GOVAI_AUDIT_BASE_URL` — base URL of your GovAI audit service
- Optional: `GOVAI_API_KEY` if your endpoint requires a Bearer token

Install pin **must** match `version` in **`python/pyproject.toml`** for the release you use.

**Ledger tenant:** which ledger you read/write is determined **only** by your API key (`GOVAI_API_KEYS_JSON` on the server). The optional **`X-GovAI-Project`** header (and `govai --project`) is **metadata** for usage labels — it does **not** isolate ledger data.

**Stripe billing (hosted operators):** the same ledger tenant id is used as **`client_reference_id`** / subscription **metadata** for Checkout and webhooks. See [billing.md](billing.md) for Checkout (`POST /billing/checkout-session`), status (`GET /billing/status`), usage reporting (`POST /billing/report-usage`), webhooks, and optional **`GOVAI_BILLING_ENFORCEMENT`**.

## Step-by-step integration

### Step 1: Install CLI

```bash
python -m pip install --upgrade pip
python -m pip install "aigov-py==0.2.1"
govai --help >/dev/null && echo "GovAI CLI OK"
```

### Step 2: Configure endpoint

```bash
export GOVAI_AUDIT_BASE_URL="https://YOUR_GOVAI_AUDIT_SERVICE"
```

If your endpoint requires an API key:

```bash
export GOVAI_API_KEY="YOUR_API_KEY"
```

### Step 3: Create GOVAI_RUN_ID

Use a new UUID for each logical deployment or audit run (copy/paste):

```bash
export GOVAI_RUN_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
echo "$GOVAI_RUN_ID"
```

Some teams pin `GOVAI_RUN_ID` to a stable pipeline identifier (for example `github.sha`) **only if** the same string is used for every evidence event and checks for that release; it must match whatever your audit API accepts as `run_id`.

### Step 4: Submit minimal audit event

Submit one minimal `data_registered` event (expected to be insufficient for `VALID`):

```bash
export EVENT_ID="evt_${GOVAI_RUN_ID}"

curl -sS "$GOVAI_AUDIT_BASE_URL/evidence" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $GOVAI_API_KEY" \
  -d "$(python3 - <<'PY'
import json, os
from datetime import datetime, timezone

run_id = os.environ["GOVAI_RUN_ID"]
event_id = os.environ["EVENT_ID"]
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

print(json.dumps({
  "event_id": event_id,
  "event_type": "data_registered",
  "ts_utc": now,
  "actor": "ci",
  "system": "quickstart",
  "run_id": run_id,
  "payload": {
    "ai_system_id": "example-ai",
    "dataset_id": "example_dataset_v1",
    "dataset": "example_dataset",
    "dataset_version": "v1",
    "dataset_fingerprint": "sha256:example",
    "dataset_governance_id": "gov_example_v1",
    "dataset_governance_commitment": "basic_compliance",
    "source": "internal",
    "intended_use": "example",
    "limitations": "quickstart",
    "quality_summary": "quickstart",
    "governance_status": "registered"
  }
}))
PY
)"
```

If your endpoint does not require an API key, remove the authorization header.

### Step 5: Run govai check

```bash
govai check --run-id "$GOVAI_RUN_ID"
```

Expected stdout and exit codes (the **first line** is always the verdict; additional lines may explain `missing_evidence` and/or `blocked_reasons`):

| Verdict | Meaning | Exit code |
|---------|---------|-----------|
| `VALID` | Required evidence satisfied; deploy allowed | `0` |
| `INVALID` | **Evaluation explicitly failed** (server `evaluation_passed == false`) | `2` |
| `BLOCKED` | Missing required evidence **or** missing approval/risk/promotion prerequisites **or** other “not yet eligible” gates | `3` |

After only the single minimal event above, you will usually see:

```text
BLOCKED
```

When your pipeline has submitted all required evidence for the **same** `GOVAI_RUN_ID`, you should see:

```text
VALID
```

`INVALID` appears when the server records an explicit evaluation failure. `BLOCKED` covers missing evidence and “not yet approved / not yet promoted” states (see `blocked_reasons` / `missing_evidence` on `GET /compliance-summary`).

Billing / usage trace APIs: **[billing.md](billing.md)**.

### Step 6: Export evidence

```bash
govai export-run --run-id "$GOVAI_RUN_ID" > "govai-export-${GOVAI_RUN_ID}.json"
```

Output: one JSON file with the run decision and hashes.

## Expected results

- `govai --help` runs without error (CLI installed)
- `curl .../evidence` returns HTTP 200 with a JSON body (event accepted)
- `govai check --run-id "$GOVAI_RUN_ID"` prints `VALID`, `INVALID`, or `BLOCKED` and exits `0` only for `VALID`
- `govai export-run ...` produces a JSON file you can archive as CI evidence

## Troubleshooting

- **`govai: command not found`**
  - Re-run `python -m pip install "aigov-py==0.2.1"` and ensure the directory shown by `python3 -m site --user-base`/bin is on `PATH`, or use `python3 -m pip install --user "aigov-py==0.2.1"`.

- **Network errors (timeout / connection refused / DNS failure)**
  - Verify `GOVAI_AUDIT_BASE_URL` is correct and reachable from your network or CI runner.

- **HTTP 401/403 on `POST /evidence` or on `govai check`**
  - Set `GOVAI_API_KEY` correctly, or ask your GovAI admin for a valid key.

- **`govai check` prints `BLOCKED`**
  - The run is not eligible for promotion yet. Either required evidence is missing **or** approval/promotion prerequisites are not satisfied. Submit the missing prerequisite events for the **same** `GOVAI_RUN_ID`, then re-run `govai check`.

- **`govai check` prints `VALID` locally but fails in CI**
  - Use the same `GOVAI_RUN_ID`, `GOVAI_AUDIT_BASE_URL`, and `GOVAI_API_KEY` in CI as in your local test.
