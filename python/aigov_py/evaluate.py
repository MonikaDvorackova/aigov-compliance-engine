from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
<<<<<<< HEAD
from typing import Any, Dict
=======
from typing import Any, Dict, Optional
>>>>>>> origin/main

import requests

from .events import emit_event


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


<<<<<<< HEAD
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
=======
def _eid(prefix: str, run_id: str) -> str:
    return f"{prefix}_{run_id}_{uuid.uuid4()}"


def _env_float(name: str) -> Optional[float]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return None
    try:
        return float(raw)
    except ValueError as e:
        raise SystemExit(f"{name} must be a number, got: {raw!r}") from e


def main() -> None:
    run_id = (os.environ.get("RUN_ID") or "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    actor = (os.getenv("AIGOV_ACTOR", "monika") or "monika").strip() or "monika"
    system = (os.getenv("AIGOV_SYSTEM", "aigov_poc") or "aigov_poc").strip() or "aigov_poc"

    endpoint = (os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088") or "").rstrip("/")
    url = f"{endpoint}/evidence"

    metric = (os.getenv("AIGOV_EVAL_METRIC", "f1") or "f1").strip() or "f1"
    value = _env_float("AIGOV_EVAL_VALUE")
    threshold = _env_float("AIGOV_EVAL_THRESHOLD")

    if value is None:
        raise SystemExit("AIGOV_EVAL_VALUE is required (e.g. 0.88)")
    if threshold is None:
        raise SystemExit("AIGOV_EVAL_THRESHOLD is required (e.g. 0.85)")

    passed = value >= threshold
    ts = _utc_now_iso()

    remote_event_id = _eid("eval", run_id)

    remote_event: Dict[str, Any] = {
        "event_id": remote_event_id,
>>>>>>> origin/main
        "event_type": "evaluation_reported",
        "ts_utc": ts,
        "actor": actor,
        "system": system,
        "run_id": run_id,
        "payload": {
<<<<<<< HEAD
            "metric": metric,
            "value": float(value),
            "threshold": float(threshold),
            "passed": bool(passed),
            "evaluation_attempt_id": attempt_id,
=======
            "evaluation_attempt_id": str(uuid.uuid4()),
            "metric": metric,
            "value": value,
            "threshold": threshold,
            "passed": passed,
            "remote_event_id": f"evaluation_{run_id}_{remote_event_id}",
>>>>>>> origin/main
        },
    }

    emit_event(
<<<<<<< HEAD
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
=======
        run_id=run_id,
        event_type="evaluation_started",
        actor=actor,
        payload={"ts_utc": ts, "remote_event_id": remote_event_id, "metric": metric},
        system=system,
        event_id=_eid("evaluation_started", run_id),
    )

    try:
        r = requests.post(url, json=remote_event, timeout=10)
        resp_text = r.text
        status_code = r.status_code
    except Exception as e:
        emit_event(
            run_id=run_id,
            event_type="evaluation_failed",
            actor=actor,
            payload={"ts_utc": ts, "remote_event_id": remote_event_id, "error": str(e)},
            system=system,
            event_id=_eid("evaluation_failed", run_id),
        )
        raise

    emit_event(
        run_id=run_id,
        event_type="evaluation_reported",
        actor=actor,
        payload={
            "ts_utc": ts,
            "remote_event_id": remote_event_id,
            "http_status": status_code,
            "response_text": resp_text,
            "metric": metric,
            "value": value,
            "threshold": threshold,
            "passed": passed,
        },
        system=system,
        event_id=_eid("evaluation_reported", run_id),
    )

    print(resp_text)

    ok = False
    try:
        parsed = json.loads(resp_text)
        if isinstance(parsed, dict):
            ok = bool(parsed.get("ok", False))
    except json.JSONDecodeError:
        ok = 200 <= status_code < 300
>>>>>>> origin/main

    if not ok:
        raise SystemExit(1)

<<<<<<< HEAD
=======
    # Optional: fail locally if the metric didn't pass (keeps CLI semantics strict)
    if not passed:
        raise SystemExit(2)

>>>>>>> origin/main

if __name__ == "__main__":
    main()
