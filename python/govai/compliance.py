from __future__ import annotations

from typing import Any

from .client import GovAIClient


def current_state_from_summary(compliance_summary: dict[str, Any]) -> dict[str, Any] | None:
    """
    Return ``current_state`` from a compliance summary response when ``ok`` is true.

    If ``ok`` is not true or ``current_state`` is missing or not a dict, returns ``None``.
    Successful summaries place the projection at the top-level key ``current_state``
    (schema ``aigov.compliance_current_state.v2`` on the server).
    """
    if compliance_summary.get("ok") is not True:
        return None
    raw = compliance_summary.get("current_state")
    if isinstance(raw, dict):
        return raw
    return None


def decision_signals(current_state: dict[str, Any]) -> dict[str, Any]:
    """
    Extract common readiness fields from a ``current_state`` object.

    These fields align with the server's projection (evaluation, approval, promotion).
    They are **signals**, not a single VALID/INVALID/BLOCKED label; UIs derive that
    label from rule order (evaluation → approval → promotion). See README
    "Decision-Oriented Compliance".
    """
    model = current_state.get("model") if isinstance(current_state.get("model"), dict) else {}
    promotion = model.get("promotion") if isinstance(model.get("promotion"), dict) else {}
    approval = current_state.get("approval") if isinstance(current_state.get("approval"), dict) else {}
    return {
        "evaluation_passed": model.get("evaluation_passed"),
        "promotion_state": promotion.get("state"),
        "model_promoted_present": promotion.get("model_promoted_present"),
        "human_approval_decision": approval.get("human_approval_decision"),
        "risk_review_decision": approval.get("risk_review_decision"),
    }


def decision_signals_from_summary(compliance_summary: dict[str, Any]) -> dict[str, Any] | None:
    """Combine :func:`current_state_from_summary` and :func:`decision_signals`."""
    cs = current_state_from_summary(compliance_summary)
    if cs is None:
        return None
    return decision_signals(cs)


def get_compliance_summary(client: GovAIClient, run_id: str) -> dict[str, Any]:
    """
    GET ``/compliance-summary?run_id=...``.

    Returns the full JSON object (including ``ok: false`` and ``error`` when the run
    cannot be loaded); callers inspect ``ok`` as per the API contract.
    """
    data = client.request_json(
        "GET",
        "/compliance-summary",
        params={"run_id": run_id},
        raise_on_body_ok_false=False,
    )
    if not isinstance(data, dict):
        raise TypeError(f"expected dict from /compliance-summary, got {type(data).__name__}")
    return data
