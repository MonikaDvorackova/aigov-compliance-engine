from __future__ import annotations

from typing import Any, Dict, List

from .canonical_json import canonical_bytes
from .crypto import sha256_bytes


def _strip_mutable_hash_fields(e: Dict[str, Any]) -> Dict[str, Any]:
    """
    IMPORTANT:
    The hash must NOT include sha256 itself, otherwise it becomes self-referential
    and will change on every rebuild.
    We also do not include prev_sha256 from the input, because we set it explicitly.
    """
    out = dict(e)
    out.pop("sha256", None)
    out.pop("prev_sha256", None)
    return out


def hash_event(event_without_links: Dict[str, Any], prev_sha256: str) -> str:
    """
    Hash is computed from canonical JSON of the event content plus the linkage field.
    """
    e2 = _strip_mutable_hash_fields(event_without_links)
    e2["prev_sha256"] = prev_sha256
    return sha256_bytes(canonical_bytes(e2))


def build_chain(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Builds a deterministic hash chain over events.

    Output shape:
      {
        "algorithm": "event_hash_chain_v1",
        "head_sha256": "<sha or empty>",
        "events": [
          { ...original event..., "prev_sha256": "...", "sha256": "..." },
          ...
        ]
      }
    """
    prev: str = ""
    out: List[Dict[str, Any]] = []

    for e in events:
        if not isinstance(e, dict):
            raise TypeError("events must be a list of objects")

        base = dict(e)
        base.pop("sha256", None)
        base.pop("prev_sha256", None)

        sha = hash_event(base, prev)

        enriched = dict(e)
        enriched["prev_sha256"] = prev or None
        enriched["sha256"] = sha

        out.append(enriched)
        prev = sha

    return {
        "algorithm": "event_hash_chain_v1",
        "head_sha256": prev,
        "events": out,
    }
