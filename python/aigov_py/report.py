from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class Event:
    event_id: str
    event_type: str
    ts_utc: str
    actor: str
    system: str
    run_id: str
    payload: Dict[str, Any]


def _load_bundle(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _events(bundle: Dict[str, Any]) -> List[Event]:
    out: List[Event] = []
    for e in bundle.get("events", []):
        out.append(
            Event(
                event_id=str(e.get("event_id", "")),
                event_type=str(e.get("event_type", "")),
                ts_utc=str(e.get("ts_utc", "")),
                actor=str(e.get("actor", "")),
                system=str(e.get("system", "")),
                run_id=str(e.get("run_id", "")),
                payload=dict(e.get("payload", {}) or {}),
            )
        )
    return out


def _pick(events: List[Event], t: str) -> Optional[Event]:
    for e in events:
        if e.event_type == t:
            return e
    return None


def _md_escape(s: str) -> str:
    return s.replace("|", "\\|")


def main() -> None:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("RUN_ID is required")

    repo_root = Path(__file__).resolve().parents[2]

    bundle_path = repo_root / "docs" / "evidence" / f"{run_id}.json"
    if not bundle_path.exists():
        raise SystemExit(f"bundle not found: {bundle_path}")

    bundle = _load_bundle(bundle_path)
    events = _events(bundle)

    run_started = _pick(events, "run_started")
    data_registered = _pick(events, "data_registered")
    evaluation_reported = _pick(events, "evaluation_reported")
    human_approved = _pick(events, "human_approved")
    model_promoted = _pick(events, "model_promoted")

    system = run_started.system if run_started else (events[0].system if events else "")
    actor = run_started.actor if run_started else (events[0].actor if events else "")
    policy_version = str(bundle.get("policy_version", "")).strip()
    log_path = str(bundle.get("log_path", "")).strip()
    artifact_path = str(bundle.get("model_artifact_path", "")).strip()

    bundle_sha256 = str(bundle.get("bundle_sha256", "")).strip()
    if not bundle_sha256:
        bundle_sha256 = _sha256_file(bundle_path)

    dataset = ""
    dataset_fp = ""
    n_rows = ""
    n_features = ""
    if data_registered:
        dataset = str(data_registered.payload.get("dataset", ""))
        dataset_fp = str(data_registered.payload.get("dataset_fingerprint", ""))
        n_rows = str(data_registered.payload.get("n_rows", ""))
        n_features = str(data_registered.payload.get("n_features", ""))

    metric = ""
    value = ""
    threshold = ""
    passed = ""
    if evaluation_reported:
        metric = str(evaluation_reported.payload.get("metric", ""))
        value = str(evaluation_reported.payload.get("value", ""))
        threshold = str(evaluation_reported.payload.get("threshold", ""))
        passed = str(evaluation_reported.payload.get("passed", ""))

    approver = ""
    decision = ""
    justification = ""
    scope = ""
    if human_approved:
        scope = str(human_approved.payload.get("scope", ""))
        decision = str(human_approved.payload.get("decision", ""))
        approver = str(human_approved.payload.get("approver", ""))
        justification = str(human_approved.payload.get("justification", ""))

    promoted_reason = ""
    promoted_artifact_path = ""
    if model_promoted:
        promoted_reason = str(model_promoted.payload.get("promotion_reason", ""))
        promoted_artifact_path = str(model_promoted.payload.get("artifact_path", ""))

    report_dir = repo_root / "docs" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"{run_id}.md"

    lines: List[str] = []

    lines.append(f"# Audit report for run `{run_id}`")
    lines.append("")
    lines.append("run_id=" + run_id)
    lines.append("bundle_sha256=" + bundle_sha256)
    lines.append("policy_version=" + (policy_version or ""))
    lines.append("")

    lines.append("## Summary")
    lines.append("")
    lines.append(f"- System: `{_md_escape(system)}`")
    lines.append(f"- Actor: `{_md_escape(actor)}`")
    lines.append(f"- Policy version: `{_md_escape(policy_version)}`")
    lines.append(f"- Evidence bundle: `docs/evidence/{run_id}.json`")
    lines.append(f"- Evidence bundle SHA256: `{_md_escape(bundle_sha256)}`")
    if artifact_path:
        lines.append(f"- Model artifact (reported): `{_md_escape(artifact_path)}`")
    lines.append("")

    lines.append("## Traceability")
    lines.append("")
    lines.append("| Item | Value |")
    lines.append("|---|---|")
    lines.append(f"| Dataset | `{_md_escape(dataset)}` |")
    lines.append(f"| Dataset fingerprint | `{_md_escape(dataset_fp)}` |")
    lines.append(f"| Rows | `{_md_escape(n_rows)}` |")
    lines.append(f"| Features | `{_md_escape(n_features)}` |")
    lines.append("")

    lines.append("## Evaluation gate")
    lines.append("")
    lines.append("| Metric | Value | Threshold | Passed |")
    lines.append("|---|---:|---:|---|")
    lines.append(
        f"| `{_md_escape(metric)}` | `{_md_escape(value)}` | `{_md_escape(threshold)}` | `{_md_escape(passed)}` |"
    )
    lines.append("")

    lines.append("## Human approval gate")
    lines.append("")
    lines.append("| Scope | Decision | Approver | Justification |")
    lines.append("|---|---|---|---|")
    lines.append(
        f"| `{_md_escape(scope)}` | `{_md_escape(decision)}` | `{_md_escape(approver)}` | `{_md_escape(justification)}` |"
    )
    lines.append("")

    lines.append("## Promotion")
    lines.append("")
    lines.append(f"- Promotion reason: `{_md_escape(promoted_reason)}`")
    if promoted_artifact_path:
        lines.append(f"- Artifact path: `{_md_escape(promoted_artifact_path)}`")
    lines.append("")

    lines.append("## Event timeline")
    lines.append("")
    lines.append("| Time (UTC) | Event | Event id |")
    lines.append("|---|---|---|")
    for e in sorted(events, key=lambda x: x.ts_utc):
        lines.append(
            f"| `{_md_escape(e.ts_utc)}` | `{_md_escape(e.event_type)}` | `{_md_escape(e.event_id)}` |"
        )
    lines.append("")

    if log_path:
        lines.append("## Audit log reference")
        lines.append("")
        lines.append(f"- Log path (reported by server): `{_md_escape(log_path)}`")
        lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"saved {report_path}")


if __name__ == "__main__":
    main()
