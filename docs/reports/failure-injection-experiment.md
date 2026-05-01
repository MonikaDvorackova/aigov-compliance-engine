## Summary

This report documents a **controlled failure injection** systems-validation experiment used to demonstrate that **decision-level constraints** (a deterministic “decision gate”) detect operational failures that a **model-centric baseline validation** can miss.

The experiment is **not an ML experiment**. It does not train models or evaluate model quality; it validates **system invariants** over run artifacts and decision records.

The experiment generates **exactly 900 runs**, deterministically:

- **100 valid runs**
- **100 noisy but valid runs**
- **700 injected-failure runs** (**7 failure types × 100 each**)

All data is synthetic and generated locally by a script. It has **no production impact** and does not modify any runtime components (no API changes, no backend changes, no Rust changes).

Outputs are written to `experiments/output/`:

- `experiments/output/failure_injection_runs.json`
- `experiments/output/failure_injection_runs.csv`
- `experiments/output/failure_injection_summary.csv`
- `experiments/output/failure_injection_table.tex`

## Evaluation gate

The decision gate is a deterministic rule set over decision-level fields (evaluation outcome, evidence presence, trace consistency, and run availability). It produces one of:

- `VALID`
- `BLOCKED` (missing required decision-level artifacts)
- `INVALID` (explicitly failed evaluation)

In this experiment, injected failures deterministically flip specific gate-relevant fields so that the gate outputs `BLOCKED` or `INVALID` for those runs, even when model-centric validation reports `passed`.

## Human approval gate

The decision gate includes a **human approval requirement**:

- `approval` must be exactly `granted`

Injected failures include a dedicated failure type (`missing_approval_record`) that deterministically removes/invalidates the approval record, causing a `BLOCKED` verdict under the decision gate, while the baseline can still label the run `VALID` if `model_validation == "passed"`.

## Determinism and reproducibility

The dataset is generated **without randomness**. Run IDs, conditions, and field flips are produced by fixed logic, ensuring the exact same outputs on every run.

To reproduce:

```bash
python experiments/failure_injection_experiment.py
```

