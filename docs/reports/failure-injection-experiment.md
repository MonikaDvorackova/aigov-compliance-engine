## Summary

This report documents a **controlled failure injection** systems-validation experiment used to show that **artifact-bound decision-level gates** detect operational failures that **model-centric baseline validation** alone can miss.

The experiment is **not an ML experiment**. It does not train models or score model quality; it validates **system invariants** consistent with production-grade evidence flow: **evidence pack artefacts**, a portable **`events_content_sha256`** digest, **submit-evidence-pack** / **verify-evidence-pack** style checks, and **compliance-summary** semantics **`VALID` / `BLOCKED` / `INVALID`**.

The script generates **exactly 900 deterministic runs** (no randomness, no network I/O):

- **100 valid runs**
- **100 noisy but valid runs** (irrelevant metadata perturbation affecting the baseline only; all artifact-bound and decision predicates remain satisfied)
- **700 injected-failure runs** (**7 failure types × 100 each**)

Synthetic data are produced locally. This work has **no production impact**: **no Rust changes**, **no API or backend logic changes**, and **no CI workflow changes**.

Outputs are written to `experiments/output/`:

- `experiments/output/failure_injection_runs.json`
- `experiments/output/failure_injection_runs.csv`
- `experiments/output/failure_injection_summary.csv`
- `experiments/output/failure_injection_table.tex`

## Evaluation gate

The **decision gate** applies **artifact-bound production semantics** over each run record, in order:

1. If **`evaluation_result == "fail"`** → **`INVALID`**
2. Else if **`run_available` is false** → **`BLOCKED`**
3. Else if **`evidence_pack_present` is not true** → **`BLOCKED`** (missing or unusable evidence pack artefact)
4. Else if **`events_content_sha256_match` is not true** → **`BLOCKED`** (portable events digest mismatch vs pack)
5. Else if **`export_digest_match` is not true** → **`BLOCKED`** (export-bound digest mismatch)
6. Else if **`artifact_bound_verification` is not true** → **`BLOCKED`** (verify-evidence-pack / binding step failed)
7. Else if **`evidence_complete` is not true** → **`BLOCKED`**
8. Else if **`ai_discovery_present` is not true** → **`BLOCKED`**
9. Else if **`approval != "granted"`** → **`BLOCKED`**
10. Else if **`trace_consistent` is not true** → **`BLOCKED`**
11. Else → **`VALID`**

The **baseline** is unchanged from the prior experiment framing: **`model_validation == "passed"` ⇒ `baseline_verdict == "VALID"`**, else **`INVALID`**. Injected failures use **`model_validation == "passed"`** so baseline false negatives are visible when decision-level semantics fail.

Summary metrics include at minimum **`baseline_false_negative_rate`**, **`decision_gate_detection_rate`**, **`valid_retention_rate`**, **`artifact_bound_verification_failure_rate`**, and **`digest_mismatch_detection_rate`** (see script for exact definitions).

## Human approval gate

The gate requires **`approval == "granted"`**. The **`missing_approval_record`** failure type deterministically sets approval to **`"missing"`**, yielding **`BLOCKED`** under the production gate while the baseline may still emit **`VALID`** when **`model_validation`** passed—illustrating the human-approval strand of the combined evaluation and accountability surface.

## Determinism and reproducibility

Regenerate artefacts from the repository root (**offline**):

```bash
python experiments/failure_injection_experiment.py
```

## Limitations

- **Synthetic enumerated runs**, not sampled from production logs.
- **Boolean field model** abstracts real artefact manifests and crypto checks.
- Intended for **paper-ready systems illustration**, not regulated certification evidence.
