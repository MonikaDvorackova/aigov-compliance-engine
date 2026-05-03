"""Fail CI when docs/evidence/<run_id>.json is fallback-only or missing discovery evidence."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def assert_non_fallback_bundle(run_id: str) -> None:
    rid = run_id.strip()
    if not rid:
        raise SystemExit("run_id is required")

    path = _repo_root() / "docs" / "evidence" / f"{rid}.json"
    if not path.is_file():
        raise SystemExit(f"missing evidence bundle: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    events = data.get("events")
    if not isinstance(events, list):
        raise SystemExit("evidence bundle missing events list")

    types = {e.get("event_type") for e in events if isinstance(e, dict)}

    if "ci_fallback_used" in types:
        raise SystemExit(
            "refusing fallback-only evidence bundle (ci_fallback_used). "
            "Sync from the audit ledger with fetch_bundle_from_govai or fix audit connectivity."
        )
    if "ai_discovery_reported" not in types:
        raise SystemExit(
            "evidence bundle missing ai_discovery_reported "
            "(required for compliance projection / ai_discovery_completed)."
        )
    if "evaluation_reported" not in types and "evaluation_completed" not in types:
        raise SystemExit(
            "evidence bundle missing evaluation_reported or evaluation_completed "
            "(artifact-bound gate expects a full training/evaluation lifecycle)."
        )


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv
    if len(argv) < 2:
        print("usage: python -m aigov_py.assert_ci_evidence_bundle <run_id>", file=sys.stderr)
        return 2
    assert_non_fallback_bundle(argv[1])
    print(f"OK: evidence bundle for {argv[1]!r} is non-fallback and includes ai_discovery_reported")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
