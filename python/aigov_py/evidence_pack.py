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
    out_zip_path: Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _sha256_hex(data: bytes) -> str:
    import hashlib
    return hashlib.sha256(data).hexdigest()


def _read_json(p: Path) -> Dict[str, Any]:
    return json.loads(p.read_text(encoding="utf-8"))


def _require_file(p: Path, label: str) -> None:
    if not p.exists() or not p.is_file():
        raise SystemExit(f"{label} not found: {p}")


def _load_inputs(run_id: str) -> PackInputs:
    root = _repo_root()

    evidence = root / "docs" / "evidence" / f"{run_id}.json"
    report = root / "docs" / "reports" / f"{run_id}.md"
    audit_obj = root / "docs" / "audit" / f"{run_id}.json"
    out_zip = root / "docs" / "packs" / f"{run_id}.zip"

    return PackInputs(
        run_id=run_id,
        evidence_path=evidence,
        report_path=report,
        audit_object_path=audit_obj,
        out_zip_path=out_zip,
    )


def _validate_consistency(inp: PackInputs) -> Dict[str, Any]:
    _require_file(inp.evidence_path, "evidence bundle")
    _require_file(inp.report_path, "audit report")
    _require_file(inp.audit_object_path, "audit object")

    bundle = _read_json(inp.evidence_path)
    audit_obj = _read_json(inp.audit_object_path)

    if str(bundle.get("run_id", "")) != inp.run_id:
        raise SystemExit("evidence bundle run_id mismatch")

    if str(audit_obj.get("run_id", "")) != inp.run_id:
        raise SystemExit("audit object run_id mismatch")

    bsha = str(bundle.get("bundle_sha256", "")).strip()
    asha = str(audit_obj.get("bundle_sha256", "")).strip()

    if not bsha:
        raise SystemExit("evidence bundle missing bundle_sha256")

    if not asha:
        raise SystemExit("audit object missing bundle_sha256")

    if bsha != asha:
        raise SystemExit(
            "bundle_sha256 mismatch between evidence bundle and audit object\n"
            f"bundle={bsha}\n"
            f"audit ={asha}"
        )

    report_head = inp.report_path.read_text(encoding="utf-8").splitlines()[:20]
    r_run = ""
    r_sha = ""
    for line in report_head:
        if line.startswith("run_id="):
            r_run = line.split("=", 1)[1].strip()
        if line.startswith("bundle_sha256="):
            r_sha = line.split("=", 1)[1].strip()

    if r_run and r_run != inp.run_id:
        raise SystemExit("report run_id mismatch")

    if r_sha and r_sha != bsha:
        raise SystemExit("report bundle_sha256 mismatch")

    return {
        "run_id": inp.run_id,
        "bundle_sha256": bsha,
        "policy_version": str(bundle.get("policy_version", "")).strip(),
    }


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    inp = _load_inputs(run_id)
    meta = _validate_consistency(inp)

    inp.out_zip_path.parent.mkdir(parents=True, exist_ok=True)

    manifest = {
        "run_id": meta["run_id"],
        "bundle_sha256": meta["bundle_sha256"],
        "policy_version": meta["policy_version"],
        "files": {
            "evidence_bundle": f"docs/evidence/{run_id}.json",
            "audit_object": f"docs/audit/{run_id}.json",
            "audit_report": f"docs/reports/{run_id}.md",
        },
    }

    manifest_bytes = json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    manifest_sha256 = _sha256_hex(manifest_bytes)

    with zipfile.ZipFile(inp.out_zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.write(inp.evidence_path, arcname=f"docs/evidence/{run_id}.json")
        z.write(inp.audit_object_path, arcname=f"docs/audit/{run_id}.json")
        z.write(inp.report_path, arcname=f"docs/reports/{run_id}.md")
        z.writestr("manifest.json", manifest_bytes)

    print(f"saved {inp.out_zip_path}")
    print(f"manifest_sha256={manifest_sha256}")


if __name__ == "__main__":
    main()
