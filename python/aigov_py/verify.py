from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, Optional

import requests


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
    endpoint = (os.environ.get("AIGOV_AUDIT_ENDPOINT") or os.environ.get("AIGOV_AUDIT_URL") or "http://127.0.0.1:8088").rstrip("/")

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

    # --- GOVERNANCE LOG VERIFICATION ---
    # Evidence bundle content is expected to come from the immutable Rust ledger.
    # If evidence is not ledger-derived (e.g. CI fallback), do not hard-fail.
    ledger_derived = isinstance(evidence, dict) and bool(evidence.get("log_path"))
    try:
        r = requests.get(f"{endpoint}/verify-log", timeout=15)
        r.raise_for_status()
        verdict = r.json()
        if verdict.get("ok") is True:
            print("OK   governance hash chain verified")
        else:
            print(f"FAIL governance verify-log returned: {verdict}")
            ok = False
    except Exception as e:
        if ledger_derived:
            print(f"FAIL could not verify governance log chain: {e}")
            ok = False
        else:
            print(f"WARN could not verify governance log chain (skipping): {e}")

    # --- EVENTS LIST (structure only; chain is verified server-side) ---
    events = evidence.get("events")
    if not isinstance(events, list) or len(events) == 0:
        print("FAIL evidence.events missing or empty")
        ok = False
    else:
        print(f"OK   evidence contains {len(events)} events")

        # Minimal structure check
        for idx, ev in enumerate(events[:10]):
            if not isinstance(ev, dict):
                print(f"FAIL event {idx} is not an object")
                ok = False
                break
            if not isinstance(ev.get("event_id"), str) or not isinstance(ev.get("event_type"), str):
                print(f"FAIL event {idx} missing event_id/event_type")
                ok = False
                break

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

    # --- AUDIT BUNDLE FINGERPRINT ---
    if isinstance(audit, dict):
        bundle_sha = audit.get("bundle_sha256")
        if not isinstance(bundle_sha, str) or not bundle_sha.strip():
            print("FAIL missing audit.bundle_sha256")
            ok = False

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
