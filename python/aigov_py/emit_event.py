from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from .events import emit_event


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _docs_dir() -> Path:
    return _repo_root() / "docs"


def _evidence_path(run_id: str) -> Path:
    return _docs_dir() / "evidence" / f"{run_id}.json"


def _parse_payload(s: Optional[str]) -> Dict[str, Any]:
    if not s:
        return {}
    try:
        obj = json.loads(s)
    except json.JSONDecodeError as e:
        raise SystemExit(f"payload must be valid JSON: {e}") from e
    if not isinstance(obj, dict):
        raise SystemExit("payload must be a JSON object")
    return obj


def _make_event_id(event_type: str, run_id: str) -> str:
    return f"{event_type}_{run_id}_{uuid.uuid4()}"


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(prog="python -m aigov_py.emit_event")
    p.add_argument("event_type", help="event type, e.g. human_approved, promoted")
    p.add_argument("--actor", default="system", help="actor id, e.g. human, system")
    p.add_argument("--payload", default="{}", help='JSON object string, e.g. \'{"k":"v"}\'')
    p.add_argument("--run-id", default=None, help="override RUN_ID env var")
    p.add_argument("--system", default=None, help="override AIGOV_SYSTEM env var")
    args = p.parse_args(argv[1:])

    run_id_final = (args.run_id or os.getenv("RUN_ID") or "").strip()
    if not run_id_final:
        raise SystemExit("RUN_ID is required via --run-id or env RUN_ID")

    system_final = (args.system or os.getenv("AIGOV_SYSTEM") or "aigov_poc").strip()
    if not system_final:
        raise SystemExit("system is required via --system or env AIGOV_SYSTEM")

    payload = _parse_payload(args.payload)
    event_id = _make_event_id(args.event_type, run_id_final)

    emit_event(
        run_id=run_id_final,
        event_type=args.event_type,
        event_id=event_id,
        system=system_final,
        actor=args.actor,
        payload=payload,
    )

    ep = _evidence_path(run_id_final)
    if not ep.exists():
        print(json.dumps({"ok": True, "written": False, "reason": "missing evidence file"}, ensure_ascii=False))
        return

    evidence = _read_json(ep)
    if not isinstance(evidence, dict):
        print(json.dumps({"ok": True, "written": True, "reason": "evidence not an object"}, ensure_ascii=False))
        return

    events = evidence.get("events", [])
    if isinstance(events, list) and events:
        print(json.dumps(events[-1], ensure_ascii=False))
        return

    print(json.dumps({"ok": True, "written": True, "events": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv)
