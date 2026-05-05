#!/usr/bin/env python3
"""Smoke tests for scripts/engineering_loc.py (stdlib only)."""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def test_runs_inside_repo() -> None:
    root = _repo_root()
    cp = subprocess.run(
        [sys.executable, str(root / "scripts" / "engineering_loc.py")],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert cp.returncode == 0, cp.stderr + cp.stdout
    out = cp.stdout
    assert "Engineering LOC" in out
    assert "| core_source" in out
    assert "| dashboard" in out
    assert "| experiments" in out
    assert "Backend/core engineering LOC" in out
    assert "Frontend/dashboard LOC" in out
    assert "Product engineering LOC" in out


def test_fails_outside_git_repo() -> None:
    root = _repo_root()
    script = root / "scripts" / "engineering_loc.py"
    with tempfile.TemporaryDirectory() as td:
        cp = subprocess.run(
            [sys.executable, str(script)],
            cwd=td,
            capture_output=True,
            text=True,
            check=False,
        )
    assert cp.returncode == 2
    assert "not a Git repository" in (cp.stderr or "")


def main() -> None:
    test_runs_inside_repo()
    test_fails_outside_git_repo()
    print("engineering_loc smoke: OK")


if __name__ == "__main__":
    main()
