# Auditability Experiment

## Evaluation gate

This experiment evaluates detection of auditability failures under model-centric and decision-centric evaluation.

The evaluation includes:
- synthetic runs with controlled failure classes
- noisy and partial failure scenarios
- replay of GovAI audit logs

The decision-centric gate enforces:
- completeness of audit events
- consistency of run context
- presence of required evidence
- explicit approval state

## Human approval gate

The experiment does not modify production decision logic.

All results are generated from synthetic data or replayed audit logs.

No production decisions are affected.

Approval: Monika Dvorackova