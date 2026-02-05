# python/aigov_py/ci_fallback.py

from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
from typing import Optional, Tuple


def utc_now() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def parse_report_kv(report_path: str) -> Tuple[Optional[str], Optional[str]]:
    if not os.path.exists(report_path):
        return None, None

    bundle = None
    policy = None

    re_bundle = re.compile(r"^\s*bundle_sha256\s*=\s*([0-9a-fA-F]{16,})\s*$")
    re_policy = re.compile(r"^\s*policy_version\s*=\s*(.+?)\s*$")

    with open(report_path, "r", encoding="utf-8") as f:
        for line in f:
            m1 = re_bundle.match(line)
            if m1:
                bundle = m1.group(1).strip()
                continue
            m2 = re_policy.match(line)
            if m2:
                policy = m2.group(1).strip()
                continue

    return bundle, policy


def ensure_docs(repo_root: str, run_id: str) -> None:
    report_path = os.path.join(repo_root, "docs", "reports", f"{run_id}.md")
    audit_path = os.path.join(repo_root, "docs", "audit", f"{run_id}.json")
    evidence_path = os.path.join(repo_root, "docs", "evidence", f"{run_id}.json")

    os.makedirs(os.path.dirname(audit_path), exist_ok=True)
    os.makedirs(os.path.dirname(evidence_path), exist_ok=True)

    ts = utc_now()
    bundle_sha256, policy_version = parse_report_kv(report_path)

    # ---------------- AUDIT ----------------
    audit = {
        "run_id": run_id,
        "ts_utc": ts,
        "bundle_sha256": bundle_sha256,
        "policy_version": policy_version,
        "version": 1,
    }

    with open(audit_path, "w", encoding="utf-8") as f:
        json.dump(audit, f, ensure_ascii=False, indent=2)

    # ---------------- EVIDENCE ----------------
    # IMPORTANT:
    # verify expects chain.head to be a FULL NODE, not a reference

    head_node = {
        "id": run_id,
        "prev": None,
        "ts_utc": ts,
        "type": "genesis",
    }

    evidence = {
        "run_id": run_id,
        "ts_utc": ts,
        "events": [],
        "chain": {
            "head": head_node,
            "events": [],
        },
        "version": 1,
    }

    with open(evidence_path, "w", encoding="utf-8") as f:
        json.dump(evidence, f, ensure_ascii=False, indent=2)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python aigov_py/ci_fallback.py <RUN_ID>")
        return 2

    run_id = argv[1].strip()
    if not run_id:
        print("RUN_ID is empty")
        return 2

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ensure_docs(repo_root, run_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
