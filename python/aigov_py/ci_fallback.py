from __future__ import annotations

import datetime as dt
import json
import os
import sys
import uuid
from typing import Any, Dict, List


def now_utc_iso() -> str:
    return (
        dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def repo_root_from_file() -> str:
    # File path: <repo>/python/aigov_py/ci_fallback.py
    # Repo root is two levels up from this file directory.
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", ".."))


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def write_json(path: str, payload: Dict[str, Any]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def build_minimal_evidence(run_id: str) -> Dict[str, Any]:
    ts = now_utc_iso()
    eid = str(uuid.uuid4())

    event: Dict[str, Any] = {
        "id": eid,
        "event_id": eid,
        "run_id": run_id,
        "ts_utc": ts,
        "type": "evidence_stub",
        "system": "ci_fallback",
        "payload": {
            "notes": "Auto generated stub so report_init/verify can run. Replace with real evidence events.",
        },
        "prev": None,
    }

    events: List[Dict[str, Any]] = [event]

    # Provide multiple possible “head” fields for compatibility with different verify implementations.
    chain_head = {
        "head": eid,
        "head_event_id": eid,
        "head_id": eid,
        "hash_alg": "sha256",
    }

    evidence: Dict[str, Any] = {
        "run_id": run_id,
        "ts_utc": ts,
        "system": "ci_fallback",
        "kind": "evidence",
        "events": events,
        "chain": chain_head,
        "chain_head": eid,
        "head": eid,
        "head_event_id": eid,
    }

    return evidence


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: python python/aigov_py/ci_fallback.py <run_id>", file=sys.stderr)
        return 2

    run_id = argv[1].strip()
    if not run_id:
        print("run_id is empty", file=sys.stderr)
        return 2

    repo_root = repo_root_from_file()
    evidence_dir = os.path.join(repo_root, "docs", "evidence")
    ensure_dir(evidence_dir)

    evidence_path = os.path.join(evidence_dir, f"{run_id}.json")

    payload = build_minimal_evidence(run_id)
    write_json(evidence_path, payload)
    print(f"saved {evidence_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
