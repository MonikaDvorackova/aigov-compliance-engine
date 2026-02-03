from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

import requests

from .events import emit_event


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_str(name: str, default: str) -> str:
    v = os.getenv(name)
    return v.strip() if v is not None and v.strip() else default


def _env_float(name: str, default: float) -> float:
    v = os.getenv(name)
    if v is None or not v.strip():
        return default
    try:
        return float(v.strip())
    except ValueError:
        raise SystemExit(f"{name} must be a number, got {v!r}")


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    actor = _env_str("AIGOV_ACTOR", "monika")
    system = _env_str("AIGOV_SYSTEM", "aigov_poc")

    metric = _env_str("AIGOV_EVAL_METRIC", "accuracy")
    value = _env_float("AIGOV_EVAL_VALUE", 0.90)
    threshold = _env_float("AIGOV_EVAL_THRESHOLD", 0.80)

    passed_default = value >= threshold
    passed = _env_bool("AIGOV_EVAL_PASSED", passed_default)

    ts = _utc_now_iso()

    # Always unique to prevent accidental duplicates from repeated CLI calls
    attempt_id = str(uuid.uuid4())
    event_id = f"evaluation_{run_id}_{attempt_id}"

    endpoint = _env_str("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088").rstrip("/")
    url = f"{endpoint}/evidence"

    remote_event: Dict[str, Any] = {
        "event_id": event_id,
        "event_type": "evaluation_reported",
        "ts_utc": ts,
        "actor": actor,
        "system": system,
        "run_id": run_id,
        "payload": {
            "metric": metric,
            "value": float(value),
            "threshold": float(threshold),
            "passed": bool(passed),
            "evaluation_attempt_id": attempt_id,
        },
    }

    emit_event(
        run_id,
        "evaluation_reported",
        actor=actor,
        payload={
            "ts_utc": ts,
            "system": system,
            "metric": metric,
            "value": float(value),
            "threshold": float(threshold),
            "passed": bool(passed),
            "evaluation_attempt_id": attempt_id,
            "remote_event_id": event_id,
        },
    )

    r = requests.post(url, json=remote_event, timeout=10)
    print(r.text)

    if r.status_code < 200 or r.status_code >= 300:
        print(f"ERROR remote returned status={r.status_code}")
        raise SystemExit(1)

    ok = True
    try:
        parsed = json.loads(r.text)
        if isinstance(parsed, dict):
            ok = bool(parsed.get("ok", True))
    except Exception:
        ok = True

    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
