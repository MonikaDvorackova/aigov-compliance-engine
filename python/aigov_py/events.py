from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .chain import build_chain
from .crypto import canonical_json_bytes


def _find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for _ in range(10):
        if (cur / "docs").exists():
            return cur
        cur = cur.parent
    raise FileNotFoundError("Could not locate repo root with docs directory")


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json_canonical(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_json_bytes(obj))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _ensure_evidence_object(x: Any) -> Dict[str, Any]:
    if isinstance(x, dict):
        return x
    raise TypeError("Evidence JSON must be an object")


def emit_event(
    run_id: str,
    event_type: str,
    *,
    actor: str = "system",
    payload: Optional[Dict[str, Any]] = None,
    repo_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Append an event to docs/evidence/<RUN_ID>.json and rebuild chain.
    Returns the created event.
    """
    root = repo_root or _find_repo_root(Path.cwd())
    docs = root / "docs"
    evidence_path = docs / "evidence" / f"{run_id}.json"

    if not evidence_path.exists():
        raise FileNotFoundError(f"Missing evidence file: {evidence_path}")

    evidence = _ensure_evidence_object(_load_json(evidence_path))

    events = evidence.get("events")
    if events is None:
        events = []
    if not isinstance(events, list):
        raise TypeError("Evidence field events must be a list")

    ev: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "ts": _utc_now_iso(),
        "type": str(event_type),
        "actor": str(actor),
        "payload": payload or {},
    }

    events.append(ev)
    evidence["events"] = events

    evidence["chain"] = build_chain(events)

    _write_json_canonical(evidence_path, evidence)
    return ev
