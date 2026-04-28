# Discovery usage metering

## Summary

This change ensures that accepted `ai_discovery_reported` evidence increments the tenant scoped `discovery_scans_count` usage counter.

Unrelated evidence types do not increment discovery scan usage.

## Evaluation gate

The evaluation gate remains unchanged. This change only updates usage metering after accepted discovery evidence submission.

## Human approval gate

The human approval gate remains unchanged. No compliance verdict or approval semantics were modified.

## Tenant isolation

Discovery usage is scoped by the existing tenant or project context. A discovery evidence submission under one tenant does not affect usage counters visible to another tenant.

## Tests

The usage operations HTTP test verifies:

- usage before discovery has `discovery_scans_count == 0`
- unrelated evidence does not increment discovery usage
- accepted `ai_discovery_reported` evidence increments discovery usage
- another tenant does not see the increment
