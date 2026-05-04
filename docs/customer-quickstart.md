## Customer quickstart (legacy)

This document is kept for backwards compatibility.

For the canonical hosted onboarding flow, start here:

- [customer-onboarding-10min.md](customer-onboarding-10min.md)

## What is GovAI

GovAI is an **audit-backed decision service**: you append structured evidence for a `run_id`, and the hosted API returns a single authoritative verdict (`VALID` / `INVALID` / `BLOCKED`) from `GET /compliance-summary`. Runtime decision APIs are separate hardening work and are not advertised as available in this branch.

**CI** often calls `govai check` against the same `run_id` so merges or deploys fail unless the server verdict is `VALID` — that is one integration pattern, not the only way to use GovAI.

Use one value for `GOVAI_RUN_ID` end to end: evidence submission → decision readout (`check` and/or `decision evaluate`) → `govai export-run`.

**Billing:** if your operator enables Stripe on the hosted endpoint, see [billing.md](billing.md) for checkout, status, usage reporting, and enforcement.

## Prerequisites

- Python 3.10+
- GOVAI_AUDIT_BASE_URL — base URL of your GovAI audit service
- Optional: GOVAI_API_KEY if your endpoint requires a Bearer token

Install pin must match version in python/pyproject.toml for the release you use.

Ledger tenant: which ledger you read/write is determined only by your API key (GOVAI_API_KEYS_JSON on the server). The optional X-GovAI-Project header (and govai --project) is metadata for usage labels and does not isolate ledger data.

## Hosted billing (Stripe)

If you use a hosted GovAI audit endpoint with Stripe, see billing.md for:

- Checkout (POST /billing/checkout-session)
- Billing status (GET /billing/status)
- Usage reporting (POST /billing/report-usage)
- Billing portal (POST /billing/portal-session)
- Invoices (GET /billing/invoices)
- Reconciliation (GET /billing/reconciliation)
- Webhooks and enforcement behavior

Billing identity is always the ledger tenant derived from your API key, not X-GovAI-Project.

## Step by step integration

### Step 1: Install CLI

python -m pip install --upgrade pip
python -m pip install "aigov-py==0.2.1"
govai --help >/dev/null && echo "GovAI CLI OK"

### Step 2: Configure endpoint

export GOVAI_AUDIT_BASE_URL="https://YOUR_GOVAI_AUDIT_SERVICE"

If your endpoint requires an API key:

export GOVAI_API_KEY="YOUR_API_KEY"

### Step 3: Create GOVAI_RUN_ID

Use a new UUID for each logical deployment or audit run:

export GOVAI_RUN_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
echo "$GOVAI_RUN_ID"

### Step 4: Submit minimal audit event

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

If your endpoint does not require an API key, remove the authorization header.

### Step 5: Run govai check

govai check --run-id "$GOVAI_RUN_ID"

Expected stdout and exit codes:

VALID → exit 0  
INVALID → exit 2  
BLOCKED → exit 3  

After only the minimal event, you will usually see:

BLOCKED

When all required evidence is submitted:

VALID

### Step 6: Export evidence

govai export-run --run-id "$GOVAI_RUN_ID" > "govai-export-${GOVAI_RUN_ID}.json"

## Expected results

- CLI runs without error
- Evidence endpoint returns 200
- govai check returns a verdict
- export-run produces JSON

## Troubleshooting

govai command not found  
Reinstall CLI and ensure PATH is correct

401 or 403  
Check GOVAI_API_KEY

BLOCKED  
Missing evidence or approval

VALID locally but fails in CI  
Ensure same GOVAI_RUN_ID, API base URL, and API key