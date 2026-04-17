from __future__ import annotations

from typing import Any

from .client import GovAIClient


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
