# Repository prevalence check (systems experiment)

This report documents an **illustrative, offline prevalence-style summary** over a **curated sample** of thirty public ML/AI-related repositories. It is **not statistically representative**: there is **no formal population**, no stratified sampling, and no inference to “all OSS” behavior. Booleans reflect **offline manual coding** encoded once in source for deterministic reproduction; classifications are illustrative, not audited per upstream release.

The experiment uses a **graded auditability maturity** scale (0–5) derived by counting observable **decision-facing** signals rather than collapsing readiness into **binary decision-level classification**. That replaces the older all-or-nothing conjunction semantics.

Run `experiments/repository_prevalence_check.py` to regenerate artifacts; it performs **no network I/O**.

## Fields and derivations

**Base booleans (per repo):**

- `repo_name`, `repo_url`, `domain`
- `model_validation_present`, `ci_present`, `deployment_or_promotion_present`
- `audit_evidence_trace_present`, `ai_discovery_or_inventory_present`,
  `explicit_approval_gate_present`, `decision_record_present`,
  `run_to_decision_traceability_present`

**Derived:**

- `has_model_centric_validation` = `model_validation_present` OR `ci_present`
- `decision_signal_count` = count of True among the five decision-facing flags above (excluding MV/CI/deployment).
- `auditability_score` = `decision_signal_count / 5`
- `auditability_maturity` = integer 0 (`none`) through 5 (`complete`), aligned with signal count tiers (weak … complete).
- `has_partial_auditability` = `decision_signal_count >= 2`
- `has_strong_auditability` = `decision_signal_count >= 4`
- `has_complete_decision_level_auditability` = `decision_signal_count == 5`
- `auditability_gap_present` = model-centric validation present but **not** complete decision-stack under the scripted five-signal grading.

Aggregate metrics emitted in the summary include **model-centric validation rate**, **mean auditability score**, **partial / strong / complete** rates, **auditability gap rate**, and **per-signal rates**.

## Outputs

Paths relative to repo root:

- `experiments/output/repository_prevalence_repos.csv`
- `experiments/output/repository_prevalence_repos.json`
- `experiments/output/repository_prevalence_summary.csv`
- `experiments/output/repository_prevalence_table.tex` (includes per-signal rows and mean score)

Regenerate:

```bash
python experiments/repository_prevalence_check.py
```

## Limitations

- **Curated sample**, **not statistically representative**.
- Labels are frozen **offline manual coding** — not exhaustive and not refreshed on each upstream push.
- Maturity tiers **grade breadth** of signals; they **do not** certify legal or regulatory posture.
