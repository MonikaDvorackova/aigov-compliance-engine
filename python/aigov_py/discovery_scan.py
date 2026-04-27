from __future__ import annotations

import json
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


def scan_repo(root: Path) -> dict[str, Any]:
    root = root.resolve()

    openai = False
    transformers = False
    model_artifacts = False

    findings: list[dict[str, Any]] = []

    for path in sorted(root.rglob("*")):
        if any(part in IGNORED_DIRS for part in path.parts):
            continue

        # --- model artifacts (filename only)
        if path.is_file():
            name = path.name.lower()

            if name.endswith((".pt", ".pth", ".onnx", ".safetensors")):
                model_artifacts = True
                findings.append({"type": "model_artifact", "file": str(path), "reason": "extension"})
                continue

            if name == "pytorch_model.bin":
                model_artifacts = True
                findings.append({"type": "model_artifact", "file": str(path), "reason": "pytorch_model"})
                continue

        # --- requirements.txt
        if path.name.startswith("requirements") and path.suffix == ".txt":
            pkgs = _scan_requirements(path)

            if "openai" in pkgs:
                openai = True
                findings.append({"type": "openai", "file": str(path), "reason": "requirements"})

            if "transformers" in pkgs:
                transformers = True
                findings.append({"type": "transformers", "file": str(path), "reason": "requirements"})

        # --- package.json
        if path.name == "package.json":
            deps = _scan_package_json(path)

            if "openai" in deps:
                openai = True
                findings.append({"type": "openai", "file": str(path), "reason": "package_json"})

            if "transformers" in deps:
                transformers = True
                findings.append({"type": "transformers", "file": str(path), "reason": "package_json"})

        # --- text scan (code)
        if _is_text_file(path):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            if not openai:
                if (
                    "openai" in text
                    or "OpenAI(" in text
                    or ".chat.completions" in text
                    or ".responses.create" in text
                ):
                    openai = True
                    findings.append({"type": "openai", "file": str(path), "reason": "code"})

            if not transformers:
                if (
                    "transformers" in text
                    or "pipeline(" in text
                    or "AutoModel" in text
                    or "AutoTokenizer" in text
                ):
                    transformers = True
                    findings.append({"type": "transformers", "file": str(path), "reason": "code"})

    return {
        "openai": openai,
        "transformers": transformers,
        "model_artifacts": model_artifacts,
        "findings": findings,
    }