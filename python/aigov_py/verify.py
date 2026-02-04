from __future__ import annotations

import json
import sys
<<<<<<< HEAD
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
=======
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .events import rebuild_chain_inplace


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _docs_dir() -> Path:
    return _repo_root() / "docs"


def _evidence_path(run_id: str) -> Path:
    return _docs_dir() / "evidence" / f"{run_id}.json"


def _audit_path(run_id: str) -> Path:
    return _docs_dir() / "audit" / f"{run_id}.json"


def _report_path(run_id: str) -> Path:
    return _docs_dir() / "reports" / f"{run_id}.md"


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _sha256_bytes(data: bytes) -> str:
    import hashlib
    return hashlib.sha256(data).hexdigest()


def _print_ok(msg: str) -> None:
    print(f"OK   {msg}")


def _print_fail(msg: str) -> None:
    print(f"FAIL {msg}")


def _verify_chain_matches_events(evidence: Dict[str, Any]) -> Tuple[bool, str]:
    if "events" not in evidence or not isinstance(evidence["events"], list):
        return False, "evidence missing events list"
    if "chain" not in evidence or not isinstance(evidence["chain"], dict):
        return False, "evidence missing chain object"

    head = evidence["chain"].get("head_sha256")
    if head in (None, "", "null"):
        return False, "chain head missing"

    original_head = head
    original_events = evidence["events"]

    computed = deepcopy(evidence)
    rebuild_chain_inplace(computed)

    computed_head = computed.get("chain", {}).get("head_sha256")
    if computed_head != original_head:
        return False, "chain head mismatch (evidence chain does not match events)"

    comp_events: List[Dict[str, Any]] = computed["events"]
    if len(comp_events) != len(original_events):
        return False, "events length mismatch during chain recompute"

    for idx, (orig, comp) in enumerate(zip(original_events, comp_events)):
        if not isinstance(orig, dict) or not isinstance(comp, dict):
            return False, f"event not an object at index {idx}"
        for k in ("prev_sha256", "sha256"):
            if orig.get(k) != comp.get(k):
                return False, f"event {idx} {k} mismatch"

    return True, ""


def _extract_report_header(report_path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    lines = report_path.read_text(encoding="utf-8").splitlines()
    for line in lines[:10]:
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip()
        if k in ("run_id", "bundle_sha256", "policy_version"):
            out[k] = v
    return out


def main(argv: List[str]) -> None:
    if len(argv) != 2:
        raise SystemExit("Usage: python -m aigov_py.verify <run_id>")

    run_id = argv[1].strip()
    if not run_id:
        raise SystemExit("run_id is required")
>>>>>>> origin/main

    print("AIGOV VERIFICATION REPORT")
    print(f"Audit ID: {run_id}")

<<<<<<< HEAD
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
=======
    audit_json_path = _audit_path(run_id)
    evidence_json_path = _evidence_path(run_id)
    report_md_path = _report_path(run_id)

    ok = True

    if not audit_json_path.exists():
        _print_fail(f"missing audit/{run_id}.json")
        ok = False
    if not evidence_json_path.exists():
        _print_fail(f"missing evidence/{run_id}.json")
        ok = False
    if not report_md_path.exists():
        _print_fail(f"missing reports/{run_id}.md")
        ok = False

    if not ok:
        print("VERDICT INVALID")
        raise SystemExit(1)

    audit = _read_json(audit_json_path)
    evidence = _read_json(evidence_json_path)

    # 1) Report header must match audit object
    hdr = _extract_report_header(report_md_path)

    if hdr.get("run_id") != run_id:
        _print_fail("report header run_id mismatch")
        ok = False

    a_bundle = str(audit.get("bundle_sha256") or "").strip()
    a_policy = str(audit.get("policy_version") or "").strip()

    if not a_bundle:
        _print_fail("audit missing bundle_sha256")
        ok = False
    if not a_policy:
        _print_fail("audit missing policy_version")
        ok = False

    if hdr.get("bundle_sha256") != a_bundle:
        _print_fail("report bundle_sha256 does not match audit.bundle_sha256")
        ok = False
    else:
        _print_ok(f"reports/{run_id}.md bundle_sha256 matches")

    if hdr.get("policy_version") != a_policy:
        _print_fail("report policy_version does not match audit.policy_version")
        ok = False
    else:
        _print_ok(f"reports/{run_id}.md policy_version matches")

    # 2) Evidence + report hashes vs audit hashes if present
    hashes = audit.get("hashes")
    if isinstance(hashes, dict):
        ev_exp = hashes.get("evidence_sha256")
        rp_exp = hashes.get("report_sha256")

        if isinstance(ev_exp, str) and ev_exp:
            ev_act = _sha256_bytes(evidence_json_path.read_bytes())
            if ev_act != ev_exp:
                _print_fail("evidence sha mismatch vs audit.hashes.evidence_sha256")
                ok = False
            else:
                _print_ok(f"evidence/{run_id}.json sha matches")

        if isinstance(rp_exp, str) and rp_exp:
            rp_act = _sha256_bytes(report_md_path.read_bytes())
            if rp_act != rp_exp:
                _print_fail("report sha mismatch vs audit.hashes.report_sha256")
                ok = False
            else:
                _print_ok(f"reports/{run_id}.md sha matches")

    _print_ok(f"audit/{run_id}.json")

    # 3) Chain integrity check
    chain_ok, chain_msg = _verify_chain_matches_events(evidence)
    if chain_ok:
        print("Chain head OK")
    else:
        _print_fail(chain_msg)
        ok = False

    print("VERDICT VALID" if ok else "VERDICT INVALID")
    raise SystemExit(0 if ok else 1)
>>>>>>> origin/main


if __name__ == "__main__":
    main(sys.argv)
<<<<<<< HEAD

=======
>>>>>>> origin/main
