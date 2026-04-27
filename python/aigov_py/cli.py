from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from govai import (
    GovAIAPIError,
    GovAIClient,
    GovAIHTTPError,
    __version__,
    export_run,
    get_usage,
    get_compliance_summary,
    submit_event,
)

from aigov_py import cli_config
from aigov_py import cli_exit
from aigov_py.client import GovaiClient
from aigov_py.discovery_scan import scan_repo
from aigov_py.prototype_domain import (
    approved_human_event_id_for_run,
    assessment_id_for_run,
    model_version_id_for_run,
    risk_id_for_run,
)
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
    env = (os.environ.get("GOVAI_RUN_ID") or os.environ.get("RUN_ID") or "").strip()
    if env:
        return env
    return None


def _print_json(data: Any, *, compact: bool) -> None:
    if compact:
        print(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))


def _utc_now_z() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_payload_one_of(*, payload_file: str | None, payload_json: str | None) -> dict[str, Any]:
    pf = (payload_file or "").strip() or None
    pj = (payload_json or "").strip() or None
    if (pf is None and pj is None) or (pf is not None and pj is not None):
        raise ValueError("exactly one payload source required: --payload-file OR --payload-json")
    if pf is not None:
        raw = Path(pf).expanduser().read_text(encoding="utf-8")
        obj = json.loads(raw)
    else:
        obj = json.loads(pj or "")
    if not isinstance(obj, dict):
        raise TypeError("payload must be a JSON object")
    return obj


