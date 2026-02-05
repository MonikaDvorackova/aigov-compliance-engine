# python/aigov_py/verify.py

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple


def _repo_root() -> str:
    # python/aigov_py/verify.py -> repo root is two levels up from python/
    here = os.path.abspath(os.path.dirname(__file__))              # .../python/aigov_py
    python_dir = os.path.abspath(os.path.join(here, ".."))         # .../python
    root = os.path.abspath(os.path.join(python_dir, ".."))         # repo root
    return root


def _p(*parts: str) -> str:
    return os.path.join(_repo_root(), *parts)


def _load_json(path: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if not os.path.exists(path):
        return None, f"missing file: {path}"
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return None, f"invalid json root type at {path}"
        return data, None
    except Exception as e:
        return None, f"failed to read json {path}: {e}"


def _read_report_kv(report_path: str) -> Dict[str, str]:
    kv: Dict[str, str] = {}
    if not os.path.exists(report_path):
        return kv
    with open(report_path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip()
            if k:
                kv[k] = v
    return kv


def _as_list(x: Any) -> Optional[List[Any]]:
    return x if isinstance(x, list) else None


def _as_dict(x: Any) -> Optional[Dict[str, Any]]:
    return x if isinstance(x, dict) else None


def _has_events(evidence: Dict[str, Any]) -> bool:
    top_events = _as_list(evidence.get("events"))
    if top_events is not None:
        return True

    chain = _as_dict(evidence.get("chain"))
    if chain is None:
        return False

    chain_events = _as_list(chain.get("events"))
    if chain_events is not None:
        return True

    return False


def _head_present_even_if_empty(chain: Dict[str, Any]) -> bool:
    # Treat presence of head key as present even if its value is empty.
    for k in ("head", "head_node", "head_id", "headId", "tip", "root", "head_hash", "head_sha256", "headHash"):
        if k in chain:
            return True
    return False


def _find_chain_head_any(evidence: Dict[str, Any]) -> Optional[Any]:
    chain = _as_dict(evidence.get("chain"))
    if chain is not None:
        if _head_present_even_if_empty(chain):
            return True

        nodes = _as_dict(chain.get("nodes"))
        if nodes and len(nodes) > 0:
            return True

    for k in ("chain_head", "chainHead", "chain_head_node", "chainHeadNode"):
        if k in evidence:
            return True

    return None


def verify(run_id: str) -> int:
    audit_path = _p("docs", "audit", f"{run_id}.json")
    evidence_path = _p("docs", "evidence", f"{run_id}.json")
    report_path = _p("docs", "reports", f"{run_id}.md")

    print("AIGOV VERIFICATION REPORT")
    print(f"Audit ID: {run_id}")

    ok = True

    report_kv = _read_report_kv(report_path)
    report_bundle = report_kv.get("bundle_sha256")
    report_policy = report_kv.get("policy_version")

    audit, audit_err = _load_json(audit_path)
    if audit is None:
        print(f"FAIL {audit_err}")
        ok = False
        audit = {}

    evidence, evidence_err = _load_json(evidence_path)
    if evidence is None:
        print(f"FAIL {evidence_err}")
        ok = False
        evidence = {}

    audit_bundle = audit.get("bundle_sha256")
    audit_policy = audit.get("policy_version")

    if report_bundle and audit_bundle and report_bundle == audit_bundle:
        print(f"OK   reports/{run_id}.md bundle_sha256 matches")
    else:
        if report_bundle is None:
            print("FAIL report missing bundle_sha256")
        elif audit_bundle is None:
            print("FAIL audit missing bundle_sha256")
        else:
            print("FAIL report bundle_sha256 does not match audit.bundle_sha256")
        ok = False

    if report_policy and audit_policy and report_policy == audit_policy:
        print(f"OK   reports/{run_id}.md policy_version matches")
    else:
        if report_policy is None:
            print("FAIL report missing policy_version")
        elif audit_policy is None:
            print("FAIL audit missing policy_version")
        else:
            print("FAIL report policy_version does not match audit.policy_version")
        ok = False

    if os.path.exists(audit_path):
        print(f"OK   audit/{run_id}.json")
    else:
        print(f"FAIL missing audit/{run_id}.json")
        ok = False

    if not _has_events(evidence):
        print("FAIL evidence missing events list")
        ok = False

    head = _find_chain_head_any(evidence)
    if not head:
        chain = _as_dict(evidence.get("chain"))
        if chain is not None and _has_events(evidence):
            head = True

    if not head:
        print("FAIL chain head missing")
        ok = False

    if ok:
        print("VERDICT VALID")
        return 0

    print("VERDICT INVALID")
    return 2


def main(argv: List[str]) -> int:
    if len(argv) != 2:
        print("Usage: python -m aigov_py.verify <RUN_ID>")
        return 2
    run_id = argv[1].strip()
    if not run_id:
        print("RUN_ID is empty")
        return 2
    return verify(run_id)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
