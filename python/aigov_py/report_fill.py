from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional
import json


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _require_file(p: Path, label: str) -> None:
    if not p.exists() or not p.is_file():
        raise FileNotFoundError(f"{label} not found: {p}")


def _policy_version_from_evidence(evidence: Dict[str, Any]) -> Optional[str]:
    pv = evidence.get("policy_version")
    if isinstance(pv, str) and pv.strip():
        return pv.strip()

    events = evidence.get("events")
    if isinstance(events, list):
        for e in reversed(events):
            if not isinstance(e, dict):
                continue
            payload = e.get("payload")
            if isinstance(payload, dict):
                pv2 = payload.get("policy_version")
                if isinstance(pv2, str) and pv2.strip():
                    return pv2.strip()
    return None


def _set_kv_line(text: str, key: str, value: str) -> str:
    pat = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    if pat.search(text):
        return pat.sub(f"{key}={value}", text)
    return f"{key}={value}\n{text}"


def fill_report(run_id: str) -> Path:
    rid = run_id.strip()
    if not rid:
        raise SystemExit("run_id is required")

    root = _repo_root()
    evidence_path = root / "docs" / "evidence" / f"{rid}.json"
    report_path = root / "docs" / "reports" / f"{rid}.md"

    _require_file(evidence_path, "evidence bundle")
    _require_file(report_path, "report")

    evidence = _read_json(evidence_path)
    bundle_sha256 = _sha256_file(evidence_path)
    policy_version = _policy_version_from_evidence(evidence) or "v0.4_human_approval"

    txt = report_path.read_text(encoding="utf-8")

    txt = _set_kv_line(txt, "run_id", rid)
    txt = _set_kv_line(txt, "bundle_sha256", bundle_sha256)
    txt = _set_kv_line(txt, "policy_version", policy_version)

    report_path.write_text(txt, encoding="utf-8")
    return report_path


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        raise SystemExit("Usage: python -m aigov_py.report_fill <run_id>")
    p = fill_report(argv[1])
    print(f"updated {p}")


if __name__ == "__main__":
    main(sys.argv)
