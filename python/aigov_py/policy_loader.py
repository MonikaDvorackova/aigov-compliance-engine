from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def load_policy_required_evidence(policy_path: str | Path) -> set[str]:
    """
    Load a policy module YAML and return the flat required_evidence set.

    This is a static mapping helper:
    - No runtime logic
    - Deterministic: YAML → union(required_evidence)
    - No GovAI engine integration (utility only)
    """

    p = Path(policy_path)
    raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise TypeError("policy module must be a YAML object at the top level")

    policy = raw.get("policy")
    if not isinstance(policy, dict):
        raise ValueError("policy module missing required object: policy")

    for k in ("id", "name", "version"):
        v = policy.get(k)
        if not isinstance(v, str) or not v.strip():
            raise ValueError(f"policy.{k} must be a non-empty string")

    reqs = raw.get("requirements")
    if not isinstance(reqs, list) or not reqs:
        raise ValueError("policy module requirements must be a non-empty list")

    out: set[str] = set()

    for i, r in enumerate(reqs):
        if not isinstance(r, dict):
            raise TypeError(f"requirements[{i}] must be an object")

        code = r.get("code")
        desc = r.get("description")
        ev = r.get("required_evidence")

        if not isinstance(code, str) or not code.strip():
            raise ValueError(f"requirements[{i}].code must be a non-empty string")
        if not isinstance(desc, str) or not desc.strip():
            raise ValueError(f"requirements[{i}].description must be a non-empty string")
        if not isinstance(ev, list) or not ev:
            raise ValueError(f"requirements[{i}].required_evidence must be a non-empty list")

        for j, item in enumerate(ev):
            if not isinstance(item, str) or not item.strip():
                raise ValueError(
                    f"requirements[{i}].required_evidence[{j}] must be a non-empty string"
                )
            out.add(item.strip())

    return out


def load_policy_module(policy_path: str | Path) -> dict[str, Any]:
    """Load the YAML policy module as a raw dict (utility)."""

    p = Path(policy_path)
    raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise TypeError("policy module must be a YAML object at the top level")
    return raw

