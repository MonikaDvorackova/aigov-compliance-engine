from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Verdict = Literal["VALID", "INVALID", "BLOCKED"]
ModelValidation = Literal["passed", "failed"]
EvaluationResult = Literal["pass", "fail"]


FAILURE_TAXONOMY: tuple[str, ...] = (
    "missing_audit_evidence",
    "missing_ai_discovery_output",
    "missing_approval_record",
    "failed_compliance_evaluation",
    "inconsistent_run_context",
    "unavailable_audit_run",
    "partial_evidence",
)


@dataclass(frozen=True)
class GateFields:
    model_validation: ModelValidation
    evidence_complete: bool
    ai_discovery_present: bool
    evaluation_result: EvaluationResult
    approval: str
    trace_consistent: bool
    run_available: bool
    evidence_pack_present: bool
    events_content_sha256_match: bool
    export_digest_match: bool
    artifact_bound_verification: bool


@dataclass(frozen=True)
class RunRecord:
    run_id: str
    condition: str
    is_injected_failure: bool
    model_validation: ModelValidation
    evidence_complete: bool
    ai_discovery_present: bool
    evaluation_result: EvaluationResult
    approval: str
    trace_consistent: bool
    run_available: bool
    evidence_pack_present: bool
    events_content_sha256_match: bool
    export_digest_match: bool
    artifact_bound_verification: bool
    baseline_verdict: Verdict
    gate_verdict: Verdict
    expected_gate_verdict: Verdict


def baseline_logic(model_validation: ModelValidation) -> Verdict:
    if model_validation == "passed":
        return "VALID"
    return "INVALID"


def decision_gate_verdict(
    *,
    evaluation_result: EvaluationResult,
    run_available: bool,
    evidence_pack_present: bool,
    events_content_sha256_match: bool,
    export_digest_match: bool,
    artifact_bound_verification: bool,
    evidence_complete: bool,
    ai_discovery_present: bool,
    approval: str,
    trace_consistent: bool,
) -> Verdict:
    if evaluation_result == "fail":
        return "INVALID"
    if run_available is False:
        return "BLOCKED"
    if evidence_pack_present is not True:
        return "BLOCKED"
    if events_content_sha256_match is not True:
        return "BLOCKED"
    if export_digest_match is not True:
        return "BLOCKED"
    if artifact_bound_verification is not True:
        return "BLOCKED"
    if evidence_complete is not True:
        return "BLOCKED"
    if ai_discovery_present is not True:
        return "BLOCKED"
    if approval != "granted":
        return "BLOCKED"
    if trace_consistent is not True:
        return "BLOCKED"
    return "VALID"


def make_base_fields() -> dict[str, object]:
    return {
        "model_validation": "passed",
        "evidence_complete": True,
        "ai_discovery_present": True,
        "evaluation_result": "pass",
        "approval": "granted",
        "trace_consistent": True,
        "run_available": True,
        "evidence_pack_present": True,
        "events_content_sha256_match": True,
        "export_digest_match": True,
        "artifact_bound_verification": True,
    }


def apply_failure_type(fields: dict[str, object], failure_type: str) -> dict[str, object]:
    updated = dict(fields)

    if failure_type == "missing_audit_evidence":
        updated["evidence_complete"] = False
        updated["evidence_pack_present"] = True
        updated["events_content_sha256_match"] = True
        updated["export_digest_match"] = True
        updated["artifact_bound_verification"] = True

    elif failure_type == "missing_ai_discovery_output":
        updated["ai_discovery_present"] = False
        updated["artifact_bound_verification"] = True

    elif failure_type == "missing_approval_record":
        updated["approval"] = "missing"
        updated["artifact_bound_verification"] = True

    elif failure_type == "failed_compliance_evaluation":
        updated["evaluation_result"] = "fail"
        updated["artifact_bound_verification"] = True

    elif failure_type == "inconsistent_run_context":
        updated["trace_consistent"] = False
        updated["events_content_sha256_match"] = False
        updated["artifact_bound_verification"] = False

    elif failure_type == "unavailable_audit_run":
        updated["run_available"] = False
        updated["evidence_pack_present"] = False
        updated["events_content_sha256_match"] = False
        updated["export_digest_match"] = False
        updated["artifact_bound_verification"] = False

    elif failure_type == "partial_evidence":
        updated["evidence_complete"] = False
        updated["evidence_pack_present"] = True
        updated["events_content_sha256_match"] = False
        updated["export_digest_match"] = False
        updated["artifact_bound_verification"] = False

    else:
        raise ValueError(f"Unsupported failure type: {failure_type}")

    return updated


def run_id_for_cfi(index_1_based: int) -> str:
    return f"cfi-{index_1_based:04d}"


def build_run(*, run_id: str, condition: str, is_injected_failure: bool, fields: dict[str, object]) -> RunRecord:
    mv = fields["model_validation"]
    if mv not in ("passed", "failed"):
        raise TypeError("model_validation")
    er = fields["evaluation_result"]
    if er not in ("pass", "fail"):
        raise TypeError("evaluation_result")

    baseline_verdict = baseline_logic(mv)
    gate_verdict = decision_gate_verdict(
        evaluation_result=er,
        run_available=bool(fields["run_available"]),
        evidence_pack_present=bool(fields["evidence_pack_present"]),
        events_content_sha256_match=bool(fields["events_content_sha256_match"]),
        export_digest_match=bool(fields["export_digest_match"]),
        artifact_bound_verification=bool(fields["artifact_bound_verification"]),
        evidence_complete=bool(fields["evidence_complete"]),
        ai_discovery_present=bool(fields["ai_discovery_present"]),
        approval=str(fields["approval"]),
        trace_consistent=bool(fields["trace_consistent"]),
    )
    return RunRecord(
        run_id=run_id,
        condition=condition,
        is_injected_failure=is_injected_failure,
        model_validation=mv,
        evidence_complete=bool(fields["evidence_complete"]),
        ai_discovery_present=bool(fields["ai_discovery_present"]),
        evaluation_result=er,
        approval=str(fields["approval"]),
        trace_consistent=bool(fields["trace_consistent"]),
        run_available=bool(fields["run_available"]),
        evidence_pack_present=bool(fields["evidence_pack_present"]),
        events_content_sha256_match=bool(fields["events_content_sha256_match"]),
        export_digest_match=bool(fields["export_digest_match"]),
        artifact_bound_verification=bool(fields["artifact_bound_verification"]),
        baseline_verdict=baseline_verdict,
        gate_verdict=gate_verdict,
        expected_gate_verdict=gate_verdict,
    )
