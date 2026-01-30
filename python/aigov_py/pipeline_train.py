import json
import os
import uuid
from datetime import datetime, timezone

import requests
from joblib import dump
from sklearn.datasets import load_iris
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

AUDIT_URL = os.environ.get("AIGOV_AUDIT_URL", "http://127.0.0.1:8088")
SYSTEM = os.environ.get("AIGOV_SYSTEM", "aigov_poc")
ACTOR = os.environ.get("AIGOV_ACTOR", "monika")
THRESHOLD = float(os.environ.get("AIGOV_ACC_THRESHOLD", "0.8"))


def now_utc() -> str:
  return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def post_event(event: dict) -> dict:
  r = requests.post(f"{AUDIT_URL}/evidence", json=event, timeout=10)
  try:
    return r.json()
  except Exception:
    return {"ok": False, "error": f"non_json_response status={r.status_code}", "text": r.text}


def dataset_fingerprint_iris() -> str:
  iris = load_iris()
  payload = {
    "dataset": "iris",
    "n_rows": int(iris.data.shape[0]),
    "n_features": int(iris.data.shape[1]),
    "target_names": list(iris.target_names),
  }
  import hashlib

  h = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
  return h


def main() -> None:
  run_id = str(uuid.uuid4())

  res = post_event(
    {
      "event_id": str(uuid.uuid4()),
      "event_type": "run_started",
      "ts_utc": now_utc(),
      "actor": ACTOR,
      "system": SYSTEM,
      "run_id": run_id,
      "payload": {"purpose": "poc_train_pending_approval"},
    }
  )
  if not res.get("ok"):
    raise SystemExit(f"run_started failed: {res}")

  fp = dataset_fingerprint_iris()
  res = post_event(
    {
      "event_id": str(uuid.uuid4()),
      "event_type": "data_registered",
      "ts_utc": now_utc(),
      "actor": ACTOR,
      "system": SYSTEM,
      "run_id": run_id,
      "payload": {
        "dataset": "iris",
        "dataset_fingerprint": fp,
        "n_rows": 150,
        "n_features": 4,
        "target_names": ["setosa", "versicolor", "virginica"],
      },
    }
  )
  if not res.get("ok"):
    raise SystemExit(f"data_registered failed: {res}")

  iris = load_iris()
  X_train, X_test, y_train, y_test = train_test_split(
    iris.data, iris.target, test_size=0.2, random_state=42, stratify=iris.target
  )
  model = LogisticRegression(max_iter=200)
  model.fit(X_train, y_train)

  acc = float(model.score(X_test, y_test))
  passed = acc >= THRESHOLD

  res = post_event(
    {
      "event_id": str(uuid.uuid4()),
      "event_type": "model_trained",
      "ts_utc": now_utc(),
      "actor": ACTOR,
      "system": SYSTEM,
      "run_id": run_id,
      "payload": {
        "model_type": "LogisticRegression",
        "params": model.get_params(),
      },
    }
  )
  if not res.get("ok"):
    raise SystemExit(f"model_trained failed: {res}")

  res = post_event(
    {
      "event_id": str(uuid.uuid4()),
      "event_type": "evaluation_reported",
      "ts_utc": now_utc(),
      "actor": ACTOR,
      "system": SYSTEM,
      "run_id": run_id,
      "payload": {
        "metric": "accuracy",
        "value": acc,
        "threshold": THRESHOLD,
        "passed": passed,
      },
    }
  )
  if not res.get("ok"):
    raise SystemExit(f"evaluation_reported failed: {res}")

  os.makedirs("artifacts", exist_ok=True)

  artifact_path = f"python/artifacts/model_{run_id}.joblib"
  dump(model, os.path.join("artifacts", f"model_{run_id}.joblib"))

  print(f"done run_id={run_id} accuracy={acc} passed={passed}")
  print("")
  print("pending_human_approval")
  print("")
  print("approve (curl):")
  print(
    "curl -sS -X POST http://127.0.0.1:8088/evidence -H 'Content-Type: application/json' -d "
    + json.dumps(
      {
        "event_id": f"ha_{run_id}",
        "event_type": "human_approved",
        "ts_utc": now_utc(),
        "actor": ACTOR,
        "system": SYSTEM,
        "run_id": run_id,
        "payload": {
          "scope": "model_promoted",
          "decision": "approve",
          "approver": "compliance_officer",
          "justification": "metrics meet threshold and dataset fingerprint verified",
        },
      }
    )
  )
  print("")
  print("promote (curl):")
  print(
    "curl -sS -X POST http://127.0.0.1:8088/evidence -H 'Content-Type: application/json' -d "
    + json.dumps(
      {
        "event_id": f"mp_after_approval_{run_id}",
        "event_type": "model_promoted",
        "ts_utc": now_utc(),
        "actor": ACTOR,
        "system": SYSTEM,
        "run_id": run_id,
        "payload": {
          "artifact_path": artifact_path,
          "promotion_reason": "approved_by_human",
        },
      }
    )
  )
  print("")
  print("bundle:")
  print(f"make bundle RUN_ID={run_id}")


if __name__ == "__main__":
  main()
