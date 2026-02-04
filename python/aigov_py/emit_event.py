from __future__ import annotations

import argparse
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import requests

from .canonical_json import canonical_bytes
from .events import rebuild_chain_inplace


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _docs_dir() -> Path:
    return _repo_root() / "docs"


def _evidence_path(run_id: str) -> Path:
    return _docs_dir() / "evidence" / f"{run_id}.json"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(p: Path) -> Dict[str, Any]:
    return json.loads(p.read_text(encoding="utf-8"))


def _atomic_write(p: Path, data: bytes) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(p)


def _ensure_evidence(run_id: str) -> Dict[str, Any]:
    p = _evidence_path(run_id)
    if p.exists():
        obj = _read_json(p)
        if not isinstance(obj, dict):
            raise TypeError("Evidence JSON must be an object")
        if "events" not in obj or not isinstance(obj["events"], list):
            obj["events"] = []
        if "run_id" not in obj or not isinstance(obj["run_id"], str) or not obj["run_id"].strip():
            obj["run_id"] = run_id
        return obj

    return {
        "run_id": run_id,
        "policy_version": "unknown",
        "events": [],
        "chain": {"head_sha256": "", "events": []},
    }


def _parse_payload(raw: str) -> Dict[str, Any]:
    raw = (raw or "").strip()
    if not raw:
        return {}
    try:
        obj = json.loads(raw)
    except Exception as e:
        raise SystemExit(f"payload must be valid JSON: {e}")
    if not isinstance(obj, dict):
        raise SystemExit("payload must be a JSON object (e.g. '{}')")
    return obj


def emit_event(
    *,
    run_id: str,
    event_type: str,
    actor: str,
    payload: Dict[str, Any],
    system: str = "aigov_poc",
    endpoint: Optional[str] = None,
    timeout_s: int = 10,
) -> Dict[str, Any]:
    run_id = (run_id or "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    event_type = (event_type or "").strip()
    if not event_type:
        raise SystemExit("event_type is required")

    ev: Dict[str, Any] = {
        "event_id": f"{event_type}_{run_id}_{uuid.uuid4()}",
        "event_type": event_type,
        "ts_utc": _utc_now_iso(),
        "actor": actor,
        "system": system,
        "run_id": run_id,
        "payload": payload or {},
    }

    # 1) Always write locally to docs/evidence/<run_id>.json
    evidence = _ensure_evidence(run_id)
    evidence["events"].append(ev)
    rebuild_chain_inplace(evidence)
    _atomic_write(_evidence_path(run_id), canonical_bytes(evidence))

    # 2) Best-effort send to audit service (optional)
    ep = (endpoint or os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088") or "").rstrip("/")
    if ep:
        try:
            r = requests.post(f"{ep}/evidence", json=ev, timeout=timeout_s)
            ev["_remote"] = {"status": r.status_code, "text": r.text[:2000]}
        except Exception as e:
            ev["_remote"] = {"error": str(e)}

    return ev


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(prog="python -m aigov_py.emit_event")
    p.add_argument("event_type", help="event type, e.g. human_approved, promoted")
    p.add_argument("--run-id", default="", help="optional, otherwise uses RUN_ID env var")
    p.add_argument("--actor", default="system", help="actor id")
    p.add_argument("--system", default="aigov_poc", help="system name")
    p.add_argument("--payload", default="{}", help="JSON object payload as string, e.g. '{}' or '{\"k\":1}'")
    p.add_argument("--endpoint", default="", help="override audit endpoint, e.g. http://127.0.0.1:8088")
    args = p.parse_args(argv[1:])

    run_id_final = (args.run_id or os.environ.get("RUN_ID", "")).strip()
    payload = _parse_payload(args.payload)
    endpoint = args.endpoint.strip() or None

    ev = emit_event(
        run_id=run_id_final,
        event_type=args.event_type,
        actor=args.actor,
        payload=payload,
        system=args.system,
        endpoint=endpoint,
    )
    print(json.dumps(ev, ensure_ascii=False))


if __name__ == "__main__":
    import sys

    main(sys.argv)
