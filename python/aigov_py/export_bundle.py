from __future__ import annotations

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

    if not evidence_path.exists():
        raise FileNotFoundError(f"Missing evidence file: {evidence_path}")
    if not report_path.exists():
        raise FileNotFoundError(f"Missing report file: {report_path}")

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

    export_bundle(argv[1])


if __name__ == "__main__":
    main(sys.argv)
