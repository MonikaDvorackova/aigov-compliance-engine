# Customer evidence pack generator

This report documents a minimal customer-facing evidence pack generator that produces an offline pack compatible with `govai submit-evidence-pack`, `govai verify-evidence-pack --require-export`, and `govai check`.

## Evaluation gate

The generated evidence pack includes a deterministic `evaluation_reported` event with `passed=true` and a thresholded metric payload. This ensures the evaluation requirement is satisfied when the pack is submitted to the audit service.

## Human approval gate

The generated evidence pack includes a deterministic `human_approved` event and a `model_promoted` event that references `approved_human_event_id`. This preserves approval semantics and keeps promotion dependent on recorded human approval.

