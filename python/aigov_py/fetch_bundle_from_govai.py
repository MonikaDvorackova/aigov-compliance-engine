from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict
from urllib.parse import quote

import requests


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _evidence_path(run_id: str) -> Path:
    return _repo_root() / "docs" / "evidence" / f"{run_id}.json"


def audit_base_url() -> str:
    """Resolve GovAI audit base URL consistently with write_digest_manifest / Makefile defaults."""
    return (
        os.environ.get("AIGOV_AUDIT_ENDPOINT")
        or os.environ.get("AIGOV_AUDIT_URL")
        or os.environ.get("GOVAI_AUDIT_BASE_URL")
        or os.environ.get("AUDIT_URL")
        or "http://127.0.0.1:8088"
    ).rstrip("/")


def _request_headers() -> Dict[str, str]:
    """Headers for authenticated tenant-scoped bundle export (matches CI curl defaults)."""
    h: Dict[str, str] = {"Accept": "application/json"}
    key = (os.environ.get("GOVAI_API_KEY") or "ci-test-api-key").strip()
    if key:
        h["Authorization"] = f"Bearer {key}"
    proj = (os.environ.get("GOVAI_PROJECT") or "github-actions").strip()
    if proj:
        h["X-GovAI-Project"] = proj
    return h


def _get_json(url: str) -> Dict[str, Any]:
    r = requests.get(url, headers=_request_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        raise SystemExit("Usage: python -m aigov_py.fetch_bundle_from_govai <run_id>")

    run_id = argv[1].strip()
    if not run_id:
        raise SystemExit("run_id is required")

    endpoint = audit_base_url()
    q = quote(run_id, safe="")
    bundle_url = f"{endpoint}/bundle?run_id={q}"
    digest_url = f"{endpoint}/bundle-hash?run_id={q}"

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

