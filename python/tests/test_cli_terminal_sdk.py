from __future__ import annotations

import json
from importlib.metadata import version
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from aigov_py import cli_exit
from aigov_py.cli import build_parser, main


def test_help_does_not_crash() -> None:
    with pytest.raises(SystemExit) as ei:
        build_parser().parse_args(["--help"])
    assert ei.value.code == 0


def test_version_matches_metadata(capsys: pytest.CaptureFixture[str]) -> None:
    expected = version("aigov-py")
    code = main(["--version"])
    assert code == cli_exit.EX_OK
    assert capsys.readouterr().out.strip() == expected


def test_short_version_flag(capsys: pytest.CaptureFixture[str]) -> None:
    expected = version("aigov-py")
    code = main(["-V"])
    assert code == cli_exit.EX_OK
    assert capsys.readouterr().out.strip() == expected


def test_no_subcommand_prints_help(capsys: pytest.CaptureFixture[str]) -> None:
    code = main([])
    assert code == cli_exit.EX_OK
    out = capsys.readouterr().out
    assert "govai" in out.lower()


def test_subcommand_help() -> None:
    for sub in (
        "init",
        "verify",
        "fetch-bundle",
        "compliance-summary",
        "check",
        "submit-evidence",
        "report",
        "export-bundle",
        "export-run",
        "usage",
        "create-assessment",
    ):
        with pytest.raises(SystemExit) as ei:
            build_parser().parse_args([sub, "--help"])
        assert ei.value.code == 0


def test_submit_evidence_missing_run_id_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOVAI_RUN_ID", raising=False)
    monkeypatch.delenv("RUN_ID", raising=False)
    code = main(
        [
            "--audit-base-url",
            "http://audit.test",
            "submit-evidence",
            "--event-type",
            "ai_discovery_reported",
            "--payload-json",
            "{}",
        ]
    )
    assert code == cli_exit.EX_INVALID


def test_submit_evidence_missing_payload_fails() -> None:
    code = main(
        [
            "--audit-base-url",
            "http://audit.test",
            "submit-evidence",
            "--run-id",
            "r1",
            "--event-type",
            "ai_discovery_reported",
        ]
    )
    assert code == cli_exit.EX_INVALID


def test_submit_evidence_invalid_json_payload_fails() -> None:
    code = main(
        [
            "--audit-base-url",
            "http://audit.test",
            "submit-evidence",
            "--run-id",
            "r1",
            "--event-type",
            "ai_discovery_reported",
            "--payload-json",
            "{",
        ]
    )
    assert code == cli_exit.EX_INVALID


def test_submit_evidence_success_sends_expected_event_and_api_key() -> None:
    with patch("aigov_py.cli.GovAIClient") as client_cls:
        inst = MagicMock()
        client_cls.return_value = inst
        with patch("aigov_py.cli.submit_event") as submit:
            submit.return_value = {"ok": True, "record_hash": "h", "policy_version": "p", "environment": "dev"}
            code = main(
                [
                    "--audit-base-url",
                    "http://audit.test",
                    "--api-key",
                    "secret",
                    "submit-evidence",
                    "--run-id",
                    "r1",
                    "--event-type",
                    "ai_discovery_reported",
                    "--payload-json",
                    "{\"signals\":[\"openai\"]}",
                    "--event-id",
                    "evt1",
                    "--actor",
                    "customer",
                    "--system",
                    "repo",
                ]
            )
    assert code == cli_exit.EX_OK
    assert client_cls.call_args[0][0] == "http://audit.test"
    assert client_cls.call_args.kwargs["api_key"] == "secret"
    ev = submit.call_args[0][1]
    assert ev["event_id"] == "evt1"
    assert ev["event_type"] == "ai_discovery_reported"
    assert ev["run_id"] == "r1"
    assert ev["actor"] == "customer"
    assert ev["system"] == "repo"
    assert ev["payload"] == {"signals": ["openai"]}


def test_submit_evidence_http_error_exits_nonzero() -> None:
    with patch("aigov_py.cli.submit_event") as submit:
        submit.side_effect = Exception("HTTP 400")
        code = main(
            [
                "--audit-base-url",
                "http://audit.test",
                "submit-evidence",
                "--run-id",
                "r1",
                "--event-type",
                "ai_discovery_reported",
                "--payload-json",
                "{}",
            ]
        )
    assert code == cli_exit.EX_ERR


def test_init_writes_config(tmp_path: Path) -> None:
    cfg_path = tmp_path / "govai-config.json"
    code = main(
        [
            "--config",
            str(cfg_path),
            "init",
            "--url",
            "http://example.test:9999",
            "--store-api-key",
            "secret",
        ]
    )
    assert code == cli_exit.EX_OK
    data = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert data["audit_base_url"] == "http://example.test:9999"
    assert data["api_key"] == "secret"


