"""
Minimal GovAI HTTP client for the audit API (evidence ingest, bundle, compliance summary).

This package is intentionally thin: no business logic beyond HTTP and response handling.
"""

from .bundle import get_bundle, get_bundle_hash
from .client import GovAIClient
from .compliance import get_compliance_summary
from .evidence import submit_event

__all__ = [
    "GovAIClient",
    "get_bundle",
    "get_bundle_hash",
    "get_compliance_summary",
    "submit_event",
]
