"""
Thin HTTP client for the GovAI Rust audit API: evidence ingest, bundle, compliance summary,
and hash-chain verification (``GET /verify``).

No business logic beyond HTTP and response handling.
"""

from .bundle import get_bundle, get_bundle_hash
from .client import GovAIAPIError, GovAIClient, GovAIError, GovAIHTTPError
from .compliance import (
    current_state_from_summary,
    decision_signals,
    decision_signals_from_summary,
    get_compliance_summary,
)
from .evidence import submit_event
from .verify import verify_chain

__all__ = [
    "GovAIAPIError",
    "GovAIClient",
    "GovAIError",
    "GovAIHTTPError",
    "current_state_from_summary",
    "decision_signals",
    "decision_signals_from_summary",
    "get_bundle",
    "get_bundle_hash",
    "get_compliance_summary",
    "submit_event",
    "verify_chain",
]
