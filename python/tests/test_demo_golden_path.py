from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from aigov_py import cli_exit
from aigov_py.cli import main


def _read_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def test_demo_golden_path_outputs_expected_files(tmp_path: Path) -> None:
    out = tmp_path / "artefacts"
    with patch("aigov_py.cli.uuid.uuid4", return_value="00000000-0000-0000-0000-000000000001"):
        code = main(["demo-golden-path", "--output-dir", str(out)])
    assert code == cli_exit.EX_OK
    assert (out / "evidence_digest_manifest.json").is_file()
    assert (out / "00000000-0000-0000-0000-000000000001.json").is_file()


def test_demo_golden_path_creates_valid_structure(tmp_path: Path) -> None:
    out = tmp_path / "artefacts"
    rid = "00000000-0000-0000-0000-000000000002"
    with patch("aigov_py.cli.uuid.uuid4", return_value=rid):
        code = main(["demo-golden-path", "--output-dir", str(out)])
    assert code == cli_exit.EX_OK

    bundle = _read_json(out / f"{rid}.json")
    assert bundle["ok"] is True
    assert bundle["run_id"] == rid
    events = bundle["events"]
    assert isinstance(events, list)
    assert [e["event_type"] for e in events] == [
        "ai_discovery_reported",
        "evaluation_reported",
        "human_approved",
        "model_promoted",
    ]

    manifest = _read_json(out / "evidence_digest_manifest.json")
    assert manifest["run_id"] == rid
    assert isinstance(manifest.get("events_content_sha256"), str)
    assert len(manifest["events_content_sha256"]) == 64


def _normalize_bundle(bundle: dict) -> dict:
    """Remove run-id derived values so we can compare deterministic structure."""
    b = json.loads(json.dumps(bundle))
    rid = b.get("run_id")
    b["run_id"] = "<run_id>"
    for e in b.get("events", []):
        if isinstance(e, dict):
            e["run_id"] = "<run_id>"
            if isinstance(e.get("event_id"), str) and rid and rid in e["event_id"]:
                e["event_id"] = e["event_id"].replace(rid, "<run_id>")
            p = e.get("payload")
            if isinstance(p, dict):
                for k, v in list(p.items()):
                    if isinstance(v, str) and rid and rid in v:
                        p[k] = v.replace(rid, "<run_id>")
    return b


def _normalize_manifest(manifest: dict) -> dict:
    m = json.loads(json.dumps(manifest))
    m["run_id"] = "<run_id>"
    # Digest is expected to differ because run_id is part of the portable digest envelope.
    m["events_content_sha256"] = "<digest>"
    return m


def test_demo_golden_path_is_deterministic_except_run_id(tmp_path: Path) -> None:
    out1 = tmp_path / "a1"
    out2 = tmp_path / "a2"
    rid1 = "00000000-0000-0000-0000-000000000003"
    rid2 = "00000000-0000-0000-0000-000000000004"

    with patch("aigov_py.cli.uuid.uuid4", side_effect=[rid1, rid2]):
        code1 = main(["demo-golden-path", "--output-dir", str(out1)])
        code2 = main(["demo-golden-path", "--output-dir", str(out2)])
    assert code1 == cli_exit.EX_OK
    assert code2 == cli_exit.EX_OK

    b1 = _read_json(out1 / f"{rid1}.json")
    b2 = _read_json(out2 / f"{rid2}.json")
    assert _normalize_bundle(b1) == _normalize_bundle(b2)

    m1 = _read_json(out1 / "evidence_digest_manifest.json")
    m2 = _read_json(out2 / "evidence_digest_manifest.json")
    assert _normalize_manifest(m1) == _normalize_manifest(m2)

