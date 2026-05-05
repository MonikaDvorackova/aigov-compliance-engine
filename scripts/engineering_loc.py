#!/usr/bin/env python3
"""Categorised line counts for tracked files (engineering LOC vs noise).

Uses ``git ls-files`` only (no ``find``). Stdlib-only. Deterministic: sorted paths,
stable UTF-8 decoding with replacement for malformed text.
"""
from __future__ import annotations

import os
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# Category keys (stable order for reporting).
CATEGORIES = (
    "core_source",
    "tests",
    "experiments",
    "dashboard",
    "docs",
    "config_ci",
    "generated_build",
    "data_fixtures_assets",
    "other",
)

GENERATED_DIR_PREFIXES = (
    "dist/",
    ".next/",
    "node_modules/",
    ".venv/",
    "target/",
    ".turbo/",
    "coverage/",
    "htmlcov/",
)

GENERATED_SUFFIXES = (
    ".min.js",
    ".min.css",
    ".bundle.js",
    ".chunk.js",
    ".map",
)

BINARY_ASSET_SUFFIXES = (
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".svg",
    ".zip",
    ".mp4",
    ".mp3",
    ".pdf",
    ".wasm",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".bin",
)

DASHBOARD_CONFIG_NAMES = {
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json",
    "tsconfig.tsbuildinfo",
    "eslint.config.mjs",
    "eslint.config.js",
    "postcss.config.mjs",
    "postcss.config.js",
    "tailwind.config.ts",
    "tailwind.config.js",
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "vitest.config.ts",
    "vitest.config.js",
    "vercel.json",
    "components.json",
}


def _norm(p: str) -> str:
    return p.replace("\\", "/")


def _startswith_path(path: str, prefix: str) -> bool:
    path = _norm(path)
    prefix = prefix.rstrip("/")
    return path == prefix or path.startswith(prefix + "/")


def _suffix(path: str) -> str:
    path = _norm(path)
    i = path.rfind("/")
    name = path[i + 1 :] if i >= 0 else path
    dot = name.rfind(".")
    return name[dot:].lower() if dot > 0 else ""


def _basename(path: str) -> str:
    path = _norm(path)
    i = path.rfind("/")
    return path[i + 1 :] if i >= 0 else path


def _is_generated_path(path: str) -> bool:
    p = _norm(path)
    for pref in GENERATED_DIR_PREFIXES:
        if _startswith_path(p, pref.strip("/")):
            return True
        if f"/{pref}" in p:
            return True
    low = p.lower()
    for suf in GENERATED_SUFFIXES:
        if low.endswith(suf):
            return True
    return False


def _is_binary_asset(path: str) -> bool:
    low = _norm(path).lower()
    for suf in BINARY_ASSET_SUFFIXES:
        if low.endswith(suf):
            return True
    return False


def _is_test_path(path: str) -> bool:
    p = _norm(path)
    if _startswith_path(p, "python/tests"):
        return True
    if _startswith_path(p, "rust/tests"):
        return True
    if _startswith_path(p, "test") and (
        p == "test" or p.startswith("test/")
    ):  # e.g. test/action.test.js
        return True
    bn = _basename(p)
    if bn.endswith(".test.ts") or bn.endswith(".test.js") or bn.endswith(".test.tsx"):
        return True
    if ".spec." in bn and (bn.endswith(".ts") or bn.endswith(".tsx") or bn.endswith(".js")):
        return True
    if bn.endswith("_test.rs"):
        return True
    if bn == "conftest.py":
        return True
    return False


def _is_experiments_path(path: str) -> bool:
    p = _norm(path)
    return _startswith_path(p, "experiments") or _startswith_path(p, "python/aigov_py/experiments")


def _is_data_docs_prefix(path: str) -> bool:
    p = _norm(path)
    for prefix in ("docs/audit/", "docs/evidence/", "docs/packs/"):
        if p.startswith(prefix):
            return True
    return False


def _is_demo_data_file(path: str) -> bool:
    p = _norm(path)
    if not p.startswith("docs/demo/"):
        return False
    low = p.lower()
    return low.endswith(".json") or low.endswith(".jsonl") or low.endswith(".txt")


