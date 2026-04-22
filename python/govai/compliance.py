from __future__ import annotations

from typing import Any


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


def compliance_decision_label(summary: dict[str, Any]) -> str:
    """
    Map flat readiness fields to **VALID**, **INVALID**, or **BLOCKED**.

    ``summary`` must contain: ``evaluation_passed``, ``human_approval_present``,
    ``model_promoted_present`` (see :func:`compliance_decision_inputs_from_api`).
    """
    if summary.get("evaluation_passed") is False:
        return "INVALID"

    if summary.get("evaluation_passed") is not True:
        return "BLOCKED"

    if summary.get("human_approval_present") is not True:
        return "BLOCKED"

    if summary.get("model_promoted_present") is not True:
        return "BLOCKED"

    return "VALID"


def compliance_decision_inputs_from_api(api: dict[str, Any]) -> dict[str, Any]:
    """
    Map a ``/compliance-summary`` JSON body to a flat dict for :func:`compliance_decision_label`.

    Malformed or unexpected shapes fail closed: values that drive ``None``/non-``True``
    and yield **BLOCKED** in :func:`compliance_decision_label` unless evaluation is **INVALID**.

    If the API reports ``ok`` is not true, the summary is not trusted: return conservative inputs.
    """
    try:
        if not isinstance(api, dict) or api.get("ok") is not True:
            return {
                "evaluation_passed": None,
                "human_approval_present": None,
                "model_promoted_present": None,
            }
        current = api.get("current_state") or {}
        model = current.get("model") or {}
        approval = current.get("approval") or {}
        promotion = current.get("promotion") or {}

        return {
            "evaluation_passed": model.get("evaluation_passed"),
            "human_approval_present": approval.get("approved"),
            "model_promoted_present": promotion.get("promoted"),
        }
    except Exception:
        return {
            "evaluation_passed": None,
            "human_approval_present": None,
            "model_promoted_present": None,
        }
