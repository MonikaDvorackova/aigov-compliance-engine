from __future__ import annotations

import json
from pathlib import Path

from aigov_py import cli_exit
from aigov_py.cli import main
from aigov_py.evidence_artifact_gate import load_bundle, load_manifest
from aigov_py.portable_evidence_digest import portable_evidence_digest_v1


def _read_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def test_evidence_pack_init_creates_required_files(tmp_path: Path) -> None:
    out = tmp_path / "pack"
    rid = "00000000-0000-0000-0000-000000000abc"
    code = main(["evidence-pack", "init", "--out", str(out), "--run-id", rid])
    assert code == cli_exit.EX_OK
    assert (out / "evidence_digest_manifest.json").is_file()
    assert (out / f"{rid}.json").is_file()


def test_evidence_pack_init_manifest_matches_bundle_digest(tmp_path: Path) -> None:
    out = tmp_path / "pack"
    rid = "00000000-0000-0000-0000-000000000def"
    code = main(["evidence-pack", "init", "--out", str(out), "--run-id", rid])
    assert code == cli_exit.EX_OK

    bundle = _read_json(out / f"{rid}.json")
    events = bundle["events"]
    digest = portable_evidence_digest_v1(rid, events).lower()

    manifest = _read_json(out / "evidence_digest_manifest.json")
    assert manifest["schema"] == "aigov.evidence_digest_manifest.v1"
    assert manifest["run_id"] == rid
    assert manifest["events_content_sha256"] == digest


def test_evidence_pack_init_is_consumable_by_existing_pack_loaders(tmp_path: Path) -> None:
    out = tmp_path / "pack"
    rid = "00000000-0000-0000-0000-000000000123"
    code = main(["evidence-pack", "init", "--out", str(out), "--run-id", rid])
    assert code == cli_exit.EX_OK

    bundle, bundle_path = load_bundle(rid, out)
    assert bundle_path == out / f"{rid}.json"
    assert bundle.get("run_id") == rid
    assert isinstance(bundle.get("events"), list)

    manifest = load_manifest(out)
    assert manifest.get("run_id") == rid


def test_evidence_pack_init_respects_default_run_id(tmp_path: Path) -> None:
    out = tmp_path / "pack"
    code = main(["evidence-pack", "init", "--out", str(out)])
    assert code == cli_exit.EX_OK
    assert (out / "evidence_digest_manifest.json").is_file()
    assert (out / "00000000-0000-0000-0000-000000000000.json").is_file()

