from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from govai import GovAIAPIError

from aigov_py import cli_exit
from aigov_py.cli import main
from aigov_py import evidence_artifact_gate as eag


def test_canonicalize_evidence_event_dicts_deduplicates_so_latest_timestamp_wins() -> None:
    xs = [
        {"event_id": "a", "ts_utc": "t1", "event_type": "x"},
        {"event_id": "a", "ts_utc": "t2", "event_type": "x"},
    ]
    out = eag.canonicalize_evidence_event_dicts(xs)
    assert len(out) == 1
    assert out[0]["ts_utc"] == "t2"


def test_event_for_submit_strips_environment() -> None:
    ev = {"event_id": "1", "environment": "dev", "payload": {}, "run_id": "r"}
    assert "environment" not in eag.event_for_submit(ev)


def test_bundle_hash_digest_requires_events_content_sha256() -> None:
    cli = MagicMock()
    cli.request_json.return_value = {"ok": True, "bundle_sha256": "a" * 64}
    with pytest.raises(GovAIAPIError):
        eag.bundle_hash_digest(cli, "rid")


@pytest.fixture()
def artifact_dir(tmp_path: Path) -> Path:
    run_id = "rid-art"
    d = tmp_path / "art"
    d.mkdir(parents=True, exist_ok=True)
    bundle = {
        "ok": True,
        "run_id": run_id,
        "events": [
            {
                "event_id": "e1",
                "event_type": "ai_discovery_reported",
                "ts_utc": "2020-01-01T00:00:00Z",
                "actor": "ci",
                "system": "github_actions",
                "run_id": run_id,
                "payload": {"openai": False},
                "environment": "dev",
            }
        ],
    }
    (d / f"{run_id}.json").write_text(json.dumps(bundle), encoding="utf-8")
    (d / "evidence_digest_manifest.json").write_text(
        json.dumps(
            {"run_id": run_id, "events_content_sha256": ("ab" * 32)},
            indent=2,
        ),
        encoding="utf-8",
    )
    return d


def test_check_verify_artifacts_digest_mismatch_errors(
    artifact_dir: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with patch("aigov_py.cli.GovAIClient") as gc:
        inst = MagicMock()
        gc.return_value = inst
        inst.request_json.return_value = {
            "ok": True,
            "events_content_sha256": "cd" * 32,
            "bundle_sha256": "ab" * 32,
            "policy_version": "v0_test",
            "run_id": "rid-art",
        }
        code = main(
            [
                "--audit-base-url",
                "http://audit.test",
                "check",
                "rid-art",
                "--verify-artifacts",
                str(artifact_dir),
            ]
        )
    assert code == cli_exit.EX_ERR
    err = capsys.readouterr().err
    assert "hosted events_content_sha256" in err.lower() or "expected=" in err


def test_fetch_export_evidence_hashes_returns_skip_reason_on_http_failure() -> None:
    cli = MagicMock()
    cli.request_json.side_effect = OSError("network down")
    got, reason = eag.fetch_export_evidence_hashes(cli, "r1")
    assert got is None
    assert reason == "export not available"


def test_submit_evidence_pack_missing_bundle_errors(tmp_path: Path) -> None:
    code = main(
        [
            "--audit-base-url",
            "http://audit.test",
            "submit-evidence-pack",
            "--path",
            str(tmp_path),
            "--run-id",
            "missing-only",
        ]
    )
    assert code == cli_exit.EX_ERR
