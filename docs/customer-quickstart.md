## What is GovAI

GovAI is a CI gate that returns a compliance verdict for a given `RUN_ID`. Your pipeline submits audit evidence events, then CI calls `govai check` and blocks merges/deploys unless the verdict is `VALID`.

## Prerequisites

- Python 3.10+
- Access to a GovAI audit service URL (export `GOVAI_AUDIT_BASE_URL`)
- Optional API key if your GovAI endpoint requires auth (set `GOVAI_API_KEY`)

## Step-by-step integration

### Step 1: Install CLI

```bash
pip install aigov-py
govai --version
```

### Step 2: Create RUN_ID

Reproducible UUID (copy/paste):

```bash
export RUN_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
echo "$RUN_ID"
```

### Step 3: Submit minimal audit event

Set your GovAI endpoint:

```bash
export GOVAI_AUDIT_BASE_URL="https://YOUR_GOVAI_AUDIT_SERVICE"
```

If your endpoint requires an API key:

```bash
export GOVAI_API_KEY="YOUR_API_KEY"
```

Submit one minimal `data_registered` event (expected to be insufficient for `VALID`):

```bash
export EVENT_ID="evt_${RUN_ID}"

curl -sS "$GOVAI_AUDIT_BASE_URL/evidence" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $GOVAI_API_KEY" \
  -d "$(python3 - <<'PY'
import json, os
from datetime import datetime, timezone

run_id = os.environ["RUN_ID"]
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

### Step 4: Run govai check

Run the compliance gate:

```bash
govai check --run-id "$RUN_ID"
```

Expected outputs:

- If you only submitted the single minimal event above, you should see:

```text
BLOCKED
```

- When your pipeline has submitted all required evidence for that same `RUN_ID`, you should see:

```text
VALID
```

Exit code: `VALID` → `0`; otherwise → non-zero.

### Step 5: Export evidence

Export a machine-readable JSON “evidence bundle” for a run:

```bash
govai export-run --run-id "$RUN_ID" > "govai-export-${RUN_ID}.json"
```

Output: one JSON file with the run decision and hashes.

## Expected results

- `govai --version` prints a version (CLI installed)
- `curl .../evidence` returns HTTP 200 with a JSON body (event accepted)
- `govai check --run-id "$RUN_ID"` prints either `BLOCKED` (missing prerequisites) or `VALID` (ready to deploy)
- `govai export-run ...` produces a JSON file you can archive as CI evidence

## Troubleshooting

- **`govai: command not found`**
  - Install again with `pip install aigov-py` and ensure your Python user bin directory is on `PATH` (or run via the same venv you installed into).

- **Network errors (timeout / connection refused / DNS failure)**
  - Verify `GOVAI_AUDIT_BASE_URL` is correct and reachable from CI.

- **HTTP 401/403 on `POST /evidence` or on `govai check`**
  - Your endpoint likely requires auth. Set `GOVAI_API_KEY` correctly, or ask your GovAI admin for a valid key.

- **`govai check` prints `BLOCKED`**
  - This run is missing required evidence. Confirm your pipeline is submitting all required events for the same `RUN_ID`, then re-run `govai check`.

- **`govai check` prints `VALID` locally but fails in CI**
  - Ensure CI uses the same `RUN_ID`, `GOVAI_AUDIT_BASE_URL`, and `GOVAI_API_KEY` as your local test.
