from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

# directories we NEVER scan
IGNORED_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    "target",
    "dist",
    "build",
    ".next",
}

# file size cap (1MB)
MAX_FILE_SIZE = 1_000_000


def _is_text_file(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size <= MAX_FILE_SIZE
    except Exception:
        return False


def _relpath(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except Exception:
        return str(path)


def _git_available(root: Path) -> bool:
    try:
        subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=str(root),
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
        )
        return True
    except Exception:
        return False


def _git_change_summary(root: Path, rel_file: str) -> dict[str, Any] | None:
    """
    Best-effort, deterministic-ish summary that works in CI.
    Returns None if git is unavailable.
    """
    if not _git_available(root):
        return None
    try:
        cp = subprocess.run(
            ["git", "log", "-n", "1", "--pretty=format:%H|%ad|%s", "--date=iso-strict", "--", rel_file],
            cwd=str(root),
            check=False,
            capture_output=True,
            text=True,
            timeout=2,
        )
        line = (cp.stdout or "").strip()
        if not line:
            return {"commits": 0}
        parts = line.split("|", 2)
        if len(parts) != 3:
            return {"commits": 1}
        commit, ts, subject = parts
        return {
            "commits": 1,
            "last_commit": {"sha": commit, "ts": ts, "subject": subject},
        }
    except Exception:
        return None


def _scan_requirements(path: Path) -> set[str]:
    packages: set[str] = set()
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return packages

    for line in text.splitlines():
        line = line.strip().lower()
        if not line or line.startswith("#"):
            continue
        pkg = line.split("==")[0].split(">=")[0].strip()
        packages.add(pkg)
    return packages


def _scan_package_json(path: Path) -> set[str]:
    deps: set[str] = set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return deps

    for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        block = data.get(key, {})
        if isinstance(block, dict):
            for dep in block.keys():
                deps.add(dep.lower())

    return deps


def scan_repo(
    root: Path,
    *,
    include_history: bool = True,
) -> dict[str, Any]:
    root = root.resolve()

    openai = False
    transformers = False
    model_artifacts = False

    findings: list[dict[str, Any]] = []

    for path in sorted(root.rglob("*")):
        if any(part in IGNORED_DIRS for part in path.parts):
            continue

        rel = _relpath(path, root)

        # --- model artifacts (filename only)
        if path.is_file():
            name = path.name.lower()

            if name.endswith((".pt", ".pth", ".onnx", ".safetensors")):
                model_artifacts = True
                findings.append(
                    {
                        "detected_ai_usage": "model_artifact",
                        "file_path": rel,
                        "detector_type": "artifact_extension",
                        "confidence": 0.95,
                        "evidence": {"reason": "extension", "ext": path.suffix.lower()},
                        "change_summary": _git_change_summary(root, rel) if include_history else None,
                    }
                )
                continue

            if name == "pytorch_model.bin":
                model_artifacts = True
                findings.append(
                    {
                        "detected_ai_usage": "model_artifact",
                        "file_path": rel,
                        "detector_type": "artifact_filename",
                        "confidence": 0.98,
                        "evidence": {"reason": "pytorch_model.bin"},
                        "change_summary": _git_change_summary(root, rel) if include_history else None,
                    }
                )
                continue

        # --- requirements.txt
        if path.name.startswith("requirements") and path.suffix == ".txt":
            pkgs = _scan_requirements(path)

            if "openai" in pkgs:
                openai = True
                findings.append(
                    {
                        "detected_ai_usage": "openai",
                        "file_path": rel,
                        "detector_type": "dependency_requirements_txt",
                        "confidence": 0.9,
                        "evidence": {"reason": "requirements", "package": "openai"},
                        "change_summary": _git_change_summary(root, rel) if include_history else None,
                    }
                )

            if "transformers" in pkgs:
                transformers = True
                findings.append(
                    {
                        "detected_ai_usage": "transformers",
                        "file_path": rel,
                        "detector_type": "dependency_requirements_txt",
                        "confidence": 0.9,
                        "evidence": {"reason": "requirements", "package": "transformers"},
                        "change_summary": _git_change_summary(root, rel) if include_history else None,
                    }
                )

        # --- package.json
        if path.name == "package.json":
            deps = _scan_package_json(path)

            if "openai" in deps:
                openai = True
                findings.append(
                    {
                        "detected_ai_usage": "openai",
                        "file_path": rel,
                        "detector_type": "dependency_package_json",
                        "confidence": 0.9,
                        "evidence": {"reason": "package_json", "package": "openai"},
                        "change_summary": _git_change_summary(root, rel) if include_history else None,
                    }
                )

            if "transformers" in deps:
                transformers = True
                findings.append(
                    {
                        "detected_ai_usage": "transformers",
                        "file_path": rel,
                        "detector_type": "dependency_package_json",
                        "confidence": 0.9,
                        "evidence": {"reason": "package_json", "package": "transformers"},
                        "change_summary": _git_change_summary(root, rel) if include_history else None,
                    }
                )

        # --- text scan (code)
        if _is_text_file(path):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            if (
                "OpenAI(" in text
                or ".chat.completions" in text
                or ".responses.create" in text
                or "import openai" in text
                or "from openai" in text
            ):
                openai = True
                findings.append(
                    {
                        "detected_ai_usage": "openai",
                        "file_path": rel,
                        "detector_type": "code_signature",
                        "confidence": 0.75,
                        "evidence": {"reason": "code", "signature": "openai_sdk"},
                        "change_summary": _git_change_summary(root, rel) if include_history else None,
                    }
                )

            if (
                "from transformers" in text
                or "import transformers" in text
                or "pipeline(" in text
                or "AutoModel" in text
                or "AutoTokenizer" in text
            ):
                transformers = True
                findings.append(
                    {
                        "detected_ai_usage": "transformers",
                        "file_path": rel,
                        "detector_type": "code_signature",
                        "confidence": 0.75,
                        "evidence": {"reason": "code", "signature": "transformers"},
                        "change_summary": _git_change_summary(root, rel) if include_history else None,
                    }
                )

    return {
        "schema_version": "aigov.discovery_scan.v2",
        "root": str(root),
        "root_relative": os.getcwd() if os.getcwd() else None,
        "openai": openai,
        "transformers": transformers,
        "model_artifacts": model_artifacts,
        "findings": findings,
    }