def categorize(path: str) -> str:
    """Return a single category for a repo-relative path."""
    p = _norm(path)
    bn = _basename(p)

    if bn == ".gitignore" or bn == ".gitattributes":
        return "config_ci"
    if bn == "Dockerfile" or bn.startswith("Dockerfile."):
        return "config_ci"
    if p.lower().endswith(".jsonl") or ".bak" in bn.lower():
        return "data_fixtures_assets"

    if _is_generated_path(p):
        return "generated_build"
    if _is_binary_asset(p):
        return "data_fixtures_assets"
    if _is_experiments_path(p):
        return "experiments"
    if _is_test_path(p):
        return "tests"

    if _is_data_docs_prefix(p):
        if p.lower().endswith(".md"):
            return "docs"
        return "data_fixtures_assets"

    if _is_demo_data_file(p):
        return "data_fixtures_assets"

    if p.startswith("docs/examples/") and p.lower().endswith(".json"):
        return "data_fixtures_assets"

    if p.startswith("docs/schemas/"):
        return "core_source"

    if p.lower().endswith(".md"):
        if p.startswith("docs/") or "/" not in p:
            return "docs"
        if p.startswith("dashboard/"):
            return "docs"

    if p.startswith("docs/"):
        low = p.lower()
        if low.endswith((".md", ".txt", ".rst")):
            return "docs"
        return "data_fixtures_assets"

    if p.startswith(".github/") or p.startswith("scripts/"):
        return "config_ci"
    if p in {".ci", "Makefile", "docker-compose.yml", "Dockerfile", "action.yml", "LICENSE"}:
        return "config_ci"
    if p.startswith(".vscde/"):
        return "config_ci"

    if p == "package.json" or p.startswith("rust/") and _basename(p) in {
        "Cargo.toml",
        "Cargo.lock",
    }:
        return "config_ci"
    if p.startswith("python/") and _basename(p) in {"pyproject.toml", "pytest.ini", "_ci_touch.txt"}:
        return "config_ci"

    if p.startswith("ai_discovery/"):
        if p.lower().endswith(".ts"):
            return "core_source"
        return "config_ci"

    if p.startswith("dashboard/"):
        bn = _basename(p)
        if bn in DASHBOARD_CONFIG_NAMES or (bn.startswith("tsconfig.") and bn.endswith(".json")):
            return "config_ci"
        if bn == ".gitignore":
            return "config_ci"
        return "dashboard"

    if p.startswith("rust/migrations/") and p.lower().endswith(".sql"):
        return "core_source"
    if p.startswith("rust/") and p.lower().endswith(".rs"):
        return "core_source"

    if p.startswith("python/aigov_py/") and p.lower().endswith(".py"):
        return "core_source"
    if p.startswith("python/govai/") and p.lower().endswith(".py"):
        return "core_source"
    if p.startswith("python/") and p.lower().endswith(".md"):
        return "docs"

    if p.startswith("api/"):
        return "core_source"

    if p.startswith("examples/"):
        return "core_source"

    if p == "src/check.js":
        return "core_source"

    low = p.lower()
    if low.endswith(
        (
            ".toml",
            ".yml",
            ".yaml",
            ".json",
            ".sh",
            ".gitignore",
        )
    ):
        if p.startswith("rust/") or p.startswith("python/") or p.startswith("dashboard/"):
            return "config_ci"

    return "other"


def _count_lines(repo_root: Path, rel: str) -> int:
    if _is_binary_asset(rel):
        return 0
    path = repo_root / rel
    try:
        data = path.read_bytes()
    except OSError:
        return 0
    if b"\x00" in data[:65536]:
        return 0
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
    if not text:
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def _git_ls_files(repo_root: Path) -> list[str]:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    cp = subprocess.run(
        ["git", "-c", "core.quotepath=false", "ls-files"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if cp.returncode != 0:
        sys.stderr.write(cp.stderr or "")
        raise RuntimeError("git ls-files failed")
    lines = [ln.strip() for ln in (cp.stdout or "").splitlines() if ln.strip()]
    return sorted(lines)


def _ensure_git_repo(repo_root: Path) -> None:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    cp = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if cp.returncode != 0 or (cp.stdout or "").strip() != "true":
        print(
            "engineering_loc: not a Git repository (expected `git rev-parse --is-inside-work-tree` → true).",
            file=sys.stderr,
        )
        raise SystemExit(2)


def run(repo_root: Path | None = None) -> int:
    root = repo_root or Path.cwd()
    _ensure_git_repo(root)

    paths = _git_ls_files(root)
    files: dict[str, int] = defaultdict(int)
    locs: dict[str, int] = defaultdict(int)

    for rel in paths:
        cat = categorize(rel)
        files[cat] += 1
        locs[cat] += _count_lines(root, rel)

    backend_loc = locs["core_source"]
    frontend_loc = locs["dashboard"]
    product_loc = backend_loc + frontend_loc

    # Summary table
    print("Engineering LOC report (tracked files only, `git ls-files`)\n")
    w_cat = max(len(c) for c in CATEGORIES)
    header = f"| {'Category':<{w_cat}} | {'Files':>8} | {'LOC':>10} |"
    sep = f"|{'-' * (w_cat + 2)}|{'-' * 10}|{'-' * 12}|"
    print(header)
    print(sep)
    total_files = 0
    total_loc = 0
    for c in CATEGORIES:
        fc, lc = files[c], locs[c]
        total_files += fc
        total_loc += lc
        print(f"| {c:<{w_cat}} | {fc:>8} | {lc:>10} |")
    print(sep)
    print(f"| {'TOTAL (all categories)':<{w_cat}} | {total_files:>8} | {total_loc:>10} |")
    print()
    print(f"Backend/core engineering LOC (core_source): {backend_loc}")
    print(f"Frontend/dashboard LOC (dashboard): {frontend_loc}")
    print(f"Product engineering LOC (core_source + dashboard): {product_loc}")
    return 0


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
