from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from .crypto import sha256_file


@dataclass(frozen=True)
class Artifact:
    rel_path: str
    sha256: str


def _rel(from_dir: Path, p: Path) -> str:
    return p.resolve().relative_to(from_dir.resolve()).as_posix()


def build_manifest(
    run_id: str,
    docs_dir: Path,
    engine_version: str,
    policy_version: Optional[str],
    signing_key: str,
) -> Dict:
    """
    Creates a manifest that points to artifacts under docs/.
    Expected artifacts:
      docs/audit/<RUN_ID>.json
      docs/evidence/<RUN_ID>.json
      docs/reports/<RUN_ID>.md
    """
    audit_json = docs_dir / "audit" / f"{run_id}.json"
    evidence_json = docs_dir / "evidence" / f"{run_id}.json"
    report_md = docs_dir / "reports" / f"{run_id}.md"

    missing = [p for p in [audit_json, evidence_json, report_md] if not p.exists()]
    if missing:
        msg = "Missing required artifacts: " + ", ".join(str(p) for p in missing)
        raise FileNotFoundError(msg)

    artifacts = [
        Artifact(rel_path=_rel(docs_dir, audit_json), sha256=sha256_file(audit_json)),
        Artifact(rel_path=_rel(docs_dir, evidence_json), sha256=sha256_file(evidence_json)),
        Artifact(rel_path=_rel(docs_dir, report_md), sha256=sha256_file(report_md)),
    ]

    manifest = {
        "run_id": run_id,
        "engine_version": engine_version,
        "policy_version": policy_version or "",
        "signing_key": signing_key,
        "artifacts": {a.rel_path: a.sha256 for a in artifacts},
    }
    return manifest
