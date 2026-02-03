from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, Tuple

from .chain import build_chain
from .crypto import sha256_file


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


def _as_dict(x: Any, name: str) -> Dict[str, Any]:
    if isinstance(x, dict):
        return x
    raise TypeError(f"{name} must be a JSON object")


def _as_list(x: Any, name: str) -> list:
    if isinstance(x, list):
        return x
    raise TypeError(f"{name} must be a JSON list")


def _verify_chain(evidence_obj: Dict[str, Any], audit_obj: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Returns (ok, message).
    Rules:
      If evidence has no events, chain check is skipped.
      If evidence has events, chain must exist and match recomputation.
      If audit contains evidence_chain_head_sha256, it must match evidence chain head.
    """
    events_any = evidence_obj.get("events")
    if events_any is None:
        return True, "Chain check skipped (no events field)"

    events = _as_list(events_any, "evidence.events")
    if len(events) == 0:
        return True, "Chain check skipped (events empty)"

    chain_any = evidence_obj.get("chain")
    if chain_any is None:
        return False, "FAIL chain missing but events present"

    chain = _as_dict(chain_any, "evidence.chain")
    recorded_head = str(chain.get("head_sha256", ""))

    recomputed = build_chain(events)
    recomputed_head = str(recomputed.get("head_sha256", ""))

    if recorded_head != recomputed_head:
        return False, "FAIL chain head mismatch (evidence chain does not match events)"

    audit_head = str(audit_obj.get("evidence_chain_head_sha256", ""))
    if audit_head and audit_head != recorded_head:
        return False, "FAIL chain head mismatch (audit does not match evidence)"

    return True, "Chain head OK"


def verify(run_id: str) -> int:
    repo_root = _find_repo_root(Path.cwd())
    docs = repo_root / "docs"

    audit_json = docs / "audit" / f"{run_id}.json"
    audit_sha_file = docs / "audit" / f"{run_id}.sha256"
    manifest_path = docs / "audit" / f"{run_id}.manifest.json"

    print("AIGOV VERIFICATION REPORT")
    print(f"Audit ID: {run_id}")

    if not audit_json.exists():
        print("ERROR missing audit.json")
        return 2
    if not audit_sha_file.exists():
        print("ERROR missing audit.sha256")
        return 2
    if not manifest_path.exists():
        print("ERROR missing manifest.json")
        return 2

    recorded_sha = audit_sha_file.read_text(encoding="utf-8").strip()
    actual_sha = sha256_file(audit_json)

    if recorded_sha != actual_sha:
        print("FAIL audit sha256 mismatch")
        print(f" recorded {recorded_sha}")
        print(f" actual   {actual_sha}")
        return 1

    print("Audit hash OK")

    manifest = _as_dict(_load_json(manifest_path), "manifest")
    artifacts = manifest.get("artifacts", {})
    if not isinstance(artifacts, dict):
        print("FAIL manifest artifacts must be an object")
        return 1

    ok = True
    for rel_path, expected_sha_any in artifacts.items():
        expected_sha = str(expected_sha_any)
        p = docs / rel_path
        if not p.exists():
            print(f"FAIL missing artifact {rel_path}")
            ok = False
            continue

        actual = sha256_file(p)
        if actual != expected_sha:
            print(f"FAIL {rel_path} sha mismatch")
            print(f" expected {expected_sha}")
            print(f" actual   {actual}")
            ok = False
        else:
            print(f"OK   {rel_path}")

    if not ok:
        print("VERDICT INVALID")
        return 1

    audit_obj = _as_dict(_load_json(audit_json), "audit")

    evidence_rel = None
    for k in artifacts.keys():
        if k.startswith("evidence/") and k.endswith(f"{run_id}.json"):
            evidence_rel = k
            break
    evidence_path = docs / evidence_rel if evidence_rel else (docs / "evidence" / f"{run_id}.json")

    if evidence_path.exists():
        evidence_obj = _as_dict(_load_json(evidence_path), "evidence")
        chain_ok, chain_msg = _verify_chain(evidence_obj, audit_obj)
        if chain_ok:
            print(chain_msg)
        else:
            print(chain_msg)
            print("VERDICT INVALID")
            return 1
    else:
        print("Chain check skipped (evidence file not found)")

    print("VERDICT VALID")
    return 0


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        print("usage: python -m aigov_py.verify <RUN_ID>", file=sys.stderr)
        raise SystemExit(2)

    rc = verify(argv[1])
    raise SystemExit(rc)


if __name__ == "__main__":
    main(sys.argv)

