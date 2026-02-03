from __future__ import annotations

import json
import os
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


@dataclass(frozen=True)
class PackInputs:
    run_id: str
    evidence_path: Path
    report_path: Path
    audit_object_path: Path
    audit_sha_path: Path
    audit_manifest_path: Path
    out_zip_path: Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _read_json(p: Path) -> Dict[str, Any]:
    return json.loads(p.read_text(encoding="utf-8"))


def _require_file(p: Path, label: str) -> None:
    if not p.exists() or not p.is_file():
        raise SystemExit(f"{label} not found: {p}")


def _sha256_file(p: Path) -> str:
    import hashlib

    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_inputs(run_id: str) -> PackInputs:
    root = _repo_root()

    evidence_path = root / "docs" / "evidence" / f"{run_id}.json"
    report_path = root / "docs" / "reports" / f"{run_id}.md"

    audit_dir = root / "docs" / "audit"
    audit_object_path = audit_dir / f"{run_id}.json"
    audit_sha_path = audit_dir / f"{run_id}.sha256"
    audit_manifest_path = audit_dir / f"{run_id}.manifest.json"

    out_zip_path = root / "docs" / "packs" / f"{run_id}.zip"

    return PackInputs(
        run_id=run_id,
        evidence_path=evidence_path,
        report_path=report_path,
        audit_object_path=audit_object_path,
        audit_sha_path=audit_sha_path,
        audit_manifest_path=audit_manifest_path,
        out_zip_path=out_zip_path,
    )


def _bundle_sha256_from_audit_or_evidence(inp: PackInputs) -> str:
    audit_obj = _read_json(inp.audit_object_path)
    v = audit_obj.get("bundle_sha256")
    if isinstance(v, str) and v.strip():
        return v.strip()

    return _sha256_file(inp.evidence_path)


def build_pack(run_id: str) -> Path:
    run_id = run_id.strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    inp = _load_inputs(run_id)

    inp.out_zip_path.parent.mkdir(parents=True, exist_ok=True)

    _require_file(inp.evidence_path, "evidence bundle")
    _require_file(inp.report_path, "report")
    _require_file(inp.audit_object_path, "audit object")
    _require_file(inp.audit_sha_path, "audit sha256")
    _require_file(inp.audit_manifest_path, "audit manifest")

    bundle_sha256 = _bundle_sha256_from_audit_or_evidence(inp)

    files_to_pack = [
        ("docs/evidence/" + inp.evidence_path.name, inp.evidence_path),
        ("docs/reports/" + inp.report_path.name, inp.report_path),
        ("docs/audit/" + inp.audit_object_path.name, inp.audit_object_path),
        ("docs/audit/" + inp.audit_sha_path.name, inp.audit_sha_path),
        ("docs/audit/" + inp.audit_manifest_path.name, inp.audit_manifest_path),
    ]

    tmp = inp.out_zip_path.with_suffix(".zip.tmp")
    if tmp.exists():
        tmp.unlink()

    with zipfile.ZipFile(tmp, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
        for arcname, p in files_to_pack:
            z.write(p, arcname=arcname)

        z.writestr(
            "PACK_INFO.txt",
            "\n".join(
                [
                    f"run_id={run_id}",
                    f"bundle_sha256={bundle_sha256}",
                ]
            )
            + "\n",
        )

    tmp.replace(inp.out_zip_path)
    return inp.out_zip_path


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required (env var)")

    out = build_pack(run_id)
    print(f"saved {out}")


if __name__ == "__main__":
    main()
