from __future__ import annotations

import json
import os
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict

EVENTS_DIR = "docs/evidence"


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _event_path(run_id: str, event_id: str) -> str:
    return os.path.join(EVENTS_DIR, f"{run_id}__{event_id}.json")


def emit_event(
    *,
    run_id: str,
    event_type: str,
    actor: str,
    payload: Dict[str, Any],
    system: str,
    event_id: str,
) -> Dict[str, Any]:
    os.makedirs(EVENTS_DIR, exist_ok=True)

    ev = {
        "id": event_id,
        "run_id": run_id,
        "type": event_type,
        "actor": actor,
        "system": system,
        "payload": payload,
        "ts_utc": _now_utc(),
    }

    raw = json.dumps(ev, sort_keys=True, separators=(",", ":")).encode()
    sha = hashlib.sha256(raw).hexdigest()
    ev["sha256"] = sha

    path = _event_path(run_id, event_id)
    with open(path, "w") as f:
        json.dump(ev, f, indent=2)

    return ev
