from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Tuple

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


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    import hashlib

    return hashlib.sha256(data).hexdigest()


def _print_ok(msg: str) -> None:
    print(f"OK   {msg}")


def _print_fail(msg: str) -> None:
    print(f"FAIL {msg}")


def _audit_sha_path_candidates(run_id: str) -> List[Path]:
    # We now expect only docs/audit/<run_id>.sha256, but keep fallback for older names.
    p1 = _docs_dir() / "audit" / f"{run_id}.sha256"
    p2 = _docs_dir() / "audit_meta" / f"{run_id}.sha256"
    p3 = _docs_dir() / "audit" / f"{run_id}.json.sha256"
    return [p1, p2, p3]


def _verify_audit_hash(audit_json_path: Path, run_id: str) -> Tuple[bool, str]:
    candidates = _audit_sha_path_candidates(run_id)
    sha_path = next((p for p in candidates if p.exists()), None)
    if sha_path is None:
        return False, f"missing audit sha256 (expected one of: {', '.join(str(p) for p in candidates)})"

    expected = _read_text(sha_path).strip()
    if not expected:
        return False, f"empty {sha_path.name}"

    actual = _sha256_bytes(audit_json_path.read_bytes())
    if actual != expected:
        return False, f"audit sha mismatch expected {expected} actual {actual}"
    return True, ""


def _verify_report_header_matches_audit(report_path: Path, audit: Dict[str, Any], run_id: str) -> Tuple[bool, str]:
    txt = _read_text(report_path).splitlines()
    header = {k: "" for k in ("run_id", "bundle_sha256", "policy_version")}
    for line in txt[:30]:
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip()
        if k in header:
            header[k] = v

    if header["run_id"] != run_id:
        return False, f"report run_id mismatch expected {run_id} actual {header['run_id']}"

    audit_bundle = str(audit.get("bundle_sha256") or "").strip()
    if not audit_bundle:
        return False, "audit object missing bundle_sha256"

    if header["bundle_sha256"] != audit_bundle:
        return False, f"report bundle_sha256 mismatch expected {audit_bundle} actual {header['bundle_sha256']}"

    audit_policy = str(audit.get("policy_version") or "").strip()
    if not audit_policy:
        return False, "audit object missing policy_version"

    if header["policy_version"] != audit_policy:
        return False, f"report policy_version mismatch expected {audit_policy} actual {header['policy_version']}"

    return True, ""


def _verify_file_sha_matches_audit_hashes(
    *,
    audit: Dict[str, Any],
    evidence_path: Path,
    report_path: Path,
) -> Tuple[bool, str]:
    hashes = audit.get("hashes")
    if not isinstance(hashes, dict):
        return False, "audit object missing hashes dict"

    ev_expected = str(hashes.get("evidence_sha256") or "").strip()
    rep_expected = str(hashes.get("report_sha256") or "").strip()

    if not ev_expected:
        return False, "audit.hashes missing evidence_sha256"
    if not rep_expected:
        return False, "audit.hashes missing report_sha256"

    ev_actual = _sha256_bytes(evidence_path.read_bytes())
    rep_actual = _sha256_bytes(report_path.read_bytes())

    if ev_actual != ev_expected:
        return False, f"evidence sha mismatch expected {ev_expected} actual {ev_actual}"
    if rep_actual != rep_expected:
        return False, f"report sha mismatch expected {rep_expected} actual {rep_actual}"

    return True, ""


def _verify_chain_matches_events(evidence: Dict[str, Any]) -> Tuple[bool, str]:
    if "events" not in evidence or not isinstance(evidence["events"], list):
        return False, "evidence missing events list"

    if "chain" not in evidence or not isinstance(evidence["chain"], dict):
        return False, "evidence missing chain object"

    head = evidence["chain"].get("head_sha256")
    if not isinstance(head, str) or head.strip() == "":
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


def main(argv: List[str]) -> None:
    if len(argv) != 2:
        raise SystemExit("Usage: python -m aigov_py.verify <run_id>")

    run_id = argv[1].strip()
    if not run_id:
        raise SystemExit("run_id is required")

    print("AIGOV VERIFICATION REPORT")
    print(f"Audit ID: {run_id}")

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

    # 1) Report header must match audit bundle_sha256 + policy_version
    hdr_ok, hdr_msg = _verify_report_header_matches_audit(report_md_path, audit, run_id)
    if hdr_ok:
        _print_ok(f"reports/{run_id}.md bundle_sha256 matches")
        _print_ok(f"reports/{run_id}.md policy_version matches")
    else:
        _print_fail(hdr_msg)
        ok = False

    # 2) Evidence/report sha must match audit.hashes
    sha_ok, sha_msg = _verify_file_sha_matches_audit_hashes(
        audit=audit,
        evidence_path=evidence_json_path,
        report_path=report_md_path,
    )
    if sha_ok:
        _print_ok(f"evidence/{run_id}.json sha matches")
        _print_ok(f"reports/{run_id}.md sha matches")
    else:
        _print_fail(sha_msg)
        ok = False

    # 3) Audit json sha check (optional file, but verify if present)
    hash_ok, hash_msg = _verify_audit_hash(audit_json_path, run_id)
    if hash_ok:
        print("Audit hash OK")
    else:
        _print_fail(hash_msg)
        ok = False

    _print_ok(f"audit/{run_id}.json")

    # 4) Chain integrity check
    evidence = _read_json(evidence_json_path)
    chain_ok, chain_msg = _verify_chain_matches_events(evidence)
    if chain_ok:
        print("Chain head OK")
    else:
        _print_fail(chain_msg)
        ok = False

    print("VERDICT VALID" if ok else "VERDICT INVALID")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main(sys.argv)
