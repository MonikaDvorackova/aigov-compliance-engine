from __future__ import annotations

from typing import Any, Dict, List, Optional
from .crypto import canonical_json_bytes, sha256_bytes


def hash_event(e: Dict[str, Any]) -> str:
    return sha256_bytes(canonical_json_bytes(e))


def build_chain(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    prev: Optional[str] = None
    out: List[Dict[str, Any]] = []
    for e in events:
        e2 = dict(e)
        e2["prev"] = prev or ""
        sha = hash_event(e2)
        e2["sha256"] = sha
        out.append(e2)
        prev = sha
    return {"head_sha256": prev or "", "events": out}
