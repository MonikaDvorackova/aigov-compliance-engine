from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .chain import build_chain
from .canonical_json import canonical_bytes
from .manifest import build_manifest


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


def _chain_head_from_evidence(evidence: Dict[str, Any]) -> Optional[str]:
    """
    Computes chain head from evidence events in memory.
    Does NOT modify evidence on disk.
    """
    events = evidence.get("events")
    if not isinstance(events, list) or not events:
        return None

    cleaned: list[dict[str, Any]] = []
    for e in events:
        if not isinstance(e, dict):
            continue
        cleaned.append(e)

    if not cleaned:
        return None

    chain = build_chain(cleaned)
    head = chain.get("head_sha256")
    if isinstance(head, str) and head.strip():
        return head.strip()
    return None


def _bundle_fingerprint(
    *,
    run_id: str,
    policy_version: str,
    evidence_sha256: str,
    evidence_chain_head_sha256: Optional[str],
) -> str:
    """
    IMPORTANT:
    bundle_sha256 MUST NOT depend on report bytes.
    Otherwise it would be cyclic and unstable.
    """
    payload = {
        "run_id": run_id,
        "policy_version": policy_version,
        "evidence_sha256": evidence_sha256,
        "evidence_chain_head_sha256": evidence_chain_head_sha256 or "",
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _sha256_bytes(raw)


def export_bundle(run_id: str) -> None:
    run_id = run_id.strip()
    if not run_id:
        raise SystemExit("run_id is required")

    root = _repo_root()
    docs = root / "docs"

    evidence_path = docs / "evidence" / f"{run_id}.json"
    report_path = docs / "reports" / f"{run_id}.md"
    audit_dir = docs / "audit"
    audit_meta_dir = docs / "audit_meta"

    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_meta_dir.mkdir(parents=True, exist_ok=True)

    if not evidence_path.exists():
        raise FileNotFoundError(f"Missing evidence file: {evidence_path}")
    if not report_path.exists():
        raise FileNotFoundError(f"Missing report file: {report_path}")

    evidence_obj = _load_json(evidence_path)
    if not isinstance(evidence_obj, dict):
        raise TypeError("Evidence JSON must be an object")

    policy_version = _policy_version_from_evidence(evidence_obj) or "unknown"

    evidence_sha256 = _sha256_file(evidence_path)
    report_sha256 = _sha256_file(report_path)

    chain_head = _chain_head_from_evidence(evidence_obj)

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
    _atomic_write(
        audit_json_path,
        (json.dumps(audit_obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )

    audit_sha = _sha256_file(audit_json_path)
    audit_sha_path = audit_meta_dir / f"{run_id}.sha256"
    _atomic_write(audit_sha_path, (audit_sha + "\n").encode("utf-8"))

    manifest = build_manifest(
        run_id=run_id,
        docs_dir=docs,
        engine_version="aigov-0.1",
        policy_version=policy_version,
        signing_key="human-approval-v1",
    )
    manifest_path = audit_meta_dir / f"{run_id}.manifest.json"
    _atomic_write(manifest_path, canonical_bytes(manifest))

    print(f"saved {audit_json_path}")
    print(f"saved {audit_sha_path}")
    print(f"saved {manifest_path}")
    print(f"bundle_sha256={bundle_sha256}")


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        print("usage: python -m aigov_py.export_bundle <RUN_ID>", file=sys.stderr)
        raise SystemExit(2)
    export_bundle(argv[1])


if __name__ == "__main__":
    main(sys.argv)
