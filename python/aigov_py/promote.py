import json
import os
from datetime import datetime, timezone

import requests


def _eid(prefix: str, run_id: str) -> str:
    return f"{prefix}_{run_id}_{uuid.uuid4()}"


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

<<<<<<< Updated upstream
    ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    event = {
        "event_id": f"mp_after_approval_{run_id}",
=======
    actor = (os.getenv("AIGOV_ACTOR", "monika") or "monika").strip() or "monika"
    system = (os.getenv("AIGOV_SYSTEM", "aigov_poc") or "aigov_poc").strip() or "aigov_poc"

    ts = _utc_now_iso()

    # Remote (audit service) event id
    remote_event_id = _eid("mp", run_id)

    remote_event: Dict[str, Any] = {
        "event_id": remote_event_id,
>>>>>>> Stashed changes
        "event_type": "model_promoted",
        "ts_utc": ts,
        "actor": "monika",
        "system": "aigov_poc",
        "run_id": run_id,
        "payload": {
            "artifact_path": f"python/artifacts/model_{run_id}.joblib",
            "promotion_reason": "approved_by_human",
<<<<<<< Updated upstream
        },
    }

    r = requests.post("http://127.0.0.1:8088/evidence", json=event, timeout=10)
    print(r.text)
=======
            "promotion_attempt_id": remote_event_id,
        },
    }

    endpoint = (os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088") or "").rstrip("/")
    url = f"{endpoint}/evidence"

    # Local evidence log: promote_started
    emit_event(
        run_id=run_id,
        event_type="promote_started",
        actor=actor,
        payload={"ts_utc": ts, "remote_event_id": remote_event_id},
        system=system,
        event_id=_eid("promote_started", run_id),
    )

    try:
        r = requests.post(url, json=remote_event, timeout=10)
        resp_text = r.text
        status_code = r.status_code
    except Exception as e:
        emit_event(
            run_id=run_id,
            event_type="promote_failed",
            actor=actor,
            payload={"ts_utc": ts, "remote_event_id": remote_event_id, "error": str(e)},
            system=system,
            event_id=_eid("promote_failed", run_id),
        )
        raise

    # Local evidence log: model_promoted (record response)
    emit_event(
        run_id=run_id,
        event_type="model_promoted",
        actor=actor,
        payload={
            "ts_utc": ts,
            "remote_event_id": remote_event_id,
            "http_status": status_code,
            "response_text": resp_text,
        },
        system=system,
        event_id=_eid("model_promoted", run_id),
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
>>>>>>> Stashed changes


if __name__ == "__main__":
    main()
