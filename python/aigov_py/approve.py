from __future__ import annotations

import json
import os
import uuid
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict


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


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _eid(prefix: str, run_id: str) -> str:
    return f"{prefix}_{run_id}_{uuid.uuid4()}"


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

<<<<<<< Updated upstream
    base = os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088").rstrip("/")
    url = f"{base}/evidence"

    # Always unique: prevents accidental duplicates from repeated CLI calls.
    event_id = f"ha_{uuid.uuid4()}"
=======
    actor = (os.getenv("AIGOV_ACTOR", "monika") or "monika").strip()
    system = (os.getenv("AIGOV_SYSTEM", "aigov_poc") or "aigov_poc").strip()

    base = (os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088") or "").rstrip("/")
    url = f"{base}/evidence"

    ts = _utc_now_iso()
>>>>>>> Stashed changes

    # Event id used for the remote (audit service) record
    remote_event_id = _eid("ha", run_id)

    remote_payload: Dict[str, Any] = {
        "event_id": remote_event_id,
        "event_type": "human_approved",
        "ts_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "actor": os.getenv("AIGOV_ACTOR", "monika"),
        "system": os.getenv("AIGOV_SYSTEM", "aigov_poc"),
        "run_id": run_id,
        "payload": {
            "scope": "model_promoted",
            "decision": "approve",
            "approver": "compliance_officer",
            "justification": "metrics meet threshold and dataset fingerprint verified",
        },
    }

<<<<<<< Updated upstream
    out = _post_json(url, payload)
    # Keep output stable for CI logs
=======
    # Local evidence log: approve_started
    emit_event(
        run_id=run_id,
        event_type="approve_started",
        actor=actor,
        payload={"ts_utc": ts, "remote_event_id": remote_event_id},
        system=system,
        event_id=_eid("approve_started", run_id),
    )

    try:
        out = _post_json(url, remote_payload)
    except Exception as e:
        emit_event(
            run_id=run_id,
            event_type="approve_failed",
            actor=actor,
            payload={"ts_utc": ts, "remote_event_id": remote_event_id, "error": str(e)},
            system=system,
            event_id=_eid("approve_failed", run_id),
        )
        raise

    # Local evidence log: human_approved (store request + response)
    emit_event(
        run_id=run_id,
        event_type="human_approved",
        actor=actor,
        payload={
            "ts_utc": ts,
            "remote_event_id": remote_event_id,
            "request": remote_payload,
            "response": out,
        },
        system=system,
        event_id=_eid("human_approved", run_id),
    )

>>>>>>> Stashed changes
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
