from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import sys
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


def stable_event_id(run_id: str, ordinal: int, event_type: str, ts_utc: str) -> str:
    """
    Deterministic event id based on stable inputs.
    This avoids random UUIDs and makes CI output reproducible.
    """
    msg = f"{run_id}|{ordinal}|{event_type}|{ts_utc}".encode("utf-8")
    return hashlib.sha256(msg).hexdigest()


def stable_hash(obj: Any) -> str:
    """
    Deterministic sha256 over JSON canonical form.
    """
    data = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def build_minimal_evidence(run_id: str) -> Dict[str, Any]:
    """
    Build a minimal, but structurally valid evidence chain that is compatible with
    multiple verify implementations:
      - events list (>= 2)
      - explicit chain head
      - prev linkage between events
      - per-event hash fields (best effort)
      - explicit marker that this is CI fallback evidence
    """
    ts = now_utc_iso()

    genesis_type = "evidence_genesis"
    head_type = "ci_fallback_used"

    genesis_id = stable_event_id(run_id, 1, genesis_type, ts)
    head_id = stable_event_id(run_id, 2, head_type, ts)

    genesis_event: Dict[str, Any] = {
        "id": genesis_id,
        "event_id": genesis_id,
        "run_id": run_id,
        "ts_utc": ts,
        "type": genesis_type,
        "system": "ci_fallback",
        "payload": {
            "source": "ci_fallback",
            "notes": "Genesis evidence event generated in CI to enable report preparation.",
        },
        "prev": None,
    }

    head_event: Dict[str, Any] = {
        "id": head_id,
        "event_id": head_id,
        "run_id": run_id,
        "ts_utc": ts,
        "type": head_type,
        "system": "ci_fallback",
        "payload": {
            "source": "ci_fallback",
            "notes": "CI fallback evidence used because real evidence was missing in repo.",
        },
        "prev": genesis_id,
        "prev_event_id": genesis_id,
    }

    # Best effort: include content hashes that some verifiers might expect.
    # We hash a canonical representation of the event WITHOUT its own hash fields to avoid recursion.
    def with_hashes(ev: Dict[str, Any]) -> Dict[str, Any]:
        base = dict(ev)
        base.pop("hash", None)
        base.pop("sha256", None)
        h = stable_hash(base)
        out = dict(ev)
        out["hash"] = h
        out["sha256"] = h
        return out

    events: List[Dict[str, Any]] = [with_hashes(genesis_event), with_hashes(head_event)]

    # Provide multiple possible “head” fields for compatibility with different verify implementations.
    chain: Dict[str, Any] = {
        "head": head_id,
        "head_event_id": head_id,
        "head_id": head_id,
        "head_hash": events[-1].get("hash"),
        "hash_alg": "sha256",
    }

    evidence: Dict[str, Any] = {
        "run_id": run_id,
        "ts_utc": ts,
        "system": "ci_fallback",
        "kind": "evidence",
        "mode": "ci",
        "events": events,
        "chain": chain,
        "chain_head": head_id,
        "head": head_id,
        "head_event_id": head_id,
        "meta": {
            "generated_by": "python/aigov_py/ci_fallback.py",
            "source": "ci_fallback",
            "warning": "This evidence was auto generated for CI. Replace with real evidence events for production use.",
        },
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
