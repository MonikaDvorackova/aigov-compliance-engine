from __future__ import annotations

import json
import sys
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


def _manifest_path(run_id: str) -> Path:
    return _docs_dir() / "audit" / f"{run_id}.manifest.json"


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    import hashlib
    return hashlib.sha256(data).hexdigest()


def _print_ok(rel: str) -> None:
    print(f"OK   {rel}")


def _print_fail(msg: str) -> None:
    print(f"FAIL {msg}")


def _rel_docs(path: Path) -> str:
    try:
        return str(path.relative_to(_docs_dir()))
    except Exception:
        return str(path)


def _audit_sha_path_candidates(run_id: str) -> List[Path]:
    p1 = _docs_dir() / "audit" / f"{run_id}.sha256"
    p2 = _docs_dir() / "audit" / f"{run_id}.json.sha256"
    return [p1, p2]


def _find_manifest_hash(manifest: Dict[str, Any], kind: str, run_id: str) -> Optional[str]:
    direct = manifest.get(f"{kind}_sha256")
    if isinstance(direct, str) and direct:
        return direct

    hashes = manifest.get("hashes")
    if isinstance(hashes, dict):
        v = hashes.get(f"{kind}_sha256")
        if isinstance(v, str) and v:
            return v

    files = manifest.get("files")
    if isinstance(files, dict):
        target_paths = []
        if kind == "evidence":
            target_paths.append(f"docs/evidence/{run_id}.json")
            target_paths.append(f"evidence/{run_id}.json")
            target_paths.append(f"{run_id}.json")
        if kind == "report":
            target_paths.append(f"docs/reports/{run_id}.md")
            target_paths.append(f"reports/{run_id}.md")
            target_paths.append(f"{run_id}.md")

        for key in target_paths:
            entry = files.get(key)
            if isinstance(entry, dict):
                sha = entry.get("sha256")
                if isinstance(sha, str) and sha:
                    return sha

        for _, entry in files.items():
            if isinstance(entry, dict):
                p = entry.get("path")
                sha = entry.get("sha256")
                if isinstance(p, str) and isinstance(sha, str) and sha:
                    if kind == "evidence" and p.endswith(f"evidence/{run_id}.json"):
                        return sha
                    if kind == "report" and p.endswith(f"reports/{run_id}.md"):
                        return sha

    return None


def _verify_audit_hash(audit_json_path: Path, run_id: str) -> Tuple[bool, str]:
    candidates = _audit_sha_path_candidates(run_id)
    sha_path = next((p for p in candidates if p.exists()), None)
    if sha_path is None:
        return False, f"missing {run_id}.sha256"

    expected = _read_text(sha_path).strip()
    if not expected:
        return False, f"empty {sha_path.name}"

    actual = _sha256_bytes(audit_json_path.read_bytes())
    if actual != expected:
        return False, f"{_rel_docs(audit_json_path)} sha mismatch expected {expected} actual {actual}"
    return True, ""


def _verify_report_hash(report_path: Path, manifest: Dict[str, Any], run_id: str) -> Tuple[bool, str]:
    expected = _find_manifest_hash(manifest, "report", run_id)
    if not isinstance(expected, str) or not expected:
        return False, "manifest missing report sha256"

    actual = _sha256_bytes(report_path.read_bytes())
    if actual != expected:
        return False, f"{_rel_docs(report_path)} sha mismatch expected {expected} actual {actual}"
    return True, ""


def _verify_evidence_hash(evidence_path: Path, manifest: Dict[str, Any], run_id: str) -> Tuple[bool, str]:
    expected = _find_manifest_hash(manifest, "evidence", run_id)
    if not isinstance(expected, str) or not expected:
        return False, "manifest missing evidence sha256"

    actual = _sha256_bytes(evidence_path.read_bytes())
    if actual != expected:
        return False, f"{_rel_docs(evidence_path)} sha mismatch expected {expected} actual {actual}"
    return True, ""


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
    manifest_path = _manifest_path(run_id)

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
    if not manifest_path.exists():
        _print_fail(f"missing audit/{run_id}.manifest.json")
        ok = False

    if not ok:
        print("VERDICT INVALID")
        raise SystemExit(1)

    hash_ok, hash_msg = _verify_audit_hash(audit_json_path, run_id)
    if not hash_ok:
        _print_fail(hash_msg)
        ok = False
    else:
        print("Audit hash OK")

    manifest = _read_json(manifest_path)

    ev_ok, ev_msg = _verify_evidence_hash(evidence_json_path, manifest, run_id)
    if ev_ok:
        _print_ok(f"evidence/{run_id}.json")
    else:
        _print_fail(ev_msg)
        ok = False

    rep_ok, rep_msg = _verify_report_hash(report_md_path, manifest, run_id)
    if rep_ok:
        _print_ok(f"reports/{run_id}.md")
    else:
        _print_fail(rep_msg)
        ok = False

    _print_ok(f"audit/{run_id}.json")

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
