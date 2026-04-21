from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Sequence

from govai import GovAIClient

from aigov_py import cli_config
from aigov_py import cli_exit
from aigov_py.client import GovaiClient
from aigov_py.types import AssessmentCreate, GovaiError

# Thin wrappers — same package
from aigov_py import export_bundle as export_bundle_mod
from aigov_py import fetch_bundle_from_govai
from aigov_py import report as report_mod
from aigov_py import verify as verify_mod


def _system_exit_code(se: SystemExit) -> int:
    c = se.code
    if c is None:
        return cli_exit.EX_OK
    if isinstance(c, int):
        return c
    return cli_exit.EX_INVALID


def _config_path_from_args(ns: argparse.Namespace) -> Path | None:
    raw = getattr(ns, "config", None)
    if isinstance(raw, Path):
        return raw.expanduser().resolve()
    return None


def _audit_url(ns: argparse.Namespace) -> str:
    return cli_config.resolve_audit_base_url(
        flag=getattr(ns, "audit_base_url", None) or None,
        config_path=_config_path_from_args(ns),
    )


def _api_key(ns: argparse.Namespace) -> str | None:
    return cli_config.resolve_api_key(
        flag=getattr(ns, "api_key", None) or None,
        config_path=_config_path_from_args(ns),
    )


def _resolve_run_id(ns: argparse.Namespace) -> str | None:
    rid = (getattr(ns, "run_id", None) or "").strip()
    if rid:
        return rid
    env = (os.environ.get("RUN_ID") or "").strip()
    if env:
        return env
    return None