def _parse_bool_override(raw: str | None, *, name: str) -> bool | None:
    if raw is None:
        return None
    value = str(raw).strip().lower()
    if value in {"true", "1", "yes", "y", "on"}:
        return True
    if value in {"false", "0", "no", "n", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


def _coerce_findings(scan_result: Any) -> list[dict[str, Any]]:
    findings = getattr(scan_result, "findings", None)
    if findings is None and isinstance(scan_result, dict):
        findings = scan_result.get("findings")
    if not isinstance(findings, list):
        return []

    out: list[dict[str, Any]] = []
    for item in findings:
        if isinstance(item, dict):
            out.append(item)
        else:
            out.append(
                {
                    "type": getattr(item, "type", None),
                    "file": getattr(item, "file", None),
                    "reason": getattr(item, "reason", None),
                }
            )
    return out


def _signal_from_scan(scan_result: Any, key: str) -> bool:
    if isinstance(scan_result, dict):
        return bool(scan_result.get(key, False))
    return bool(getattr(scan_result, key, False))


def _demo_event_id(kind: str, run_id: str) -> str:
    return f"demo_{kind}_{run_id}"


def run_demo(audit_url: str, api_key: str | None) -> int:
    """``govai run demo``: submit a full compliance sequence; print server verdict."""
    actor = (os.environ.get("AIGOV_ACTOR") or "govai_demo").strip() or "govai_demo"
    system = (os.environ.get("AIGOV_SYSTEM") or "govai_demo_cli").strip() or "govai_demo_cli"

    run_id = str(uuid.uuid4())
    dataset_gov: dict[str, Any] = {
        "ai_system_id": "expense-ai",
        "dataset_id": "expense_dataset_v1",
        "dataset": "customer_expense_records",
        "dataset_version": "v1",
        "dataset_fingerprint": "sha256:demo",
        "dataset_governance_id": "gov_expense_v1",
        "dataset_governance_commitment": "basic_compliance",
        "source": "internal",
        "intended_use": "expense classification",
        "limitations": "demo dataset",
        "quality_summary": "validated sample",
        "governance_status": "registered",
    }
    ai_system_id = dataset_gov["ai_system_id"]
    dataset_id = dataset_gov["dataset_id"]
    dataset_commitment = dataset_gov["dataset_governance_commitment"]
    model_version_id = model_version_id_for_run(run_id)
    assessment_id = assessment_id_for_run(run_id)
    risk_id = risk_id_for_run(run_id)
    risk_class = (os.environ.get("AIGOV_RISK_CLASS") or "high").strip() or "high"
    severity = float(os.environ.get("AIGOV_RISK_SEVERITY", "4"))
    likelihood = float(os.environ.get("AIGOV_RISK_LIKELIHOOD", "0.3"))
    owner = (os.environ.get("AIGOV_RISK_OWNER") or "risk_owner").strip() or "risk_owner"
    reviewer = (os.environ.get("AIGOV_RISK_REVIEWER") or "risk_officer").strip() or "risk_officer"
    justification = (
        "Dataset governance commitment verified; evaluation threshold and human oversight requested before promotion."
    )
    risk_recorded_payload = {
        "assessment_id": assessment_id,
        "ai_system_id": ai_system_id,
        "dataset_id": dataset_id,
        "model_version_id": model_version_id,
        "risk_id": risk_id,
        "risk_class": risk_class,
        "severity": severity,
        "likelihood": likelihood,
        "status": "submitted",
        "mitigation": "Establish evaluation threshold and require human promotion approval.",
        "owner": owner,
        "dataset_governance_commitment": dataset_commitment,
    }
    risk_mitigated_payload = {
        "assessment_id": assessment_id,
        "ai_system_id": ai_system_id,
        "dataset_id": dataset_id,
        "model_version_id": model_version_id,
        "risk_id": risk_id,
        "status": "mitigated",
        "mitigation": "Mitigation applied: restrict intended use to the governed demo scope + enforce passed evaluation gate.",
        "dataset_governance_commitment": dataset_commitment,
    }
    risk_reviewed_payload = {
        "assessment_id": assessment_id,
        "ai_system_id": ai_system_id,
        "dataset_id": dataset_id,
        "model_version_id": model_version_id,
        "risk_id": risk_id,
        "decision": "approve",
        "reviewer": reviewer,
        "justification": justification,
        "dataset_governance_commitment": dataset_commitment,
    }
    human_event_id = approved_human_event_id_for_run(run_id)
    artifact_path = f"python/artifacts/model_{run_id}.joblib"

    # Policy requires risk_recorded → risk_mitigated → risk_reviewed before human_approved / model_promoted.
    seq: list[dict[str, Any]] = [
        {
            "event_id": _demo_event_id("data_registered", run_id),
            "event_type": "data_registered",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": {
                "ai_system_id": ai_system_id,
                "dataset_id": dataset_id,
                "dataset": dataset_gov["dataset"],
                "dataset_version": dataset_gov["dataset_version"],
                "dataset_fingerprint": dataset_gov["dataset_fingerprint"],
                "dataset_governance_id": dataset_gov["dataset_governance_id"],
                "dataset_governance_commitment": dataset_commitment,
                "source": dataset_gov["source"],
                "intended_use": dataset_gov["intended_use"],
                "limitations": dataset_gov["limitations"],
                "quality_summary": dataset_gov["quality_summary"],
                "governance_status": dataset_gov["governance_status"],
            },
        },
        {
            "event_id": _demo_event_id("model_trained", run_id),
            "event_type": "model_trained",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": {
                "model_version_id": model_version_id,
                "ai_system_id": ai_system_id,
                "dataset_id": dataset_id,
                "model_type": "LogisticRegression",
                "artifact_path": artifact_path,
                "artifact_sha256": "govai_cli_demo_deterministic_placeholder",
            },
        },
        {
            "event_id": _demo_event_id("evaluation_reported", run_id),
            "event_type": "evaluation_reported",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": {
                "ai_system_id": ai_system_id,
                "dataset_id": dataset_id,
                "model_version_id": model_version_id,
                "metric": "accuracy",
                "value": 0.95,
                "threshold": 0.8,
                "passed": True,
            },
        },
        {
            "event_id": _demo_event_id("risk_recorded", run_id),
            "event_type": "risk_recorded",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": risk_recorded_payload,
        },
        {
            "event_id": _demo_event_id("risk_mitigated", run_id),
            "event_type": "risk_mitigated",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": risk_mitigated_payload,
        },
        {
            "event_id": _demo_event_id("risk_reviewed", run_id),
            "event_type": "risk_reviewed",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": risk_reviewed_payload,
        },
        {
            "event_id": human_event_id,
            "event_type": "human_approved",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": {
                "scope": "model_promoted",
                "decision": "approve",
                "approved": True,
                "approver": "compliance_officer",
                "justification": "evaluation passed; risk review complete; approve promotion (cli demo).",
                "ai_system_id": ai_system_id,
                "dataset_id": dataset_id,
                "model_version_id": model_version_id,
                "assessment_id": assessment_id,
                "risk_id": risk_id,
                "dataset_governance_commitment": dataset_commitment,
            },
        },
        {
            "event_id": _demo_event_id("model_promoted", run_id),
            "event_type": "model_promoted",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": {
                "artifact_path": artifact_path,
                "promotion_reason": "approved_by_human",
                "ai_system_id": ai_system_id,
                "dataset_id": dataset_id,
                "model_version_id": model_version_id,
                "assessment_id": assessment_id,
                "risk_id": risk_id,
                "dataset_governance_commitment": dataset_commitment,
                "approved_human_event_id": human_event_id,
            },
        },
    ]

    client = GovAIClient(audit_url, api_key=api_key)
    try:
        for ev in seq:
            submit_event(client, ev)
        summary = get_compliance_summary(client, run_id)
    except (GovAIAPIError, GovAIHTTPError, OSError, TypeError, ValueError):
        return cli_exit.EX_ERR

    if isinstance(summary, dict) and summary.get("ok") is False:
        print(summary.get("message") or summary.get("error") or "error: /compliance-summary failed", file=sys.stderr)
        return cli_exit.EX_ERR

    verdict = summary.get("verdict") if isinstance(summary, dict) else None
    if not isinstance(verdict, str) or not verdict.strip():
        print("error: /compliance-summary missing verdict", file=sys.stderr)
        return cli_exit.EX_ERR

    verdict = verdict.strip()
    print(verdict)
    return cli_exit.EX_OK if verdict == "VALID" else cli_exit.EX_ERR


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="govai",
        description=f"GovAI Terminal SDK — audit service workflow and assessment API (v{__version__}).",
    )
    p.add_argument(
        "--version",
        "-V",
        action="version",
        version=__version__,
        help="Print the package version and exit.",
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

    sub = p.add_subparsers(dest="cmd", required=False, metavar="COMMAND")

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

    s_run = sub.add_parser("run", help="Run scripted flows against the audit service.")
    s_run_sub = s_run.add_subparsers(dest="run_cmd", required=True)
    s_run_sub.add_parser("demo", help="Full evidence sequence for one run; prints VALID or BLOCKED.")

    s_verify = sub.add_parser("verify", help="Verify local docs/* artifacts and governance hash chain.")
    s_verify.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")
    s_verify.add_argument("--json", action="store_true", help="Machine-readable output on stdout.")

    s_fetch = sub.add_parser("fetch-bundle", help="GET /bundle + /bundle-hash → docs/evidence/<run_id>.json")
    s_fetch.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")

    s_sum = sub.add_parser("compliance-summary", help="GET /compliance-summary for a run_id.")
    s_sum.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")

    s_check = sub.add_parser(
        "check",
        help="Check compliance decision (VALID / INVALID / BLOCKED). Exit 0 only if VALID.",
    )
    s_check.add_argument(
        "--run-id",
        dest="check_run_id",
        default=None,
        help="Run UUID (overrides positional / GOVAI_RUN_ID / RUN_ID).",
    )
    s_check.add_argument("run_id", nargs="?", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")

    s_submit = sub.add_parser("submit-evidence", help="Submit one evidence event to POST /evidence.")
    s_submit.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")
    s_submit.add_argument("--event-type", required=True, help="Evidence event type (e.g. ai_discovery_reported).")
    s_submit.add_argument("--payload-file", default=None, help="Path to JSON file containing payload object.")
    s_submit.add_argument("--payload-json", default=None, help="Inline JSON object payload.")
    s_submit.add_argument("--event-id", default=None, help="Optional event_id override (default: uuid4).")
    s_submit.add_argument(
        "--actor",
        default=os.environ.get("AIGOV_ACTOR") or "govai_cli",
        help="Evidence actor label (default: env AIGOV_ACTOR or govai_cli).",
    )
    s_submit.add_argument(
        "--system",
        default=os.environ.get("AIGOV_SYSTEM") or "govai_cli",
        help="Evidence system label (default: env AIGOV_SYSTEM or govai_cli).",
    )

    s_discover = sub.add_parser(
        "discover",
        help="Scan a repo deterministically and record ai_discovery_reported for the run.",
    )
    s_discover.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")
    s_discover.add_argument("--path", default=".", help="Path to scan (default: current directory).")
    s_discover.add_argument("--openai", default=None, help="Override scan result: true|false")
    s_discover.add_argument("--transformers", default=None, help="Override scan result: true|false")
    s_discover.add_argument("--model-artifacts", default=None, help="Override scan result: true|false")
    s_discover.add_argument(
        "--event-id",
        default=None,
        help="Optional event_id override (default: deterministic ai_discovery_reported_<run_id>).",
    )
    s_discover.add_argument(
        "--actor",
        default=os.environ.get("AIGOV_ACTOR") or "govai_cli",
        help="Evidence actor label (default: env AIGOV_ACTOR or govai_cli).",
    )
    s_discover.add_argument(
        "--system",
        default=os.environ.get("AIGOV_SYSTEM") or "govai_cli",
        help="Evidence system label (default: env AIGOV_SYSTEM or govai_cli).",
    )

    s_explain = sub.add_parser(
        "explain",
        help="Explain verdict + requirements + blocked reasons (CI-friendly).",
    )
    s_explain.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")

    s_report = sub.add_parser("report", help="Render docs/reports/<run_id>.md from evidence JSON.")
    s_report.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")

    s_export = sub.add_parser("export-bundle", help="Write docs/audit + docs/packs zip for a run.")
    s_export.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")

    s_export_run = sub.add_parser(
        "export-run",
        help="GET /api/export/:run_id (machine-readable JSON).",
    )
    s_export_run.add_argument("--run-id", default=None, help="Run UUID (fallback: env GOVAI_RUN_ID or RUN_ID).")
    s_export_run.add_argument(
        "--project",
        default=os.environ.get("GOVAI_PROJECT"),
        help="Optional X-GovAI-Project header (or GOVAI_PROJECT).",
    )

    s_usage = sub.add_parser("usage", help="GET /usage (machine-readable JSON).")
    s_usage.add_argument(
        "--project",
        default=os.environ.get("GOVAI_PROJECT"),
        help="Optional X-GovAI-Project header (or GOVAI_PROJECT).",
    )

    c = sub.add_parser("create-assessment", help="Create a new assessment (POST /api/assessments).")
    c.add_argument("--system-name", required=True)
    c.add_argument("--intended-purpose", required=True)
    c.add_argument("--risk-class", required=True)
    c.add_argument("--team-id", default=os.environ.get("GOVAI_TEAM_ID"), help="Team UUID (or GOVAI_TEAM_ID).")
    c.add_argument("--created-by", default=os.environ.get("GOVAI_CREATED_BY"), help="User UUID (or GOVAI_CREATED_BY).")

    return p


def main(argv: Sequence[str] | None = None) -> int:
    args_list = list(argv if argv is not None else sys.argv[1:])
    parser = build_parser()
    try:
        args = parser.parse_args(args_list)
    except SystemExit as se:
        return _system_exit_code(se)

    if args.cmd is None:
        parser.print_help()
        return cli_exit.EX_OK

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

    if args.cmd == "run" and getattr(args, "run_cmd", None) == "demo":
        audit_url = _audit_url(args)
        api_key = _api_key(args)
        return run_demo(audit_url, api_key)

    audit_url = _audit_url(args)
    api_key = _api_key(args)

    if args.cmd == "verify":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set GOVAI_RUN_ID (or RUN_ID)", file=sys.stderr)
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
            print("run id required: pass --run-id or set GOVAI_RUN_ID (or RUN_ID)", file=sys.stderr)
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
            print("run id required: pass --run-id or set GOVAI_RUN_ID (or RUN_ID)", file=sys.stderr)
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

    if args.cmd == "check":
        opt = (getattr(args, "check_run_id", None) or "").strip()
        run_id = opt or _resolve_run_id(args)
        if not run_id:
            print("run id required", file=sys.stderr)
            return cli_exit.EX_INVALID
        try:
            client = GovAIClient(audit_url, api_key=api_key)
            summary = get_compliance_summary(client, run_id, timeout=args.timeout)
        except Exception as e:
            print(str(e), file=sys.stderr)
            return cli_exit.EX_ERR

        if not isinstance(summary, dict):
            print("error: expected object from /compliance-summary", file=sys.stderr)
            return cli_exit.EX_ERR

        if summary.get("ok") is False:
            print(summary.get("message") or summary.get("error") or "error: /compliance-summary failed", file=sys.stderr)
            return cli_exit.EX_ERR

        verdict = summary.get("verdict")
        if not isinstance(verdict, str) or not verdict.strip():
            print("error: /compliance-summary missing verdict", file=sys.stderr)
            return cli_exit.EX_ERR

        verdict = verdict.strip()
        print(verdict)
        return cli_exit.EX_OK if verdict == "VALID" else cli_exit.EX_INVALID

    if args.cmd == "submit-evidence":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set GOVAI_RUN_ID (or RUN_ID)", file=sys.stderr)
            return cli_exit.EX_INVALID

        event_type = (getattr(args, "event_type", None) or "").strip()
        if not event_type:
            print("event type required: pass --event-type", file=sys.stderr)
            return cli_exit.EX_INVALID

        try:
            payload_obj = _load_payload_one_of(
                payload_file=getattr(args, "payload_file", None),
                payload_json=getattr(args, "payload_json", None),
            )
        except (OSError, json.JSONDecodeError, ValueError, TypeError) as e:
            print(f"invalid payload: {e}", file=sys.stderr)
            return cli_exit.EX_INVALID

        event_id = (getattr(args, "event_id", None) or "").strip() or str(uuid.uuid4())
        actor = (getattr(args, "actor", None) or "govai_cli").strip() or "govai_cli"
        system = (getattr(args, "system", None) or "govai_cli").strip() or "govai_cli"

        ev = {
            "event_id": event_id,
            "event_type": event_type,
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": payload_obj,
        }

        try:
            client = GovAIClient(audit_url, api_key=api_key)
            out = submit_event(client, ev)
        except Exception as e:
            print(str(e), file=sys.stderr)
            return cli_exit.EX_ERR

        _print_json(out, compact=True)
        return cli_exit.EX_OK

    if args.cmd == "discover":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set GOVAI_RUN_ID", file=sys.stderr)
            return cli_exit.EX_INVALID

        scan_path = Path(getattr(args, "path", ".")).expanduser()
        if not scan_path.exists():
            print(f"scan path does not exist: {scan_path}", file=sys.stderr)
            return cli_exit.EX_INVALID

        try:
            scan = scan_repo(scan_path)
            openai_override = _parse_bool_override(getattr(args, "openai", None), name="--openai")
            transformers_override = _parse_bool_override(getattr(args, "transformers", None), name="--transformers")
            model_artifacts_override = _parse_bool_override(
                getattr(args, "model_artifacts", None),
                name="--model-artifacts",
            )
        except ValueError as e:
            print(str(e), file=sys.stderr)
            return cli_exit.EX_INVALID
        except Exception as e:
            print(str(e), file=sys.stderr)
            return cli_exit.EX_ERR

        scan_openai = _signal_from_scan(scan, "openai")
        scan_transformers = _signal_from_scan(scan, "transformers")
        scan_model_artifacts = _signal_from_scan(scan, "model_artifacts")

        openai = scan_openai if openai_override is None else openai_override
        transformers = scan_transformers if transformers_override is None else transformers_override
        model_artifacts = scan_model_artifacts if model_artifacts_override is None else model_artifacts_override

        overrides_used = any(
            value is not None
            for value in (
                openai_override,
                transformers_override,
                model_artifacts_override,
            )
        )

        findings = _coerce_findings(scan)
        finding_types = sorted(
            {
                str(f.get("type"))
                for f in findings
                if isinstance(f, dict) and f.get("type") is not None
            }
        )

        payload_obj = {
            "openai": openai,
            "transformers": transformers,
            "model_artifacts": model_artifacts,
            "findings_count": len(findings),
            "finding_types": finding_types,
        }

        print(f"AI discovery scanned path: {scan_path.resolve()}", file=sys.stderr)
        if findings:
            grouped: dict[str, int] = {}
            for finding in findings:
                raw_type = finding.get("type") if isinstance(finding, dict) else None
                finding_type = str(raw_type or "unknown")
                grouped[finding_type] = grouped.get(finding_type, 0) + 1
            print("AI discovery findings:", file=sys.stderr)
            for key in sorted(grouped):
                print(f" {key}: {grouped[key]}", file=sys.stderr)
        else:
            print("No AI usage signals detected.", file=sys.stderr)

        print("AI discovery recorded:", file=sys.stderr)
        print(f" openai={str(openai).lower()}", file=sys.stderr)
        print(f" transformers={str(transformers).lower()}", file=sys.stderr)
        print(f" model_artifacts={str(model_artifacts).lower()}", file=sys.stderr)
        if overrides_used:
            print(" note: one or more flags overrode scan results", file=sys.stderr)

        event_id = (getattr(args, "event_id", None) or "").strip() or f"ai_discovery_reported_{run_id}"
        actor = (getattr(args, "actor", None) or "govai_cli").strip() or "govai_cli"
        system = (getattr(args, "system", None) or "govai_cli").strip() or "govai_cli"

        ev = {
            "event_id": event_id,
            "event_type": "ai_discovery_reported",
            "ts_utc": _utc_now_z(),
            "actor": actor,
            "system": system,
            "run_id": run_id,
            "payload": payload_obj,
        }

        try:
            client = GovAIClient(audit_url, api_key=api_key)
            out = submit_event(client, ev)
        except Exception as e:
            print(str(e), file=sys.stderr)
            return cli_exit.EX_ERR

        _print_json(out, compact=True)
        return cli_exit.EX_OK

    if args.cmd == "explain":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set GOVAI_RUN_ID", file=sys.stderr)
            return cli_exit.EX_INVALID

        try:
            client = GovAIClient(audit_url, api_key=api_key)
            summary = get_compliance_summary(client, run_id, timeout=args.timeout)
        except Exception as e:
            print(str(e), file=sys.stderr)
            return cli_exit.EX_ERR

        if not isinstance(summary, dict):
            print("error: expected object from /compliance-summary", file=sys.stderr)
            return cli_exit.EX_ERR

        if summary.get("ok") is False:
            print(summary.get("message") or summary.get("error") or "error: /compliance-summary failed", file=sys.stderr)
            return cli_exit.EX_ERR

        verdict = summary.get("verdict")
        print(f"verdict: {verdict}")

        requirements = summary.get("requirements")
        if not isinstance(requirements, dict):
            current_state = summary.get("current_state")
            if isinstance(current_state, dict):
                requirements = current_state.get("requirements")

        if isinstance(requirements, dict):
            required = requirements.get("required") or []
            satisfied = requirements.get("satisfied") or []
            missing = requirements.get("missing") or []
            required_evidence = requirements.get("required_evidence") or []
            missing_evidence = requirements.get("missing_evidence") or []

            print("requirements:")
            print(f" required: {', '.join(map(str, required)) if required else '-'}")
            print(f" satisfied: {', '.join(map(str, satisfied)) if satisfied else '-'}")
            print(f" missing: {', '.join(map(str, missing)) if missing else '-'}")

            if required_evidence:
                print(" required_evidence:")
                for item in required_evidence:
                    if isinstance(item, dict):
                        print(f"  - {item.get('code')} ({item.get('source')})")
                    else:
                        print(f"  - {item}")

            if missing_evidence:
                print(" missing_evidence:")
                for item in missing_evidence:
                    if isinstance(item, dict):
                        print(f"  - {item.get('code')} ({item.get('source')})")
                    else:
                        print(f"  - {item}")

        blocked_reasons = summary.get("blocked_reasons") or []
        if blocked_reasons:
            print("blocked_reasons:")
            for reason in blocked_reasons:
                if isinstance(reason, dict):
                    code = reason.get("code")
                    message = reason.get("message")
                    print(f" - {code}: {message}")
                else:
                    print(f" - {reason}")

        return cli_exit.EX_OK

    if args.cmd == "report":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set GOVAI_RUN_ID (or RUN_ID)", file=sys.stderr)
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
            print("run id required: pass --run-id or set GOVAI_RUN_ID (or RUN_ID)", file=sys.stderr)
            return cli_exit.EX_INVALID
        try:
            export_bundle_mod.main(["govai", run_id])
        except SystemExit as se:
            return _system_exit_code(se)
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
            return cli_exit.EX_ERR
        return cli_exit.EX_OK

    if args.cmd == "export-run":
        run_id = _resolve_run_id(args)
        if not run_id:
            print("run id required: pass --run-id or set GOVAI_RUN_ID (or RUN_ID)", file=sys.stderr)
            return cli_exit.EX_INVALID
        try:
            client = GovAIClient(audit_url, api_key=api_key)
            out = export_run(client, run_id, project=getattr(args, "project", None))
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
            return cli_exit.EX_ERR
        _print_json(out, compact=True)
        return cli_exit.EX_OK

    if args.cmd == "usage":
        try:
            client = GovAIClient(audit_url, api_key=api_key)
            out = get_usage(client, project=getattr(args, "project", None))
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
            return cli_exit.EX_ERR
        _print_json(out, compact=True)
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

    except GovaiError as e:
        payload = {"error": str(e), "status_code": e.status_code, "details": e.details}
        print(json.dumps(payload, ensure_ascii=False, indent=2), file=sys.stderr)
        return cli_exit.EX_ERR

    return cli_exit.EX_INVALID


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))