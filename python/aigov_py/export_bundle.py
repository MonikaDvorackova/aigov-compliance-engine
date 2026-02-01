from __future__ import annotations

import json
import os
import sys
import urllib.request
from typing import Any, Dict


def _get_json(url: str) -> Dict[str, Any]:
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python -m aigov_py.export_bundle <run_id>")
        raise SystemExit(2)

    run_id = sys.argv[1].strip()
    base = os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088").rstrip("/")

    bundle_url = f"{base}/bundle?run_id={run_id}"
    hash_url = f"{base}/bundle-hash?run_id={run_id}"

    bundle = _get_json(bundle_url)
    if not bundle.get("ok"):
        raise RuntimeError(f"bundle export failed: {bundle}")

    hash_payload = _get_json(hash_url)
    if not hash_payload.get("ok"):
        raise RuntimeError(f"bundle-hash failed: {hash_payload}")

    bundle_sha256 = str(hash_payload.get("bundle_sha256", "") or "").strip()
    if not bundle_sha256:
        raise RuntimeError(f"bundle-hash missing bundle_sha256: {hash_payload}")

    # Inject audit-layer fingerprint into the exported bundle.
    bundle["bundle_sha256"] = bundle_sha256

    out_dir = os.path.join("..", "docs", "evidence")
    os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, f"{run_id}.json")

    # Deterministic file representation for stable file hashes.
    payload = json.dumps(
        bundle,
        ensure_ascii=False,
        sort_keys=True,
        indent=2,
    )
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(payload)
        f.write("\n")

    print(f"saved {out_path}")
    print(f"bundle_sha256={bundle_sha256}")


if __name__ == "__main__":
    main()
