"""Static checks on workflow YAML (text-based; no PyYAML dependency)."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_govai_compliance_gate_allows_same_repo_pr_and_branch_cli() -> None:
    p = REPO_ROOT / ".github/workflows/compliance.yml"
    text = p.read_text(encoding="utf-8")
    start = text.find("  govai-compliance-gate:\n")
    assert start != -1
    segment = text[start : start + 4000]
    assert "github.event_name != 'pull_request' && github.ref == 'refs/heads/main'" not in segment
    assert "python -m pip install -e ./python" in segment
    assert "python -m pip install -e ./python" in segment
    assert "github.event.pull_request.head.repo.full_name == github.repository" in segment


def test_govai_compliance_gate_not_skipped_for_all_pull_requests() -> None:
    p = REPO_ROOT / ".github/workflows/compliance.yml"
    text = p.read_text(encoding="utf-8")
    assert "if: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/main'" not in text


def test_govai_ci_waits_on_ready() -> None:
    p = REPO_ROOT / ".github/workflows/govai-ci.yml"
    t = p.read_text(encoding="utf-8")
    assert "8088/ready" in t
    assert "Wait for audit readiness" in t


def test_compliance_workflow_uses_ready_for_local_audit() -> None:
    p = REPO_ROOT / ".github/workflows/compliance.yml"
    t = p.read_text(encoding="utf-8")
    assert "expected HTTP 200 from GET /ready" in t or '"/ready"' in t
