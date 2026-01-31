import json
import os
import sys
import urllib.request


def _get_json(url: str) -> dict:
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))


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

    # Inject cryptographic fingerprint into the exported bundle
    bundle["bundle_sha256"] = hash_payload.get("bundle_sha256", "")

    out_dir = os.path.join("..", "docs", "evidence")
    os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, f"{run_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)

    print(f"saved {out_path}")
    print(f"bundle_sha256={bundle['bundle_sha256']}")


if __name__ == "__main__":
    main()
