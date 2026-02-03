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


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    actor = os.getenv("AIGOV_ACTOR", "monika").strip() or "monika"
    system = os.getenv("AIGOV_SYSTEM", "aigov_poc").strip() or "aigov_poc"

    ts = _utc_now_iso()

    # Always unique to prevent accidental duplicates from repeated CLI calls
    event_id = f"mp_{run_id}_{uuid.uuid4()}"

    event: Dict[str, Any] = {
        "event_id": event_id,
        "event_type": "model_promoted",
        "ts_utc": ts,
        "actor": actor,
        "system": system,
        "run_id": run_id,
        "payload": {
            "artifact_path": f"python/artifacts/model_{run_id}.joblib",
            "promotion_reason": "approved_by_human",
            "promotion_attempt_id": event_id,
        },
    }

    endpoint = os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088").rstrip("/")
    url = f"{endpoint}/evidence"

    emit_event(
        run_id,
        "promote_started",
        actor=actor,
        payload={"ts_utc": ts, "system": system, "event_id": event_id},
    )

    try:
        r = requests.post(url, json=event, timeout=10)
        resp_text = r.text
        status_code = r.status_code
    except Exception as e:
        emit_event(
            run_id,
            "promote_failed",
            actor=actor,
            payload={"ts_utc": ts, "system": system, "event_id": event_id, "error": str(e)},
        )
        raise

    emit_event(
        run_id,
        "model_promoted",
        actor=actor,
        payload={
            "ts_utc": ts,
            "system": system,
            "event_id": event_id,
            "http_status": status_code,
            "response_text": resp_text,
        },
    )

    print(resp_text)

    ok = False
    try:
        parsed = json.loads(resp_text)
        if isinstance(parsed, dict):
            ok = bool(parsed.get("ok", False))
    except json.JSONDecodeError:
        ok = 200 <= status_code < 300

    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