def _print_json(data: Any, *, compact: bool) -> None:
    if compact:
        print(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="govai",
        description="GovAI Terminal SDK v0.1 — audit service workflow and assessment API.",
    )
    p.add_argument(
        "--config",
        type=Path,
        default=None,
        help=f"Path to config JSON (default: {cli_config.CONFIG_ENV} env or .govai/config.json).",
    )
    p.add_argument(
        "--audit-base-url",
        default=None,
        help="Audit / ledger service base URL (overrides config if set; env GOVAI_AUDIT_BASE_URL / AIGOV_AUDIT_URL take precedence).",
    )
    p.add_argument(
        "--api-key",
        default=None,
        help="Bearer token for the audit API (or GOVAI_API_KEY / config).",
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("GOVAI_TIMEOUT_SEC", "30")),
        help="HTTP timeout in seconds.",
    )
    p.add_argument(
        "--compact-json",
        action="store_true",
        help="Single-line JSON for assessment subcommands and compliance-summary.",
    )

    sub = p.add_subparsers(dest="cmd", required=True)

    s_init = sub.add_parser("init", help="Write .govai/config.json with audit URL and optional API key.")
    s_init.add_argument(
        "--url",
        dest="init_audit_url",
        default=cli_config.DEFAULT_AUDIT_BASE_URL,
        metavar="URL",
        help="Audit service base URL to store (default: %(default)s).",
    )
    s_init.add_argument(
        "--store-api-key",
        dest="init_api_key",
        default=None,
        help="Optional API key to store in config (plain text).",
    )

    s_verify = sub.add_parser("verify", help="Verify local docs/* artifacts and governance hash chain.")
    s_verify.add_argument("--run-id", default=None, help="Run UUID (fallback: env RUN_ID).")
    s_verify.add_argument("--json", action="store_true", help="Machine-readable output on stdout.")

    s_fetch = sub.add_parser("fetch-bundle", help="GET /bundle + /bundle-hash → docs/evidence/<run_id>.json")
    s_fetch.add_argument("--run-id", default=None, help="Run UUID (fallback: env RUN_ID).")

    s_sum = sub.add_parser("compliance-summary", help="GET /compliance-summary for a run_id.")
    s_sum.add_argument("--run-id", default=None, help="Run UUID (fallback: env RUN_ID).")

    s_report = sub.add_parser("report", help="Render docs/reports/<run_id>.md from evidence JSON.")
    s_report.add_argument("--run-id", default=None, help="Run UUID (fallback: env RUN_ID).")

    s_export = sub.add_parser("export-bundle", help="Write docs/audit + docs/packs zip for a run.")
    s_export.add_argument("--run-id", default=None, help="Run UUID (fallback: env RUN_ID).")

    c = sub.add_parser("create-assessment", help="Create a new assessment (POST /api/assessments).")
    c.add_argument("--system-name", required=True)
    c.add_argument("--intended-purpose", required=True)
    c.add_argument("--risk-class", required=True)
    c.add_argument("--team-id", default=os.environ.get("GOVAI_TEAM_ID"), help="Team UUID (or GOVAI_TEAM_ID).")
    c.add_argument("--created-by", default=os.environ.get("GOVAI_CREATED_BY"), help="User UUID (or GOVAI_CREATED_BY).")

    f = sub.add_parser("finalize", help="Finalize an assessment.")
    f.add_argument("--assessment-id", required=True)

    e = sub.add_parser("evidence", help="Request evidence bundle build for an assessment.")
    e.add_argument("--assessment-id", required=True)

    return p


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(list(argv) if argv is not None else None)

    if args.cmd == "init":
        try:
            path = _config_path_from_args(args) or cli_config.default_config_path()
            written = cli_config.save_config(
                audit_base_url=str(args.init_audit_url),
                api_key=args.init_api_key,
                path=path,
            )
        except OSError as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
            return cli_exit.EX_ERR
        out = {"ok": True, "path": str(written), "audit_base_url": str(args.init_audit_url).rstrip("/")}
        _print_json(out, compact=args.compact_json)
        return cli_exit.EX_OK

    audit_url = _audit_url(args)
    api_key = _api_key(args)

    if args.cmd == "verify":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set RUN_ID", file=sys.stderr)
            return cli_exit.EX_INVALID
        prev_audit = os.environ.get("AIGOV_AUDIT_URL")
        prev_end = os.environ.get("AIGOV_AUDIT_ENDPOINT")
        try:
            os.environ["AIGOV_AUDIT_URL"] = audit_url
            os.environ["AIGOV_AUDIT_ENDPOINT"] = audit_url
            return verify_mod.verify(run_id, as_json=args.json)
        finally:
            if prev_audit is None:
                os.environ.pop("AIGOV_AUDIT_URL", None)
            else:
                os.environ["AIGOV_AUDIT_URL"] = prev_audit
            if prev_end is None:
                os.environ.pop("AIGOV_AUDIT_ENDPOINT", None)
            else:
                os.environ["AIGOV_AUDIT_ENDPOINT"] = prev_end

    if args.cmd == "fetch-bundle":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set RUN_ID", file=sys.stderr)
            return cli_exit.EX_INVALID
        prev_audit = os.environ.get("AIGOV_AUDIT_URL")
        prev_end = os.environ.get("AIGOV_AUDIT_ENDPOINT")
        try:
            os.environ["AIGOV_AUDIT_URL"] = audit_url
            os.environ["AIGOV_AUDIT_ENDPOINT"] = audit_url
            fetch_bundle_from_govai.main(["govai", run_id])
        except SystemExit as se:
            return _system_exit_code(se)
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
            return cli_exit.EX_ERR
        finally:
            if prev_audit is None:
                os.environ.pop("AIGOV_AUDIT_URL", None)
            else:
                os.environ["AIGOV_AUDIT_URL"] = prev_audit
            if prev_end is None:
                os.environ.pop("AIGOV_AUDIT_ENDPOINT", None)
            else:
                os.environ["AIGOV_AUDIT_ENDPOINT"] = prev_end
        return cli_exit.EX_OK

    if args.cmd == "compliance-summary":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set RUN_ID", file=sys.stderr)
            return cli_exit.EX_INVALID
        try:
            client = GovAIClient(audit_url, api_key=api_key)
            out = client.request_json(
                "GET",
                "/compliance-summary",
                params={"run_id": run_id},
                raise_on_body_ok_false=False,
                timeout=args.timeout,
            )
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
            return cli_exit.EX_ERR
        _print_json(out, compact=args.compact_json)
        return cli_exit.EX_OK

    if args.cmd == "report":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set RUN_ID", file=sys.stderr)
            return cli_exit.EX_INVALID
        prev = os.environ.get("RUN_ID")
        try:
            os.environ["RUN_ID"] = run_id
            report_mod.main()
        except SystemExit as se:
            return _system_exit_code(se)
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
            return cli_exit.EX_ERR
        finally:
            if prev is None:
                os.environ.pop("RUN_ID", None)
            else:
                os.environ["RUN_ID"] = prev
        return cli_exit.EX_OK

    if args.cmd == "export-bundle":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set RUN_ID", file=sys.stderr)
            return cli_exit.EX_INVALID
        try:
            export_bundle_mod.main(["govai", run_id])
        except SystemExit as se:
            return _system_exit_code(se)
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
            return cli_exit.EX_ERR
        return cli_exit.EX_OK

    # Assessment API — same origin as audit service (Rust binary)
    client = GovaiClient(base_url=audit_url, api_key=api_key, timeout_sec=args.timeout)

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
            _print_json(out.__dict__, compact=args.compact_json)
            return cli_exit.EX_OK

        if args.cmd == "finalize":
            out = client.finalize_assessment(args.assessment_id)
            _print_json(out, compact=args.compact_json)
            return cli_exit.EX_OK

        if args.cmd == "evidence":
            out = client.build_evidence_bundle(args.assessment_id)
            _print_json(out.__dict__, compact=args.compact_json)
            return cli_exit.EX_OK

    except GovaiError as e:
        payload = {"error": str(e), "status_code": e.status_code, "details": e.details}
        print(json.dumps(payload, ensure_ascii=False, indent=2), file=sys.stderr)
        return cli_exit.EX_ERR

    return cli_exit.EX_INVALID


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
