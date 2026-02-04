from __future__ import annotations

<<<<<<< HEAD
import json
import sys
from pathlib import Path
from typing import Any

from .chain import build_chain
from .crypto import canonical_json_bytes, sha256_file
from .manifest import build_manifest


def _find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for _ in range(10):
        if (cur / "docs").exists():
            return cur
        cur = cur.parent
    raise FileNotFoundError("Could not locate repo root with docs/ directory")


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, obj: Any, *, canonical: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if canonical:
        data = canonical_json_bytes(obj)
        path.write_bytes(data)
    else:
        path.write_text(
            json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def export_bundle(run_id: str) -> None:
    repo_root = _find_repo_root(Path.cwd())
    docs = repo_root / "docs"

    evidence_path = docs / "evidence" / f"{run_id}.json"
    audit_path = docs / "audit" / f"{run_id}.json"
    report_path = docs / "reports" / f"{run_id}.md"
=======
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
>>>>>>> origin/main

    if not evidence_path.exists():
        raise FileNotFoundError(f"Missing evidence file: {evidence_path}")
    if not report_path.exists():
        raise FileNotFoundError(f"Missing report file: {report_path}")

<<<<<<< HEAD
    # Load evidence
    evidence = _load_json(evidence_path)
    if not isinstance(evidence, dict):
        raise TypeError("Evidence JSON must be an object")

    # Build chain of custody from events (if present)
    events = evidence.get("events", [])
    if isinstance(events, list) and events:
        evidence["chain"] = build_chain(events)
    else:
        evidence["chain"] = {"head_sha256": "", "events": []}

    # Persist evidence as canonical JSON because we modified it by adding chain
    _write_json(evidence_path, evidence, canonical=True)

    # Extract chain head for audit metadata
    chain_head = ""
    chain = evidence.get("chain")
    if isinstance(chain, dict):
        chain_head = str(chain.get("head_sha256", ""))

    # Build canonical audit object (metadata only, no embedded evidence payload)
    audit = {
        "run_id": run_id,
        "engine": {
            "name": "aigov",
            "version": "0.1",
        },
        "report_sha256": sha256_file(report_path),
        "evidence_sha256": sha256_file(evidence_path),
        "evidence_chain_head_sha256": chain_head,
    }

    # Write canonical audit json
    _write_json(audit_path, audit, canonical=True)

    # Write audit sha256
    audit_sha = sha256_file(audit_path)
    sha_path = audit_path.with_suffix(".sha256")
    _write_text(sha_path, audit_sha)

    # Build manifest
    manifest = build_manifest(
        run_id=run_id,
        docs_dir=docs,
        engine_version="aigov-0.1",
        policy_version=None,
        signing_key="human-approval-v1",
    )

    manifest_path = docs / "audit" / f"{run_id}.manifest.json"
    _write_json(manifest_path, manifest)

    print(f"saved {audit_path}")
    print(f"saved {sha_path}")
    print(f"saved {manifest_path}")
    print(f"audit_sha256={audit_sha}")


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        print("usage: python -m aigov_py.export_bundle <RUN_ID>", file=sys.stderr)
        raise SystemExit(2)

=======
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
>>>>>>> origin/main
    export_bundle(argv[1])


if __name__ == "__main__":
    main(sys.argv)
