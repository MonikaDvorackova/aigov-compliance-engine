# python/aigov_py/ci_fallback.py

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import sys
from typing import Optional, Tuple


def sha256_file(path: str) -> str | None:
    if not os.path.exists(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def utc_now() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def parse_report_kv(report_path: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts:
      bundle_sha256=<hex>
      policy_version=<string>
    from the report markdown. Lines may contain extra whitespace.
    """
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
    report_sha = sha256_file(report_path)

    bundle_sha256, policy_version = parse_report_kv(report_path)

    # Minimal audit schema required by verify:
    # - bundle_sha256
    # - policy_version
    # plus whatever else your project already tolerates.
    if not os.path.exists(audit_path):
        with open(audit_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "run_id": run_id,
                    "ts_utc": ts,
                    "source": "ci_fallback",
                    "report_sha256": report_sha,
                    "bundle_sha256": bundle_sha256,
                    "policy_version": policy_version,
                    "version": 1,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
    else:
        # If it exists but misses required keys, patch it in place.
        with open(audit_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except Exception:
                data = {}

        changed = False
        if "bundle_sha256" not in data:
            data["bundle_sha256"] = bundle_sha256
            changed = True
        if "policy_version" not in data:
            data["policy_version"] = policy_version
            changed = True
        if "report_sha256" not in data:
            data["report_sha256"] = report_sha
            changed = True
        if "run_id" not in data:
            data["run_id"] = run_id
            changed = True

        if changed:
            with open(audit_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

    # Minimal evidence schema required by verify:
    # - events: []
    if not os.path.exists(evidence_path):
        with open(evidence_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "run_id": run_id,
                    "ts_utc": ts,
                    "source": "ci_fallback",
                    "events": [],
                    "version": 1,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
    else:
        with open(evidence_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except Exception:
                data = {}

        changed = False
        if "events" not in data:
            data["events"] = []
            changed = True
        if "run_id" not in data:
            data["run_id"] = run_id
            changed = True

        if changed:
            with open(evidence_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)


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
