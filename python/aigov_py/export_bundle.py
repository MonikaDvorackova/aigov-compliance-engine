import json
import os
import sys
import urllib.request


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python -m aigov_py.export_bundle <run_id>")
        raise SystemExit(2)

    run_id = sys.argv[1]
    base = os.getenv("AIGOV_AUDIT_ENDPOINT", "http://127.0.0.1:8088")
    url = f"{base}/bundle?run_id={run_id}"

    with urllib.request.urlopen(url) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if not data.get("ok"):
        raise RuntimeError(f"bundle export failed: {data}")

    out_dir = os.path.join("..", "docs", "evidence")
    os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, f"{run_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"saved {out_path}")


if __name__ == "__main__":
    main()
