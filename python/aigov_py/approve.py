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
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _eid(prefix: str, run_id: str) -> str:
    return f"{prefix}_{run_id}_{uuid.uuid4()}"


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    actor = os.getenv("AIGOV_ACTOR", "monika")
    system = os.getenv("AIGOV_SYSTEM", "aigov_poc")

    endpoint = (os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088") or "").rstrip("/")
    url = f"{endpoint}/evidence"

    ts_utc = _utc_now_iso()
    remote_event_id = _eid("ha", run_id)

    event: Dict[str, Any] = {
        "event_id": remote_event_id,
        "event_type": "human_approved",
        "ts_utc": ts_utc,
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
        run_id=run_id,
        event_id=_eid("approve_started", run_id),
        event_type="approve_started",
        actor=actor,
        system=system,
        payload={"approval_attempt_id": remote_event_id},
        ts_utc=ts_utc,
    )

    try:
        out = _post_json(url, event)
    except Exception as e:
        emit_event(
            run_id=run_id,
            event_id=_eid("approve_failed", run_id),
            event_type="approve_failed",
            actor=actor,
            system=system,
            payload={"approval_attempt_id": remote_event_id, "error": str(e)},
            ts_utc=_utc_now_iso(),
        )
        raise

    emit_event(
        run_id=run_id,
        event_id=_eid("human_approved", run_id),
        event_type="human_approved",
        actor=actor,
        system=system,
        payload={"approval_attempt_id": remote_event_id, "request": event, "response": out},
        ts_utc=_utc_now_iso(),
    )

    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