def test_compliance_summary_main_mocked(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    fake = {"ok": True, "run_id": "r1", "schema_version": "aigov.compliance_summary.v2"}
    with patch("aigov_py.cli.GovAIClient") as client_cls:
        inst = MagicMock()
        client_cls.return_value = inst
        inst.request_json.return_value = fake
        code = main(["--audit-base-url", "http://audit.test", "compliance-summary", "--run-id", "r1"])
    assert code == cli_exit.EX_OK
    inst.request_json.assert_called_once()
    call_kw = inst.request_json.call_args.kwargs
    assert call_kw["params"] == {"run_id": "r1"}


def test_verify_json_mocked_requests(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Minimal repo layout + mocked verify-log HTTP."""
    monkeypatch.chdir(tmp_path)
    root = tmp_path
    (root / "docs" / "audit").mkdir(parents=True)
    (root / "docs" / "evidence").mkdir(parents=True)
    (root / "docs" / "reports").mkdir(parents=True)
    rid = "550e8400-e29b-41d4-a716-446655440000"
    audit = {
        "run_id": rid,
        "policy_version": "v0.4_human_approval",
        "bundle_sha256": "abc123",
    }
    evidence = {
        "policy_version": "v0.4_human_approval",
        "log_path": "rust/audit_log.jsonl",
        "events": [{"event_id": "e1", "event_type": "run_started", "ts_utc": "t", "actor": "a", "system": "s", "run_id": rid, "payload": {}}],
    }
    (root / "docs" / "audit" / f"{rid}.json").write_text(json.dumps(audit), encoding="utf-8")
    (root / "docs" / "evidence" / f"{rid}.json").write_text(json.dumps(evidence), encoding="utf-8")
    (root / "docs" / "reports" / f"{rid}.md").write_text("# report", encoding="utf-8")

    import aigov_py.verify as verify_mod

    def fake_repo_root() -> str:
        return str(root)

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"ok": True}

    with patch.object(verify_mod, "repo_root", fake_repo_root):
        with patch("aigov_py.verify.requests.get", return_value=mock_resp):
            code = main(["--audit-base-url", "http://127.0.0.1:9", "verify", "--run-id", rid, "--json"])

    assert code == cli_exit.EX_OK


def test_missing_run_id_exit_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOVAI_RUN_ID", raising=False)
    monkeypatch.delenv("RUN_ID", raising=False)
    code = main(["compliance-summary"])
    assert code == cli_exit.EX_INVALID


def _valid_check_summary() -> dict:
    return {
        "ok": True,
        "verdict": "VALID",
    }


def test_check_exits_0_on_valid(capsys: pytest.CaptureFixture[str]) -> None:
    with patch("aigov_py.cli.get_compliance_summary", return_value=_valid_check_summary()) as m:
        code = main(["--audit-base-url", "http://audit.test", "check", "r1"])
    assert code == cli_exit.EX_OK
    m.assert_called_once()
    assert m.call_args[0][1] == "r1"
    assert capsys.readouterr().out.strip() == "VALID"


def test_check_exits_invalid_on_invalid(capsys: pytest.CaptureFixture[str]) -> None:
    s = {"ok": True, "verdict": "INVALID"}
    with patch("aigov_py.cli.get_compliance_summary", return_value=s):
        code = main(["--audit-base-url", "http://audit.test", "check", "r1"])
    assert code == cli_exit.EX_INVALID
    assert capsys.readouterr().out.strip() == "INVALID"


def test_check_exits_invalid_no_run_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOVAI_RUN_ID", raising=False)
    monkeypatch.delenv("RUN_ID", raising=False)
    code = main(["--audit-base-url", "http://audit.test", "check"])
    assert code == cli_exit.EX_INVALID


def test_check_run_id_flag_overrides_positional(capsys: pytest.CaptureFixture[str]) -> None:
    with patch("aigov_py.cli.get_compliance_summary", return_value=_valid_check_summary()) as m:
        code = main(["--audit-base-url", "http://audit.test", "check", "ignored", "--run-id", "r2"])
    assert code == cli_exit.EX_OK
    assert m.call_args[0][1] == "r2"
    assert capsys.readouterr().out.strip() == "VALID"


def test_check_blocked_through_client(capsys: pytest.CaptureFixture[str]) -> None:
    """Missing verdict must fail (EX_ERR)."""
    with patch("aigov_py.cli.GovAIClient") as client_cls:
        inst = MagicMock()
        client_cls.return_value = inst
        inst.request_json.return_value = {"ok": True}
        code = main(["--audit-base-url", "http://audit.test", "check", "r1"])
    assert code == cli_exit.EX_ERR
    assert capsys.readouterr().out.strip() == ""


def test_check_exits_err_when_verdict_missing(capsys: pytest.CaptureFixture[str]) -> None:
    with patch("aigov_py.cli.get_compliance_summary", return_value={"ok": True}):
        code = main(["--audit-base-url", "http://audit.test", "check", "r1"])
    assert code == cli_exit.EX_ERR
    assert capsys.readouterr().out.strip() == ""
