from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional


HEX64_RE = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)
POLICY_RE = re.compile(r"\bv\d+\.\d+(?:[A-Za-z0-9_]+)?\b")


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def _write_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")


def _read_json(p: Path) -> Dict[str, Any]:
    return json.loads(_read_text(p))


def _find_first_str(obj: Any, predicate) -> Optional[str]:
    if isinstance(obj, str):
        return obj if predicate(obj) else None
    if isinstance(obj, dict):
        for v in obj.values():
            hit = _find_first_str(v, predicate)
            if hit:
                return hit
    if isinstance(obj, list):
        for v in obj:
            hit = _find_first_str(v, predicate)
            if hit:
                return hit
    return None


def _extract_policy_version_from_evidence(evidence: Dict[str, Any]) -> Optional[str]:
    events = evidence.get("events")
    if not isinstance(events, list):
        return None

    for e in reversed(events):
        if not isinstance(e, dict):
            continue
        payload = e.get("payload")
        if not isinstance(payload, dict):
            continue
        resp = payload.get("response")
        if isinstance(resp, dict):
            pv = resp.get("policy_version")
            if isinstance(pv, str) and pv.strip():
                return pv.strip()

    return _find_first_str(evidence, lambda s: bool(POLICY_RE.search(s)))


def _extract_bundle_sha256(run_id: str, root: Path) -> Optional[str]:
    sha_path = root / "docs" / "audit" / f"{run_id}.sha256"
    if sha_path.exists():
        s = _read_text(sha_path).strip()
        if HEX64_RE.match(s):
            return s

    audit_path = root / "docs" / "audit" / f"{run_id}.json"
    if audit_path.exists():
        audit = _read_json(audit_path)
        hit = _find_first_str(audit, lambda x: bool(HEX64_RE.match(x.strip())))
        if hit:
            return hit.strip()

    return None


def _set_kv_line(lines: list[str], key: str, value: str) -> list[str]:
    prefix = f"{key}="
    out: list[str] = []
    replaced = False
    for line in lines:
        if line.startswith(prefix):
            out.append(f"{prefix}{value}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.insert(0, f"{prefix}{value}")
    return out


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        raise SystemExit("usage: python -m aigov_py.report_fill <RUN_ID>")

    run_id = argv[1].strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    root = _repo_root()
    report_path = root / "docs" / "reports" / f"{run_id}.md"
    evidence_path = root / "docs" / "evidence" / f"{run_id}.json"

    if not report_path.exists():
        raise SystemExit(f"missing report: {report_path}")
    if not evidence_path.exists():
        raise SystemExit(f"missing evidence: {evidence_path}")

    evidence = _read_json(evidence_path)

    policy_version = _extract_policy_version_from_evidence(evidence) or ""
    bundle_sha256 = _extract_bundle_sha256(run_id, root) or ""

    content = _read_text(report_path)
    lines = content.splitlines()

    if policy_version:
        lines = _set_kv_line(lines, "policy_version", policy_version)
    if bundle_sha256:
        lines = _set_kv_line(lines, "bundle_sha256", bundle_sha256)

    filled = "\n".join(lines).rstrip() + "\n"
    _write_text(report_path, filled)

    print(f"saved {report_path}")


if __name__ == "__main__":
    main(sys.argv)
