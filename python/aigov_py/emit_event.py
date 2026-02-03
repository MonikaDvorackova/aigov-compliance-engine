from __future__ import annotations

import json
import os
import sys
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


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        print("usage: python -m aigov_py.emit_event <event_type> [--run-id <RUN_ID>] [--actor <actor>] [--payload <json>]", file=sys.stderr)
        raise SystemExit(2)

    event_type = argv[1]

    run_id = None
    actor = "system"
    payload_json = None

    i = 2
    while i < len(argv):
        a = argv[i]
        if a == "--run-id":
            i += 1
            run_id = argv[i] if i < len(argv) else None
        elif a == "--actor":
            i += 1
            actor = argv[i] if i < len(argv) else actor
        elif a == "--payload":
            i += 1
            payload_json = argv[i] if i < len(argv) else None
        else:
            raise SystemExit(f"unknown argument: {a}")
        i += 1

    run_id_final = run_id or os.environ.get("RUN_ID")
    if not run_id_final:
        raise SystemExit("RUN_ID is required via --run-id or env RUN_ID")

    payload = _parse_payload(payload_json)

    ev = emit_event(run_id_final, event_type, actor=actor, payload=payload)
    print(f"event_id={ev['id']}")
    print(f"event_type={ev['type']}")
    print(f"event_ts={ev['ts']}")


if __name__ == "__main__":
    main(sys.argv)
