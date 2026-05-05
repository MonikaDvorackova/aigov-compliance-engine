## Golden path (2 minutes): evidence pack → BLOCKED → VALID

Goal: exercise the **artifact-bound** workflow end-to-end using the **existing evidence-pack format**:

- `./artefacts/<run_id>.json` (JSON object with `events: [...]`)
- `./artefacts/evidence_digest_manifest.json` (written from `GET /bundle-hash`)

This guide is **local and deterministic**. It only works once your audit service is running and you have a valid `base_url` + `api_key`.

### Prereqs (local)

Start the audit service and configure an API key as in `docs/quickstart-5min.md`.

You need:

```bash
export GOVAI_AUDIT_BASE_URL="http://127.0.0.1:8088"
export GOVAI_API_KEY="YOUR_LOCAL_KEY"
```

If your audit service requires auth, missing/invalid `GOVAI_API_KEY` will cause **ERROR** (integration failure). This doc does not claim hosted success unless you provide a real hosted base URL + key.

### 0) Create a fresh run id and artifacts directory

```bash
export GOVAI_RUN_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"

mkdir -p artefacts
```

### 1) Generate a minimal (incomplete) evidence pack → expect `BLOCKED`

This pack uses the required envelope (`{ ok, run_id, events: [...] }`) and includes **only** `data_registered`.

```bash
python3 - <<'PY'
import json, os
from datetime import datetime, timezone

run_id = os.environ["GOVAI_RUN_ID"]
now = datetime(2020, 1, 1, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

bundle = {
  "ok": True,
  "run_id": run_id,
  "events": [
    {
      "event_id": f"gp_data_registered_{run_id}",
      "event_type": "data_registered",
      "ts_utc": now,
      "actor": "golden_path",
      "system": "golden_path",
      "run_id": run_id,
      "payload": {
        "ai_system_id": "expense-ai",
        "dataset_id": "expense_dataset_v1",
        "dataset": "customer_expense_records",
        "dataset_version": "v1",
        "dataset_fingerprint": "sha256:demo",
        "dataset_governance_id": "gov_expense_v1",
        "dataset_governance_commitment": "basic_compliance",
        "source": "internal",
        "intended_use": "golden path demo",
        "limitations": "demo only",
        "quality_summary": "demo only",
        "governance_status": "registered",
      },
    }
  ],
}

open(f"artefacts/{run_id}.json", "w", encoding="utf-8").write(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n")
print(f"wrote artefacts/{run_id}.json")
PY
```

### 2) Submit the pack, write digest manifest, verify → `BLOCKED`

```bash
govai submit-evidence-pack --path ./artefacts --run-id "$GOVAI_RUN_ID"

python -m aigov_py.write_digest_manifest \
  --run-id "$GOVAI_RUN_ID" \
  --audit-url "$GOVAI_AUDIT_BASE_URL" \
  --api-key "$GOVAI_API_KEY" \
  --out-dir ./artefacts

govai verify-evidence-pack --path ./artefacts --run-id "$GOVAI_RUN_ID"
```

Expected:

- `govai verify-evidence-pack` prints `BLOCKED` (and details), then the final **GovAI summary** block.

### 3) Extend the same evidence pack to a full valid sequence → expect `VALID`

Overwrite `artefacts/<run_id>.json` with a **complete** sequence for the same `run_id` (existing event types only).

