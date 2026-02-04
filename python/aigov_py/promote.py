from __future__ import annotations

import json
import os
import uuid
<<<<<<< HEAD
=======
import urllib.request
>>>>>>> origin/main
from datetime import datetime, timezone
from typing import Any, Dict

from .events import emit_event


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _eid(prefix: str, run_id: str) -> str:
    return f"{prefix}_{run_id}_{uuid.uuid4()}"


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

from .events import emit_event


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

<<<<<<< HEAD
    actor = os.getenv("AIGOV_ACTOR", "monika").strip() or "monika"
    system = os.getenv("AIGOV_SYSTEM", "aigov_poc").strip() or "aigov_poc"

    ts = _utc_now_iso()

    # Always unique to prevent accidental duplicates from repeated CLI calls
    event_id = f"mp_{run_id}_{uuid.uuid4()}"

    event: Dict[str, Any] = {
        "event_id": event_id,
        "event_type": "model_promoted",
        "ts_utc": ts,
=======
    actor = os.getenv("AIGOV_ACTOR", "monika")
    system = os.getenv("AIGOV_SYSTEM", "aigov_poc")

    endpoint = (os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088") or "").rstrip("/")
    url = f"{endpoint}/evidence"

    ts_utc = _utc_now_iso()
    remote_event_id = _eid("mp_after_approval", run_id)

    # Remote evidence event (audit service)
    event: Dict[str, Any] = {
        "event_id": remote_event_id,
        "event_type": "model_promoted",
        "ts_utc": ts_utc,
>>>>>>> origin/main
        "actor": actor,
        "system": system,
        "run_id": run_id,
        "payload": {
            "artifact_path": f"python/artifacts/model_{run_id}.joblib",
            "promotion_reason": "approved_by_human",
            "promotion_attempt_id": event_id,
        },
    }

<<<<<<< HEAD
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
=======
    # Local evidence log: promote_started
    emit_event(
        run_id=run_id,
        event_id=_eid("promote_started", run_id),
        event_type="promote_started",
        actor=actor,
        system=system,
        payload={"promotion_attempt_id": remote_event_id},
        ts_utc=ts_utc,
    )

    try:
        out = _post_json(url, event)
    except Exception as e:
        emit_event(
            run_id=run_id,
            event_id=_eid("promote_failed", run_id),
            event_type="promote_failed",
            actor=actor,
            system=system,
            payload={"promotion_attempt_id": remote_event_id, "error": str(e)},
            ts_utc=_utc_now_iso(),
        )
        raise

    # Local evidence log: model_promoted
    emit_event(
        run_id=run_id,
        event_id=_eid("model_promoted", run_id),
        event_type="model_promoted",
        actor=actor,
        system=system,
        payload={"promotion_attempt_id": remote_event_id, "request": event, "response": out},
        ts_utc=_utc_now_iso(),
    )

    print(json.dumps(out, ensure_ascii=False))
>>>>>>> origin/main


if __name__ == "__main__":
    main()
