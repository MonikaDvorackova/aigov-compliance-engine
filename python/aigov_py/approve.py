from __future__ import annotations

import json
import os
import uuid
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict

from .events import emit_event


def _post_json(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    actor = os.getenv("AIGOV_ACTOR", "monika")
    system = os.getenv("AIGOV_SYSTEM", "aigov_poc")

    base = os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088").rstrip("/")
    url = f"{base}/evidence"

    ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    event_id = f"ha_{uuid.uuid4()}"

    payload: Dict[str, Any] = {
        "event_id": event_id,
        "event_type": "human_approved",
        "ts_utc": ts,
        "actor": actor,
        "system": system,
        "run_id": run_id,
        "payload": {
            "scope": "model_promoted",
            "decision": "approve",
            "approver": "compliance_officer",
            "justification": "metrics meet threshold and dataset fingerprint verified",
        },
    }

    emit_event(
        run_id,
        "approve_started",
        actor=actor,
        payload={"event_id": event_id, "ts_utc": ts, "system": system},
    )

    try:
        out = _post_json(url, payload)
    except Exception as e:
        emit_event(
            run_id,
            "approve_failed",
            actor=actor,
            payload={"event_id": event_id, "ts_utc": ts, "system": system, "error": str(e)},
        )
        raise

    emit_event(
        run_id,
        "human_approved",
        actor=actor,
        payload={
            "event_id": event_id,
            "ts_utc": ts,
            "system": system,
            "request": payload,
            "response": out,
        },
    )

    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
