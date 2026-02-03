from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _evidence_path(run_id: str) -> Path:
    return _repo_root() / "docs" / "evidence" / f"{run_id}.json"


def _atomic_write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp.{uuid.uuid4()}")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _load_or_init(run_id: str) -> Dict[str, Any]:
    p = _evidence_path(run_id)
    if not p.exists():
        init: Dict[str, Any] = {
            "run_id": run_id,
            "created_ts_utc": _utc_now_iso(),
            "events": [],
            "chain": {
                "head_sha256": None,
                "count": 0,
                "version": "v1",
            },
        }
        _atomic_write_json(p, init)
        return init

    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        # If file is corrupted, fail loudly rather than silently overwriting evidence.
        raise RuntimeError(f"Failed to parse evidence file: {p}")


def _next_seq(evidence: Dict[str, Any]) -> int:
    events = evidence.get("events")
    if isinstance(events, list):
        return len(events) + 1
    return 1


def emit_event(
    run_id: str,
    event_type: str,
    *,
    actor: str = "system",
    payload: Optional[Dict[str, Any]] = None,
    event_id: Optional[str] = None,
    ts_utc: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Append a local evidence event into docs/evidence/<run_id>.json.

    This function is intentionally tolerant: it will create the evidence file
    if it doesn't exist yet (first event for a new run_id).
    """
    run_id = (run_id or "").strip()
    if not run_id:
        raise ValueError("run_id is required")

    evidence = _load_or_init(run_id)

    if not isinstance(evidence.get("events"), list):
        evidence["events"] = []

    evt: Dict[str, Any] = {
        "id": event_id or str(uuid.uuid4()),
        "type": event_type,
        "ts_utc": ts_utc or _utc_now_iso(),
        "actor": actor,
        "seq": _next_seq(evidence),
        "payload": payload or {},
    }

    evidence["events"].append(evt)

    # Keep a minimal chain metadata block present; actual chain hashing can be
    # computed elsewhere (export_bundle / verify). This prevents null structure.
    chain = evidence.get("chain")
    if not isinstance(chain, dict):
        chain = {}
        evidence["chain"] = chain
    if "count" in chain and isinstance(chain["count"], int):
        chain["count"] = chain["count"] + 1
    else:
        chain["count"] = len(evidence["events"])
    chain.setdefault("version", "v1")
    chain.setdefault("head_sha256", chain.get("head_sha256"))

    _atomic_write_json(_evidence_path(run_id), evidence)
    return evt
