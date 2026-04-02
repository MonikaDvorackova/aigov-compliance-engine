from __future__ import annotations

import argparse
import json
import os
import sys

from aigov_py.client import GovaiClient
from aigov_py.types import AssessmentCreate, GovaiError


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="govai")

    p.add_argument(
        "--base-url",
        default=os.environ.get("GOVAI_BASE_URL", "http://localhost:8000"),
        help="Govai API base URL (or set GOVAI_BASE_URL).",
    )
    p.add_argument(
        "--api-key",
        default=os.environ.get("GOVAI_API_KEY"),
        help="Govai API key (or set GOVAI_API_KEY).",
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("GOVAI_TIMEOUT_SEC", "30")),
        help="HTTP timeout in seconds (or set GOVAI_TIMEOUT_SEC).",
    )

    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create-assessment", help="Create a new assessment.")
    c.add_argument("--system-name", required=True)
    c.add_argument("--intended-purpose", required=True)
    c.add_argument("--risk-class", required=True)
    c.add_argument("--team-id", default=os.environ.get("GOVAI_TEAM_ID"), help="Team UUID (or set GOVAI_TEAM_ID).")
    c.add_argument(
        "--created-by",
        default=os.environ.get("GOVAI_CREATED_BY"),
        help="User UUID (or set GOVAI_CREATED_BY).",
    )

    f = sub.add_parser("finalize", help="Finalize an assessment.")
    f.add_argument("--assessment-id", required=True)

    e = sub.add_parser("evidence", help="Build evidence bundle for an assessment.")
    e.add_argument("--assessment-id", required=True)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    client = GovaiClient(base_url=args.base_url, api_key=args.api_key, timeout_sec=args.timeout)

    try:
        if args.cmd == "create-assessment":
            out = client.create_assessment(
                AssessmentCreate(
                    system_name=args.system_name,
                    intended_purpose=args.intended_purpose,
                    risk_class=args.risk_class,
                    team_id=args.team_id,
                    created_by=args.created_by,
                )
            )
            print(json.dumps(out.__dict__, ensure_ascii=False, indent=2))
            return 0

        if args.cmd == "finalize":
            out = client.finalize_assessment(args.assessment_id)
            print(json.dumps(out, ensure_ascii=False, indent=2))
            return 0

        if args.cmd == "evidence":
            out = client.build_evidence_bundle(args.assessment_id)
            print(json.dumps(out.__dict__, ensure_ascii=False, indent=2))
            return 0

        return 2

    except GovaiError as e:
        payload = {
            "error": str(e),
            "status_code": e.status_code,
            "details": e.details,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
