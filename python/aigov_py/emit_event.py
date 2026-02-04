from __future__ import annotations

import json
import os
import sys
<<<<<<< HEAD
=======
import uuid
>>>>>>> origin/main
from typing import Any, Dict, Optional

from .events import emit_event


def _parse_payload(s: Optional[str]) -> Dict[str, Any]:
    if not s:
        return {}
    try:
        x = json.loads(s)
    except json.JSONDecodeError as e:
        raise SystemExit(f"payload must be valid JSON: {e}") from e
    if not isinstance(x, dict):
        raise SystemExit("payload must be a JSON object")
    return x


<<<<<<< HEAD
def main(argv: list[str]) -> None:
    if len(argv) < 2:
        print("usage: python -m aigov_py.emit_event <event_type> [--run-id <RUN_ID>] [--actor <actor>] [--payload <json>]", file=sys.stderr)
=======
def _gen_event_id(run_id: str, event_type: str) -> str:
    return f"{event_type}_{run_id}_{uuid.uuid4()}"


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        print(
            "usage: python -m aigov_py.emit_event <event_type> "
            "[--run-id <RUN_ID>] [--actor <actor>] [--system <system>] "
            "[--event-id <event_id>] [--payload <json>]",
            file=sys.stderr,
        )
>>>>>>> origin/main
        raise SystemExit(2)

    event_type = argv[1]

<<<<<<< HEAD
    run_id = None
    actor = "system"
    payload_json = None
=======
    run_id: Optional[str] = None
    actor = "system"
    system = "aigov_cli"
    event_id: Optional[str] = None
    payload_json: Optional[str] = None
>>>>>>> origin/main

    i = 2
    while i < len(argv):
        a = argv[i]
        if a == "--run-id":
            i += 1
            run_id = argv[i] if i < len(argv) else None
        elif a == "--actor":
            i += 1
            actor = argv[i] if i < len(argv) else actor
<<<<<<< HEAD
=======
        elif a == "--system":
            i += 1
            system = argv[i] if i < len(argv) else system
        elif a == "--event-id":
            i += 1
            event_id = argv[i] if i < len(argv) else None
>>>>>>> origin/main
        elif a == "--payload":
            i += 1
            payload_json = argv[i] if i < len(argv) else None
        else:
            raise SystemExit(f"unknown argument: {a}")
        i += 1

<<<<<<< HEAD
    run_id_final = run_id or os.environ.get("RUN_ID")
=======
    run_id_final = (run_id or os.environ.get("RUN_ID") or "").strip()
>>>>>>> origin/main
    if not run_id_final:
        raise SystemExit("RUN_ID is required via --run-id or env RUN_ID")

    payload = _parse_payload(payload_json)

<<<<<<< HEAD
    ev = emit_event(run_id_final, event_type, actor=actor, payload=payload)
    print(f"event_id={ev['id']}")
    print(f"event_type={ev['type']}")
    print(f"event_ts={ev['ts']}")
=======
    event_id_final = (event_id or "").strip() or _gen_event_id(run_id_final, event_type)

    ev = emit_event(
        run_id=run_id_final,
        event_type=event_type,
        actor=actor,
        payload=payload,
        system=system,
        event_id=event_id_final,
    )

    print(f"event_id={ev['id']}")
    print(f"event_type={ev['type']}")
    print(f"event_ts={ev.get('ts_utc') or ev.get('ts')}")
>>>>>>> origin/main


if __name__ == "__main__":
    main(sys.argv)
