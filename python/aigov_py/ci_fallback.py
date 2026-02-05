# python/aigov_py/ci_fallback.py

from __future__ import annotations

import datetime as dt
import json
import os
import sys
from typing import Any, Dict


def now_utc_iso() -> str:
    return (
        dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def write_json(path: str, payload: Dict[str, Any]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: python aigov_py/ci_fallback.py <run_id>", file=sys.stderr)
        return 2

    run_id = argv[1].strip()
    if not run_id:
        print("run_id is empty", file=sys.stderr)
        return 2

    repo_root = os.getcwd()
    evidence_dir = os.path.join(repo_root, "docs", "evidence")
    ensure_dir(evidence_dir)

    evidence_path = os.path.join(evidence_dir, f"{run_id}.json")

    payload: Dict[str, Any] = {
        "run_id": run_id,
        "ts_utc": now_utc_iso(),
        "system": "ci_fallback",
        "kind": "evidence_stub",
        "notes": "Auto generated stub so report_init can run. Replace with real evidence events.",
    }

    write_json(evidence_path, payload)
    print(f"saved {evidence_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
