import json
import os
from datetime import datetime, timezone

import requests


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    event = {
        "event_id": f"ha_{run_id}",
        "event_type": "human_approved",
        "ts_utc": ts,
        "actor": "monika",
        "system": "aigov_poc",
        "run_id": run_id,
        "payload": {
            "scope": "model_promoted",
            "decision": "approve",
            "approver": "compliance_officer",
            "justification": "metrics meet threshold and dataset fingerprint verified",
        },
    }

    r = requests.post("http://127.0.0.1:8088/evidence", json=event, timeout=10)
    print(r.text)


if __name__ == "__main__":
    main()
