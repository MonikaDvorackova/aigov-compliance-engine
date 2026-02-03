from __future__ import annotations

import hashlib
import json
import os
import sys
import zipfile
from pathlib import Path
from typing import Any, Dict


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def _ensure_bundle_sha256_in_evidence(evidence_path: Path) -> str:
    if not evidence_path.exists():
        raise FileNotFoundError(f"evidence bundle not found: {evidence_path}")

    bundle_sha256 = _sha256_file(evidence_path)

    obj = _load_json(evidence_path)
    if not isinstance(obj, dict):
        raise RuntimeError("evidence json must be an object")

    cur = obj.get("bundle_sha256")
    if cur != bundle_sha256:
        obj["bundle_sha256"] = bundle_sha256
        _atomic_write_text(
            evidence_path,
            json.dumps(obj, ensure_ascii=False, indent=2),
        )

    return bundle_sha256


def main(argv: list[str]) -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    root = _repo_root()

    evidence_path = root / "docs" / "evidence" / f"{run_id}.json"
    report_md = root / "docs" / "reports" / f"{run_id}.md"
    report_txt = root / "docs" / "reports" / f"{run_id}.txt"
    audit_obj = root / "docs" / "audit" / f"{run_id}.json"

    bundle_sha256 = _ensure_bundle_sha256_in_evidence(evidence_path)

    report_path = report_md if report_md.exists() else report_txt
    if not report_path.exists():
        raise FileNotFoundError(f"missing report: {report_md} or {report_txt}")

    if not audit_obj.exists():
        raise FileNotFoundError(f"missing audit object: {audit_obj}")

    out_zip = root / "docs" / "packs" / f"{run_id}.zip"
    out_zip.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.write(evidence_path, arcname=f"evidence/{run_id}.json")
        z.write(report_path, arcname=f"reports/{report_path.name}")
        z.write(audit_obj, arcname=f"audit/{run_id}.json")

        meta = {
            "run_id": run_id,
            "bundle_sha256": bundle_sha256,
            "files": [
                f"evidence/{run_id}.json",
                f"reports/{report_path.name}",
                f"audit/{run_id}.json",
            ],
        }
        z.writestr("pack_meta.json", json.dumps(meta, ensure_ascii=False, indent=2))

    print(f"saved {out_zip}")


if __name__ == "__main__":
    main(sys.argv)
