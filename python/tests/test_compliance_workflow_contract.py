"""Static contract checks for production compliance workflow (no YAML parser dependency)."""

from __future__ import annotations

from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _compliance_yml() -> str:
    path = _repo_root() / ".github" / "workflows" / "compliance.yml"
    return path.read_text(encoding="utf-8")


def test_govai_compliance_gate_includes_in_repo_pull_request_path() -> None:
    text = _compliance_yml()
    start = text.index("  govai-compliance-gate:")
    block = text[start : start + 3500]
    assert "github.event_name == 'pull_request'" in block
    assert "github.event.pull_request.head.repo.full_name == github.repository" in block


def test_evidence_pack_waits_on_ready_not_status() -> None:
    text = _compliance_yml()
    idx = text.index("  evidence_pack:")
    block = text[idx : idx + 12000]
    assert "${AUDIT_URL%/}/ready" in block or '"/ready"' in block or "/ready" in block
    assert "${AUDIT_URL%/}/status" not in block


def test_hosted_compliance_gate_uses_pypi_pin_not_editable_install() -> None:
    text = _compliance_yml()
    gate = text.index("  govai-compliance-gate:")
    snippet = text[gate : gate + 4000]
    assert 'aigov-py==0.2.0' in snippet
    assert "pip install -e ./python" not in snippet


def test_workflow_still_uses_editable_for_repo_local_ci_build() -> None:
    text = _compliance_yml()
    assert "pip install -e ." in text


def _workflow_job_declaration_body(lines: list[str], job_key: str) -> str:
    start = lines.index(f"  {job_key}:")
    parts: list[str] = []
    for j in range(start + 1, len(lines)):
        line = lines[j]
        if (
            len(line) >= 2
            and line.startswith("  ")
            and not line.startswith("    ")
            and line.rstrip().endswith(":")
        ):
            break
        parts.append(line)
    return "\n".join(parts)


def test_required_jobs_always_run_so_branch_checks_resolve() -> None:
    """Branch protection waits forever when a required job is skipped."""
    lines = _compliance_yml().splitlines()
    required = (
        "reports_present",
        "report_gate",
        "report_content",
        "make_verify",
        "evidence_pack",
        "upload_evidence_packs",
    )
    for job_key in required:
        decl = _workflow_job_declaration_body(lines, job_key)
        got_name = False
        for raw in decl.splitlines():
            s = raw.strip()
            if s.startswith("name:"):
                got_name = s.split(":", 1)[1].strip() == job_key
                break
        assert got_name, f"{job_key} must set name: {job_key} as first-class required check title"
        assert "if: ${{ always() }}" in decl, job_key
        assert (
            "Branch protection prelude (upstream must succeed)" in decl
        ), job_key
