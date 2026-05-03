"""Static contract checks for production compliance workflow (no YAML parser dependency)."""

from __future__ import annotations

from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _compliance_yml() -> str:
    path = _repo_root() / ".github" / "workflows" / "compliance.yml"
    return path.read_text(encoding="utf-8")


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


def test_govai_compliance_gate_includes_in_repo_pull_request_path() -> None:
    lines = _compliance_yml().splitlines()
    block = _workflow_job_declaration_body(lines, "govai-compliance-gate")
    assert 'ev="${{ github.event_name }}"' in block
    assert '[ "${ev}" = "pull_request" ]' in block
    assert "github.event.pull_request.head.repo.full_name" in block
    assert "github.repository" in block


def test_evidence_pack_waits_on_ready_not_status() -> None:
    text = _compliance_yml()
    idx = text.index("  evidence_pack:")
    block = text[idx : idx + 12000]
    assert "${AUDIT_URL%/}/ready" in block or '"/ready"' in block or "/ready" in block
    assert "${AUDIT_URL%/}/status" not in block


def test_hosted_compliance_gate_uses_pypi_pin_not_editable_install() -> None:
    lines = _compliance_yml().splitlines()
    block = _workflow_job_declaration_body(lines, "govai-compliance-gate")
    assert 'aigov-py==0.2.1' in block
    assert "pip install -e ./python" not in block


def test_hosted_gate_artifact_bound_submit_and_verify() -> None:
    lines = _compliance_yml().splitlines()
    block = _workflow_job_declaration_body(lines, "govai-compliance-gate")
    assert "submit-evidence-pack" in block
    assert "verify-evidence-pack" in block
    assert "evidence_digest_manifest.json" in block


def test_workflow_still_uses_editable_for_repo_local_ci_build() -> None:
    text = _compliance_yml()
    assert "pip install -e ." in text


def test_govai_emit_run_id_appends_github_workflow_identity() -> None:
    """Hosted ledger run_id must differ per workflow run while basename PR rules stay strict."""
    text = _compliance_yml()
    assert 'echo "run_id=${only}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"' in text
    assert 'RUN_ID="${EMITTED_RUN_ID}"' in text
    assert 'cp "docs/reports/${REPORT_BASENAME}.md" "docs/reports/${RUN_ID}.md"' in text


def test_compliance_pull_request_trigger_has_no_activity_types_filter() -> None:
    """A narrow `types:` list can skip runs so the PR head SHA never gets required check-runs."""
    text = _compliance_yml()
    on_block = text[text.index("on:") : text.index("\njobs:")]
    pr_segment = on_block.split("push:", 1)[0]
    assert "pull_request:" in pr_segment
    assert "types:" not in pr_segment


def test_required_jobs_always_run_so_branch_checks_resolve() -> None:
    """Branch protection waits forever when a required job is skipped.

    GitHub skips dependents when a needed job fails unless the dependent job uses
    `if: ${{ always() }}`. Using `always() && !cancelled()` can drop required jobs on
    cancelled/superseded runs so checks never attach to the head SHA.
    """
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
        assert "!cancelled()" not in decl, job_key
        job_level_if_lines = [
            ln.rstrip() for ln in decl.splitlines() if ln.startswith("    if:") and not ln.startswith("      ")
        ]
        assert job_level_if_lines == ["    if: ${{ always() }}"], (job_key, job_level_if_lines)
        assert (
            "Branch protection prelude (upstream must succeed)" in decl
        ), job_key
