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

    audit_path = os.path.join(root, "docs", "audit", f"{run_id}.json")
    evidence_path = os.path.join(root, "docs", "evidence", f"{run_id}.json")
    report_path = os.path.join(root, "docs", "reports", f"{run_id}.md")

    print("AIGOV VERIFICATION REPORT")
    print(f"Audit ID: {run_id}")
    print(f"AIGOV_MODE: {mode}")

    ok = True

    audit = load_json(audit_path)
    evidence = load_json(evidence_path)

    # --- AUDIT FILE ---
    if audit is None:
        print("FAIL missing audit file")
        ok = False
    else:
        print("OK   audit file present")

    # --- EVIDENCE FILE ---
    if evidence is None:
        print("FAIL missing evidence file")
        ok = False
        evidence = {}
    else:
        print("OK   evidence file present")

    # --- PROD SAFETY ---
    if mode == "prod":
        if evidence.get("system") == "ci_fallback":
            print("FAIL ci_fallback evidence is forbidden in PROD")
            ok = False

    # --- EVENTS LIST ---
    events = evidence.get("events")
    if not isinstance(events, list):
        print("FAIL evidence.events missing or not a list")
        ok = False
        events = []
    elif len(events) < 2:
        print("FAIL evidence must contain at least 2 events")
        ok = False
    else:
        print(f"OK   evidence contains {len(events)} events")

    # --- LINEAR CHAIN VALIDATION ---
    prev_id: Optional[str] = None
    seen_ids = set()

    for idx, ev in enumerate(events):
        if not isinstance(ev, dict):
            print(f"FAIL event {idx} is not an object")
            ok = False
            break

        eid = ev.get("id") or ev.get("event_id")
        if not isinstance(eid, str):
            print(f"FAIL event {idx} missing id/event_id")
            ok = False
            break

        if eid in seen_ids:
            print(f"FAIL duplicate event id {eid}")
            ok = False
            break
        seen_ids.add(eid)

        prev = ev.get("prev_event_id") or ev.get("prev")
        if idx == 0:
            if prev is not None:
                print("FAIL genesis event must not have prev_event_id")
                ok = False
        else:
            if prev != prev_id:
                print(
                    f"FAIL broken chain at event {idx}: "
                    f"prev_event_id={prev} expected={prev_id}"
                )
                ok = False
                break

        prev_id = eid

    if ok:
        print("OK   event chain is linear and valid")

    # --- POLICY VERSION ---
    policy_version = None

    if isinstance(audit, dict):
        policy_version = audit.get("policy_version")

    if not policy_version and isinstance(evidence, dict):
        policy_version = evidence.get("policy_version")

    if not policy_version:
        print("FAIL missing policy_version (audit or evidence)")
        ok = False
    else:
        print(f"OK   policy_version={policy_version}")

    # --- REPORT FILE ---
    if not os.path.exists(report_path):
        print("FAIL missing report")
        ok = False
    else:
        print("OK   report file present")

    if ok:
        print("VERDICT VALID")
        return 0

    print("VERDICT INVALID")
    return 2


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python -m aigov_py.verify <RUN_ID>")
        return 2

    run_id = argv[1].strip()
    if not run_id:
        print("RUN_ID is empty")
        return 2

    return verify(run_id)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
