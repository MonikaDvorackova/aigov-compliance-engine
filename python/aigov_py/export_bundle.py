from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict
import hashlib

from aigov_py.canonical_json import canonical_bytes


def _get_json(url: str) -> Dict[str, Any]:
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python -m aigov_py.export_bundle <run_id>")
        raise SystemExit(2)

    run_id = sys.argv[1]
    base = os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088")

    bundle_url = f"{base}/bundle?run_id={run_id}"
    hash_url = f"{base}/bundle-hash?run_id={run_id}"

    bundle = _get_json(bundle_url)
    if not bundle.get("ok"):
        raise RuntimeError(f"bundle export failed: {bundle}")

    hash_payload = _get_json(hash_url)
    if not hash_payload.get("ok"):
        raise RuntimeError(f"bundle-hash failed: {hash_payload}")

    declared = str(hash_payload.get("bundle_sha256", "")).strip()
    if not declared:
        raise RuntimeError(f"bundle-hash missing bundle_sha256: {hash_payload}")

    # ─────────────────────────────────────────────
    # Verify hash against canonical JSON WITHOUT the hash field
    # ─────────────────────────────────────────────

    to_hash = dict(bundle)
    to_hash.pop("bundle_sha256", None)

    actual = _sha256_hex(canonical_bytes(to_hash))
    if actual != declared:
        raise RuntimeError(
            "bundle_sha256 mismatch\n"
            f"declared = {declared}\n"
            f"actual   = {actual}\n"
            "Rust and Python are not hashing the same canonical JSON"
        )

    # ─────────────────────────────────────────────
    # Now inject the hash and write the file canonically
    # ─────────────────────────────────────────────

    bundle["bundle_sha256"] = declared

    repo_root = Path(__file__).resolve().parents[2]
    out_dir = repo_root / "docs" / "evidence"
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = out_dir / f"{run_id}.json"
    out_path.write_bytes(canonical_bytes(bundle))

    print(f"saved {out_path}")
    print(f"bundle_sha256={declared}")


if __name__ == "__main__":
    main()
