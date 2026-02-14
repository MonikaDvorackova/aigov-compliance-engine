from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from aigov_py.supabase_db import upsert_run_row


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_report_kv(report_path: Path) -> Dict[str, str]:
    kv: Dict[str, str] = {}
    if not report_path.exists():
        return kv
    for raw in report_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip()
        if k:
            kv[k] = v
    return kv


def _detect_mode() -> str:
    mode = os.environ.get("AIGOV_MODE", "ci").strip().lower()
    if mode not in ("ci", "prod"):
        mode = "ci"
    return mode


def _evidence_source(evidence: Dict[str, Any]) -> str:
    system = evidence.get("system")
    if isinstance(system, str) and system.strip() == "ci_fallback":
        return "ci_fallback"
    return "real"


def _status_from_env_or_default() -> str:
    """
    IMPORTANT:
    DB has a CHECK constraint (runs_status_check).
    Do NOT emit values outside allowed set.

    Default here is "valid" because db_ingest is intended to be executed
    for already verified runs.
    """
    v = os.environ.get("AIGOV_VERDICT", "").strip().lower()
    if v in ("valid", "invalid"):
        return v
    return "valid"


def build_run_row(run_id: str) -> Tuple[Dict[str, Any], Optional[str]]:
    run_id = run_id.strip()
    if not run_id:
        return {}, "run_id is empty"

    root = _repo_root()

    audit_path = root / "docs" / "audit" / f"{run_id}.json"
    evidence_path = root / "docs" / "evidence" / f"{run_id}.json"
    report_path = root / "docs" / "reports" / f"{run_id}.md"

    if not audit_path.exists():
        return {}, f"missing audit file: {audit_path}"
    if not evidence_path.exists():
        return {}, f"missing evidence file: {evidence_path}"
    if not report_path.exists():
        return {}, f"missing report file: {report_path}"

    audit = _load_json(audit_path)
    evidence = _load_json(evidence_path)
    report_kv = _read_report_kv(report_path)

    mode = _detect_mode()

    policy_version: str = "unknown"
    if isinstance(audit.get("policy_version"), str) and audit["policy_version"].strip():
        policy_version = audit["policy_version"].strip()
    elif isinstance(report_kv.get("policy_version"), str) and report_kv["policy_version"].strip():
        policy_version = report_kv["policy_version"].strip()

    bundle_sha256: str = "unknown"
    if isinstance(audit.get("bundle_sha256"), str) and audit["bundle_sha256"].strip():
        bundle_sha256 = audit["bundle_sha256"].strip()
    elif isinstance(report_kv.get("bundle_sha256"), str) and report_kv["bundle_sha256"].strip():
        bundle_sha256 = report_kv["bundle_sha256"].strip()

    hashes = audit.get("hashes") if isinstance(audit.get("hashes"), dict) else {}
    evidence_sha256 = hashes.get("evidence_sha256") if isinstance(hashes.get("evidence_sha256"), str) else None
    report_sha256 = hashes.get("report_sha256") if isinstance(hashes.get("report_sha256"), str) else None

    row: Dict[str, Any] = {
        "id": run_id,
        "created_at": _utc_now_iso(),
        "mode": mode,
        "status": _status_from_env_or_default(),
        "policy_version": policy_version,
        "bundle_sha256": bundle_sha256,
        "evidence_sha256": evidence_sha256,
        "report_sha256": report_sha256,
        "evidence_source": _evidence_source(evidence),
        "closed_at": _utc_now_iso(),
    }

    if row["evidence_sha256"] is None:
        row.pop("evidence_sha256", None)
    if row["report_sha256"] is None:
        row.pop("report_sha256", None)

    return row, None


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python -m aigov_py.ingest_run <RUN_ID>", file=sys.stderr)
        return 2

    run_id = argv[1].strip()
    row, err = build_run_row(run_id)
    if err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 2

    print("ROW BEING UPSERTED:")
    print(row)

    upsert_run_row(row)
    print(f"ingested run {run_id} into Supabase")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
