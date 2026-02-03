from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _extract_policy_version(audit_obj: Dict[str, Any]) -> Optional[str]:
    for key in ["policy_version", "policyVersion", "policy"]:
        v = audit_obj.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    meta = audit_obj.get("meta")
    if isinstance(meta, dict):
        v = meta.get("policy_version")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _upsert_header(report_text: str, key: str, value: str) -> str:
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    replacement = f"{key}={value}"
    if pattern.search(report_text):
        return pattern.sub(replacement, report_text, count=1)
    return replacement + "\n" + report_text


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        raise SystemExit("Usage: python -m aigov_py.report_fill <run_id>")

    run_id = argv[1].strip()
    if not run_id:
        raise SystemExit("run_id is required")

    repo_root = Path(__file__).resolve().parents[2]
    report_path = repo_root / "docs" / "reports" / f"{run_id}.md"
    evidence_path = repo_root / "docs" / "evidence" / f"{run_id}.json"
    audit_path = repo_root / "docs" / "audit" / f"{run_id}.json"

    if not report_path.exists():
        raise SystemExit(f"Missing report file: {report_path}")

    bundle_sha256 = ""
    if evidence_path.exists():
        bundle_sha256 = _sha256_file(evidence_path)

    policy_version = ""
    if audit_path.exists():
        audit_obj = _load_json(audit_path)
        pv = _extract_policy_version(audit_obj)
        if pv:
            policy_version = pv

    if not policy_version:
        policy_version = os.getenv("AIGOV_POLICY_VERSION", "").strip() or "unknown"

    if not bundle_sha256:
        bundle_sha256 = os.getenv("AIGOV_BUNDLE_SHA256", "").strip() or "unknown"

    text = report_path.read_text(encoding="utf-8")

    text = _upsert_header(text, "run_id", run_id)
    text = _upsert_header(text, "bundle_sha256", bundle_sha256)
    text = _upsert_header(text, "policy_version", policy_version)

    report_path.write_text(text, encoding="utf-8")
    print(f"updated {report_path}")


if __name__ == "__main__":
    main(sys.argv)
