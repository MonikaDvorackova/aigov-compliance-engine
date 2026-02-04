from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def _policy_version_from_evidence(evidence: Dict[str, Any]) -> Optional[str]:
    pv = evidence.get("policy_version")
    if isinstance(pv, str) and pv.strip():
        return pv.strip()

    events = evidence.get("events")
    if isinstance(events, list):
        for e in reversed(events):
            if not isinstance(e, dict):
                continue
            p = e.get("payload")
            if isinstance(p, dict):
                pv2 = p.get("policy_version")
                if isinstance(pv2, str) and pv2.strip():
                    return pv2.strip()
    return None


def _bundle_fingerprint(
    run_id: str,
    policy_version: str,
    evidence_sha256: str,
    evidence_chain_head_sha256: Optional[str],
) -> str:
    """
    IMPORTANT: bundle_sha256 MUST NOT depend on the report bytes.
    Otherwise the workflow requirement (report.bundle_sha256 == audit.bundle_sha256)
    becomes cyclic and unstable.
    """
    payload = {
        "run_id": run_id,
        "policy_version": policy_version,
        "evidence_sha256": evidence_sha256,
        "evidence_chain_head_sha256": evidence_chain_head_sha256,
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _sha256_bytes(raw)


def export_bundle(run_id: str) -> None:
    run_id = run_id.strip()
    if not run_id:
        raise SystemExit("run_id is required")

    root = _repo_root()

    evidence_path = root / "docs" / "evidence" / f"{run_id}.json"
    report_path = root / "docs" / "reports" / f"{run_id}.md"
    audit_dir = root / "docs" / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)

    if not evidence_path.exists():
        raise FileNotFoundError(f"Missing evidence file: {evidence_path}")
    if not report_path.exists():
        raise FileNotFoundError(f"Missing report file: {report_path}")

    evidence_obj = _load_json(evidence_path)
    policy_version = _policy_version_from_evidence(evidence_obj) or "unknown"

    evidence_sha256 = _sha256_file(evidence_path)
    report_sha256 = _sha256_file(report_path)

    chain_head: Optional[str] = None
    chain = evidence_obj.get("chain")
    if isinstance(chain, dict):
        h = chain.get("head_sha256")
        if isinstance(h, str) and h.strip():
            chain_head = h.strip()

    bundle_sha256 = _bundle_fingerprint(
        run_id=run_id,
        policy_version=policy_version,
        evidence_sha256=evidence_sha256,
        evidence_chain_head_sha256=chain_head,
    )

    audit_obj: Dict[str, Any] = {
        "run_id": run_id,
        "bundle_sha256": bundle_sha256,
        "policy_version": policy_version,
        "generated_ts_utc": _utc_now_iso(),
        "evidence_chain_head_sha256": chain_head,
        "hashes": {
            "evidence_sha256": evidence_sha256,
            "report_sha256": report_sha256,
        },
        "paths": {
            "evidence_json": f"docs/evidence/{run_id}.json",
            "report_md": f"docs/reports/{run_id}.md",
        },
    }

    audit_json_path = audit_dir / f"{run_id}.json"
    audit_bytes = json.dumps(audit_obj, ensure_ascii=False, indent=2).encode("utf-8")
    _atomic_write(audit_json_path, audit_bytes)

    print(f"saved {audit_json_path}")
    print(f"bundle_sha256={bundle_sha256}")


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        raise SystemExit("Usage: python -m aigov_py.export_bundle <run_id>")
    export_bundle(argv[1])


if __name__ == "__main__":
    main(sys.argv)
