# Repository prevalence check (systems experiment)

This report documents an **illustrative, offline prevalence-style summary** over **30 curated public ML/AI repositories**. It supports a **graded auditability maturity** view (signals counted 0–5) rather than a single all-or-nothing bar.

Signals are encoded as **deterministic offline manual coding** in the experiment script: **no network access**, reproducible CSV/JSON/LaTeX outputs. The sample is **not statistically representative**, **not exhaustive**, and makes **no inference** to all open-source ML practice.

Run `experiments/repository_prevalence_check.py` from the repo root to regenerate artefacts. **No Rust, API/backend, or CI workflow changes** are involved; results have **no production impact**.

## Evaluation gate

The script computes base booleans per repo (**model validation**, **CI**, **deployment/promotion**, and five decision-facing signals), then derives **`has_model_centric_validation`**, **`decision_signal_count`**, **`auditability_score`**, **`auditability_maturity`** (0 = none … 5 = complete), **`has_partial_auditability`**, **`has_strong_auditability`**, **`has_complete_decision_level_auditability`**, and **`auditability_gap_present`**. Aggregate metrics (**counts and rates**) are emitted to the summary file for prevalence-style reporting aligned with audit-style gate thinking.

## Human approval gate

The curated rows include **`explicit_approval_gate_present`** as one decision-facing signal alongside audit trace, discovery/inventory, decision records, and run-to-decision traceability. The prevalence check does **not** verify live org policy—only whether the scripted illustrative coding marks an explicit approval-style control as observable in this fixed snapshot.

## Fields and derivations

**Base booleans (per repo):**

- `repo_name`, `repo_url`, `domain`
- `model_validation_present`, `ci_present`, `deployment_or_promotion_present`
- `audit_evidence_trace_present`, `ai_discovery_or_inventory_present`,
  `explicit_approval_gate_present`, `decision_record_present`,
  `run_to_decision_traceability_present`

**Derived:**

- `has_model_centric_validation` = `model_validation_present` OR `ci_present`
- `decision_signal_count` = count of `True` among the five decision-facing flags above (excluding MV/CI/deployment)
- `auditability_score` = `decision_signal_count / 5`
- `auditability_maturity`: 0 (`none`) through 5 (`complete`), aligned with the signal count
- `has_partial_auditability` = `decision_signal_count >= 2`
- `has_strong_auditability` = `decision_signal_count >= 4`
- `has_complete_decision_level_auditability` = `decision_signal_count == 5`
- `auditability_gap_present` = model-centric validation present but **not** complete decision-stack under the five-signal grading

## Outputs

Paths relative to repo root:

- `experiments/output/repository_prevalence_repos.csv`
- `experiments/output/repository_prevalence_repos.json`
- `experiments/output/repository_prevalence_summary.csv`
- `experiments/output/repository_prevalence_table.tex` (Signal / Repositories / Rate; mean score uses `---` in the repositories column)

Regenerate (**offline**):

```bash
python experiments/repository_prevalence_check.py
```

## Limitations

- **Curated sample of 30** public repositories—not a census and not refreshed on every upstream push.
- Labels illustrate **engineering auditability cues**, not legal or jurisdictional conclusions.
- **Graded maturity** captures breadth of signals, not maturity of enforcement or correctness.
