from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

import requests


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _evidence_path(run_id: str) -> Path:
    return _repo_root() / "docs" / "evidence" / f"{run_id}.json"


def _audit_endpoint() -> str:
    # Prefer the same env var names used by other scripts/Makefile.
    return (os.environ.get("AIGOV_AUDIT_ENDPOINT") or os.environ.get("AIGOV_AUDIT_URL") or "http://127.0.0.1:8088").rstrip("/")


def _get_json(url: str) -> Dict[str, Any]:
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json()


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        raise SystemExit("Usage: python -m aigov_py.fetch_bundle_from_govai <run_id>")

    run_id = argv[1].strip()
    if not run_id:
        raise SystemExit("run_id is required")

    endpoint = _audit_endpoint()
    bundle_url = f"{endpoint}/bundle?run_id={run_id}"
    digest_url = f"{endpoint}/bundle-hash?run_id={run_id}"

    bundle = _get_json(bundle_url)
    if not bundle.get("ok"):
        raise SystemExit(f"bundle fetch failed: {bundle}")

    digest = _get_json(digest_url)
    if not digest.get("ok"):
        raise SystemExit(f"bundle-hash fetch failed: {digest}")

    bundle_sha256 = digest.get("bundle_sha256", "")
    if not isinstance(bundle_sha256, str) or not bundle_sha256.strip():
        raise SystemExit(f"bundle-hash missing bundle_sha256: {digest}")

    bundle["bundle_sha256"] = bundle_sha256

    out_path = _evidence_path(run_id)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"saved evidence bundle: {out_path}")


if __name__ == "__main__":
    main(sys.argv)

