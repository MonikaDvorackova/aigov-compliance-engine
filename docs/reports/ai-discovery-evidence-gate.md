# AI discovery evidence gate

## Summary
Adds AI discovery as a source of compliance requirements and enforces evidence obligations based on detected AI usage.

## Evaluation gate
A run must be BLOCKED if AI usage is detected but required evidence is missing.

## Human approval gate
If AI usage is present, approval must explicitly confirm compliance readiness. Missing approval results in BLOCKED.

## Evidence gate
Detected AI usage generates required evidence. Export must include required, provided, and missing evidence.

## Determinism
Discovery findings and derived requirements must be stable for the same repository state.

## Verification
python -m pytest -q
