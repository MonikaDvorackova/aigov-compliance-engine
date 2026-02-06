from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, Optional


def repo_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def load_json(path: str) -> Optional[Dict[str, Any]]:
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def verify(run_id: str) -> int:
    root = repo_root()
    mode = os.environ.get("AIGOV_MODE", "ci")

    audit = load_json(os.path.join(root, "docs", "audit", f"{run_id}.json"))
    evidence = load_json(os.path.join(root, "docs", "evidence", f"{run_id}.json"))
    report = os.path.join(root, "docs", "reports", f"{run_id}.md")

    print("AIGOV VERIFICATION REPORT")
    print(f"Audit ID: {run_id}")
    print(f"Mode: {mode}")

    ok = True

    if audit is None:
        print("FAIL missing audit")
        ok = False

    if evidence is None:
        print("FAIL missing evidence")
        ok = False
    else:
        if mode == "prod" and evidence.get("system") == "ci_fallback":
            print("FAIL fallback evidence not allowed in prod")
            ok = False

    if not os.path.exists(report):
        print("FAIL missing report")
        ok = False

    if ok:
        print("VERDICT VALID")
        return 0

    print("VERDICT INVALID")
    return 2


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        return 2
    return verify(argv[1])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
