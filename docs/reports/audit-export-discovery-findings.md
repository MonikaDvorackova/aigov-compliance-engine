# Audit export discovery findings

## Summary

This change exposes AI discovery findings in the audit export so that downstream reviewers can see which AI-related files, dependencies, or model artifacts were detected during the compliance run.

## Scope

The export now includes structured discovery findings with detector metadata, confidence, matched pattern information where available, file path, and hash.

## Decision impact

This change does not alter verdict semantics.

The compliance decision remains driven by the existing evaluation, evidence, approval, and promotion logic. Discovery findings are exported as audit context and provenance, not as a new decision rule.

## Required evidence

Discovery findings can support evidence review by showing which AI-related assets were identified during discovery.

## Provided evidence

The audit export includes discovery findings when available.

## Missing evidence

This change does not change missing evidence calculation.

## Evaluation gate

The evaluation gate remains unchanged. Discovery findings are informational export data unless existing policy logic already treats discovery output as evidence.

## Human approval gate

The human approval gate remains unchanged. Human approval semantics are not modified by this export addition.

## Promotion gate

The promotion gate remains unchanged. Promotion is still controlled by the existing pass, approval, and policy conditions.

## Compatibility

Existing export fields remain preserved. The change adds discovery findings without removing existing required, provided, missing, hash, timestamp, or decision fields.

## Validation

Run:

```bash
cd rust
cargo test --test audit_export
cargo test --test export_http
cargo test
