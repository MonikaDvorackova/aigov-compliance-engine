# Repository prevalence snapshot — coding rubric

This document is the **transparent coding rubric** for the offline prevalence script `experiments/repository_prevalence_check.py`. It does **not** assert statistical representativeness: the sample is a **fixed, manually coded list of thirty public repositories** in deterministic order.

## Purpose

Each boolean signal answers a single, auditable question about **what is plausibly inferable from public repository metadata and conventions** (README, CI config paths, governance docs, release workflows) at coding time. The script performs **no network fetch**; codings are committed in source.

## Signals (boolean)

| Signal | **True** when |
|--------|----------------|
| `model_validation_present` | Repository routinely ships automated checks on model or training code quality (e.g. unit tests, CI on core library) such that a “model-centric validation” story is credible. |
| `ci_present` | Continuous integration is observable (e.g. GitHub Actions / other CI configs in tree). |
| `deployment_or_promotion_present` | Release, deployment, or promotion path is documented or automated beyond merge-to-main only. |
| `audit_evidence_trace_present` | Evidence of audit-oriented artefacts or trails (security/policy scans, SBOM, signed releases, dedicated audit docs) beyond generic CI. |
| `ai_discovery_or_inventory_present` | Explicit AI/ML inventory, model cards, dependency declaration for AI stacks, or discovery-style reporting is present. |
| `explicit_approval_gate_present` | Human or role-based approval for releases/changes is explicit (CODEOWNERS on sensitive paths, environment gates, manual promotion). |
| `decision_record_present` | Change logs, ADRs, RFCs, or release notes tie decisions to rationale in a durable record. |
| `run_to_decision_traceability_present` | CI run identifiers, deployment tickets, or artefact naming suggests traceability from an automation run to a release decision. |

## Derived fields

- **`decision_signal_count`**: count of the five decision-facing booleans (`audit_evidence_trace_present` … `run_to_decision_traceability_present`).
- **`auditability_score`**: `decision_signal_count / 5`.
- **`has_model_centric_validation`**: `model_validation_present` OR `ci_present`.
- **`has_partial_auditability`**: `decision_signal_count >= 2`.
- **`has_strong_auditability`**: `decision_signal_count >= 4`.
- **`has_complete_decision_level_auditability`**: `decision_signal_count == 5`.
- **`auditability_gap_present`**: `has_model_centric_validation` AND NOT `has_complete_decision_level_auditability`.

## Reproducibility artefact

Running `python experiments/repository_prevalence_check.py` writes `experiments/output/repository_prevalence_repro.json` with generation time, script path, row-order note, and a pointer to this rubric.

## Limitations

- **Non-random sample**; counts are **illustrative**, not population prevalence.
- Codings can become **stale** as repositories evolve; the committed snapshot is frozen until manually updated.
- Signals are **coarse**; two coders might disagree on edge cases—inter-rater review is not automated here.

## Evaluation gate

This report is documentation only. It does not change runtime compliance verdict logic, CI gate predicates, tenant isolation, evidence hashing, or deployment behavior.

Evaluation status: reviewed for consistency with the current experiment outputs and repository state.

## Human approval gate

This report is not a production promotion artifact by itself.

Human approval status: pending PR review. The report must be reviewed together with the related code, experiment artifacts, and CI results before merge.
