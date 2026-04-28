# Strict GovAI CI misconfiguration handling

## Summary
The customer-facing GovAI CI gate now fails fast when required configuration is missing.

## Motivation
A compliance gate must not pass because it is misconfigured. Missing audit URL, API key, or run id means the gate cannot fetch a reliable compliance verdict.

## Changed behavior
Before this change, missing configuration could produce a successful skip.

After this change, the customer-facing workflow exits non-zero when any required value is missing:
- GOVAI_AUDIT_BASE_URL
- GOVAI_API_KEY
- GOVAI_RUN_ID

## Evaluation gate
The compliance verdict logic is unchanged. The workflow only adds a strict preflight before running govai check.

## Human approval gate
Human approval semantics are unchanged. This change does not alter approval requirements or compliance decision logic.

## Validation
The fail-fast shell logic was simulated locally for missing variables and verified to fail before govai check runs.