```bash
python3 - <<'PY'
import json, os
from datetime import datetime, timezone

run_id = os.environ["GOVAI_RUN_ID"]
now = datetime(2020, 1, 1, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

ai_system_id = "expense-ai"
dataset_id = "expense_dataset_v1"
commitment = "basic_compliance"

model_version_id = f"mv_{run_id}"
assessment_id = f"asmt_{run_id}"
risk_id = f"risk_{run_id}"
human_event_id = f"gp_human_approved_{run_id}"
artifact_path = f"python/artifacts/model_{run_id}.joblib"

events = [
  {
    "event_id": f"gp_data_registered_{run_id}",
    "event_type": "data_registered",
    "ts_utc": now,
    "actor": "golden_path",
    "system": "golden_path",
    "run_id": run_id,
    "payload": {
      "ai_system_id": ai_system_id,
      "dataset_id": dataset_id,
      "dataset": "customer_expense_records",
      "dataset_version": "v1",
      "dataset_fingerprint": "sha256:demo",
      "dataset_governance_id": "gov_expense_v1",
      "dataset_governance_commitment": commitment,
      "source": "internal",
      "intended_use": "golden path demo",
      "limitations": "demo only",
      "quality_summary": "demo only",
      "governance_status": "registered",
    },
  },
  {
    "event_id": f"gp_model_trained_{run_id}",
    "event_type": "model_trained",
    "ts_utc": "2020-01-01T00:01:00Z",
    "actor": "golden_path",
    "system": "golden_path",
    "run_id": run_id,
    "payload": {
      "model_version_id": model_version_id,
      "ai_system_id": ai_system_id,
      "dataset_id": dataset_id,
      "model_type": "LogisticRegression",
      "artifact_path": artifact_path,
      "artifact_sha256": "golden_path_placeholder",
    },
  },
  {
    "event_id": f"gp_evaluation_reported_{run_id}",
    "event_type": "evaluation_reported",
    "ts_utc": "2020-01-01T00:02:00Z",
    "actor": "golden_path",
    "system": "golden_path",
    "run_id": run_id,
    "payload": {
      "ai_system_id": ai_system_id,
      "dataset_id": dataset_id,
      "model_version_id": model_version_id,
      "metric": "accuracy",
      "value": 0.95,
      "threshold": 0.8,
      "passed": True,
    },
  },
  {
    "event_id": f"gp_risk_recorded_{run_id}",
    "event_type": "risk_recorded",
    "ts_utc": "2020-01-01T00:03:00Z",
    "actor": "golden_path",
    "system": "golden_path",
    "run_id": run_id,
    "payload": {
      "assessment_id": assessment_id,
      "ai_system_id": ai_system_id,
      "dataset_id": dataset_id,
      "model_version_id": model_version_id,
      "risk_id": risk_id,
      "risk_class": "high",
      "severity": 4.0,
      "likelihood": 0.3,
      "status": "submitted",
      "mitigation": "Golden path: enforce passed evaluation + human approval before promotion.",
      "owner": "risk_owner",
      "dataset_governance_commitment": commitment,
    },
  },
  {
    "event_id": f"gp_risk_mitigated_{run_id}",
    "event_type": "risk_mitigated",
    "ts_utc": "2020-01-01T00:04:00Z",
    "actor": "golden_path",
    "system": "golden_path",
    "run_id": run_id,
    "payload": {
      "assessment_id": assessment_id,
      "ai_system_id": ai_system_id,
      "dataset_id": dataset_id,
      "model_version_id": model_version_id,
      "risk_id": risk_id,
      "status": "mitigated",
      "mitigation": "Golden path: mitigation applied.",
      "dataset_governance_commitment": commitment,
    },
  },
  {
    "event_id": f"gp_risk_reviewed_{run_id}",
    "event_type": "risk_reviewed",
    "ts_utc": "2020-01-01T00:05:00Z",
    "actor": "golden_path",
    "system": "golden_path",
    "run_id": run_id,
    "payload": {
      "assessment_id": assessment_id,
      "ai_system_id": ai_system_id,
      "dataset_id": dataset_id,
      "model_version_id": model_version_id,
      "risk_id": risk_id,
      "decision": "approve",
      "reviewer": "risk_officer",
      "justification": "Golden path: approve risk mitigation.",
      "dataset_governance_commitment": commitment,
    },
  },
  {
    "event_id": human_event_id,
    "event_type": "human_approved",
    "ts_utc": "2020-01-01T00:06:00Z",
    "actor": "golden_path",
    "system": "golden_path",
    "run_id": run_id,
    "payload": {
      "scope": "model_promoted",
      "decision": "approve",
      "approved": True,
      "approver": "compliance_officer",
      "justification": "Golden path: approval after evaluation + risk review.",
      "ai_system_id": ai_system_id,
      "dataset_id": dataset_id,
      "model_version_id": model_version_id,
      "assessment_id": assessment_id,
      "risk_id": risk_id,
      "dataset_governance_commitment": commitment,
    },
  },
  {
    "event_id": f"gp_model_promoted_{run_id}",
    "event_type": "model_promoted",
    "ts_utc": "2020-01-01T00:07:00Z",
    "actor": "golden_path",
    "system": "golden_path",
    "run_id": run_id,
    "payload": {
      "artifact_path": artifact_path,
      "promotion_reason": "approved_by_human",
      "ai_system_id": ai_system_id,
      "dataset_id": dataset_id,
      "model_version_id": model_version_id,
      "assessment_id": assessment_id,
      "risk_id": risk_id,
      "dataset_governance_commitment": commitment,
      "approved_human_event_id": human_event_id,
    },
  },
]

bundle = {"ok": True, "run_id": run_id, "events": events}
open(f"artefacts/{run_id}.json", "w", encoding="utf-8").write(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n")
print(f"wrote artefacts/{run_id}.json")
PY
```

Now replay the pack again, rewrite the digest manifest (digest changes when you add events), and verify:

```bash
govai submit-evidence-pack --path ./artefacts --run-id "$GOVAI_RUN_ID"

python -m aigov_py.write_digest_manifest \
  --run-id "$GOVAI_RUN_ID" \
  --audit-url "$GOVAI_AUDIT_BASE_URL" \
  --api-key "$GOVAI_API_KEY" \
  --out-dir ./artefacts

govai verify-evidence-pack --path ./artefacts --run-id "$GOVAI_RUN_ID"
```

Expected:

- `govai verify-evidence-pack` prints `VALID` (then the final **GovAI summary** block).

