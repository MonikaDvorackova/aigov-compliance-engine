from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from aigov_py.portable_evidence_digest import portable_evidence_digest_v1


@dataclass(frozen=True)
class GoldenPathResult:
    run_id: str
    artefacts_path: Path
    bundle_path: Path
    manifest_path: Path


_ACTOR = "golden_path"
_SYSTEM = "golden_path"

# Fixed timestamps for deterministic artifacts (except run_id).
_T0 = "2026-01-01T00:00:01Z"
_T1 = "2026-01-01T00:00:02Z"
_T2 = "2026-01-01T00:00:03Z"
_T3 = "2026-01-01T00:00:04Z"


def _event_id(kind: str, run_id: str) -> str:
    return f"gp_{kind}_{run_id}"


def _bundle_doc(*, run_id: str, events: list[dict[str, Any]]) -> dict[str, Any]:
    # Keep envelope compatible with submit-evidence-pack and existing docs.
    return {"ok": True, "run_id": run_id, "events": events}


def generate_demo_golden_path(*, run_id: str, output_dir: Path) -> GoldenPathResult:
    """
    Deterministic golden-path evidence artifacts for local/CI onboarding.

    Writes:
    - <output_dir>/<run_id>.json
    - <output_dir>/evidence_digest_manifest.json
    """
    rid = run_id.strip()
    if not rid:
        raise ValueError("run_id is required")

    out = output_dir.expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    # Note: requirement `ai_discovery_completed` is satisfied by event_type `ai_discovery_reported`.
    discovery_event_id = f"ai_discovery_completed_{rid}"
    approval_event_id = _event_id("human_approved", rid)

    events: list[dict[str, Any]] = [
        {
            "event_id": discovery_event_id,
            "event_type": "ai_discovery_reported",
            "ts_utc": _T0,
            "actor": _ACTOR,
            "system": _SYSTEM,
            "run_id": rid,
            "payload": {
                "status": "completed",
                "openai": False,
                "transformers": False,
                "model_artifacts": False,
                "source": "demo_golden_path",
                "notes": "deterministic golden path",
            },
        },
        {
            "event_id": _event_id("evaluation_reported", rid),
            "event_type": "evaluation_reported",
            "ts_utc": _T1,
            "actor": _ACTOR,
            "system": _SYSTEM,
            "run_id": rid,
            "payload": {
                "passed": True,
                "metric": "accuracy",
                "value": 0.95,
                "threshold": 0.8,
            },
        },
        {
            "event_id": approval_event_id,
            "event_type": "human_approved",
            "ts_utc": _T2,
            "actor": _ACTOR,
            "system": _SYSTEM,
            "run_id": rid,
            "payload": {
                "scope": "model_promoted",
                "decision": "approve",
                "approved": True,
                "approver": "compliance_officer",
                "justification": "deterministic golden path approval",
            },
        },
        {
            "event_id": _event_id("model_promoted", rid),
            "event_type": "model_promoted",
            "ts_utc": _T3,
            "actor": _ACTOR,
            "system": _SYSTEM,
            "run_id": rid,
            "payload": {
                "artifact_path": f"registry://demo/model/{rid}",
                "promotion_reason": "approved_by_human",
                "approved_human_event_id": approval_event_id,
            },
        },
    ]

    bundle = _bundle_doc(run_id=rid, events=events)
    digest = portable_evidence_digest_v1(rid, events)

    manifest = {
        "schema": "aigov.evidence_digest_manifest.v1",
        "run_id": rid,
        "events_content_sha256": digest.lower(),
        "evidence_digest_schema": "aigov.evidence_digest.v1",
        "bundle_sha256": "",
        "policy_version": "",
    }

    bundle_path = out / f"{rid}.json"
    manifest_path = out / "evidence_digest_manifest.json"

    bundle_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    return GoldenPathResult(
        run_id=rid,
        artefacts_path=out,
        bundle_path=bundle_path,
        manifest_path=manifest_path,
    )

