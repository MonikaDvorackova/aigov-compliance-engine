# python/aigov_py/ci_fallback.py

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import sys


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


def ensure_docs(repo_root: str, run_id: str) -> None:
    report_path = os.path.join(repo_root, "docs", "reports", f"{run_id}.md")
    audit_path = os.path.join(repo_root, "docs", "audit", f"{run_id}.json")
    evidence_path = os.path.join(repo_root, "docs", "evidence", f"{run_id}.json")

    os.makedirs(os.path.dirname(audit_path), exist_ok=True)
    os.makedirs(os.path.dirname(evidence_path), exist_ok=True)

    ts = utc_now()
    report_sha = sha256_file(report_path)

    if not os.path.exists(audit_path):
        with open(audit_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "run_id": run_id,
                    "ts_utc": ts,
                    "source": "ci_fallback",
                    "report_sha256": report_sha,
                    "version": 1,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

    if not os.path.exists(evidence_path):
        with open(evidence_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "run_id": run_id,
                    "ts_utc": ts,
                    "source": "ci_fallback",
                    "items": [],
                    "version": 1,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )


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
