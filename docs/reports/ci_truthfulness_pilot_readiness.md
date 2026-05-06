# CI truthfulness pilot readiness

Run ID: ci_truthfulness_pilot_readiness

## Summary

This change hardens CI truthfulness for pilot readiness.

It adds Rust test execution to the mandatory compliance path, extends BLOCKED contract validation to staging pull requests, uses the workspace GovAI CLI in hosted gate validation, enables strict policy mode in CI, and wires a deterministic golden path e2e test into the Python test suite.

## Evaluation gate

PASS.

Evidence:
- cd rust && cargo test --all --locked passes
- cd python && python -m pytest -q passes
- Rust billing HTTP tests now use deterministic API key configuration and explicit Authorization headers
- Test ledger isolation uses per-test GOVAI_LEDGER_DIR instead of shared process chdir

## Human approval gate

PASS.

This change is approved as a CI truthfulness and pilot-readiness hardening change.

## Risk

Primary risk is increased CI runtime and stricter failure detection.

This is intentional. The previous state allowed green CI without proving Rust behaviour.

## Rollback

Revert this report and the CI hardening commit if the stricter gate causes unacceptable CI instability.
