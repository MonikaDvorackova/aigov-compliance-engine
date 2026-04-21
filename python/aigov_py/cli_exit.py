"""
Exit codes for the ``govai`` CLI (Terminal SDK v0.1).

0 — Success (command completed; for ``verify``, verdict VALID).
1 — Failed (network, HTTP error, API error from assessment routes, unexpected exception).
2 — Invalid arguments (argparse) or ``verify`` verdict INVALID / local checks failed.
"""

from __future__ import annotations

EX_OK = 0
EX_ERR = 1
EX_INVALID = 2
