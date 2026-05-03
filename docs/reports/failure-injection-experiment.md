## Summary

This report documents **Experiment 1** in the paper’s evaluation suite: **controlled failure injection** used to evaluate **policy conformance** and **enforcement correctness** for an evidence-gated decision record under a **closed synthetic schema**.

**Experiment 2** (artifact-level replay) lives in `python/aigov_py/experiments/artifact_bundle_replay.py`: concrete `{run_id}.json` bundles, digest manifests, and audit-export stubs on disk; run `govai experiment artifact-bundle-replay --output experiments/output`. **Experiment 3** (repository prevalence) is `experiments/repository_prevalence_check.py` with the coding rubric in `docs/reports/repository-prevalence-coding-rubric.md`.

The experiment is **not an ML experiment**. It does not train models, estimate deployment failure rates, or measure predictive accuracy. It is **synthetic**, **deterministic**, and **specification-driven**: each scenario’s **expected verdict** comes from the machine-readable **scenario rubric** (`python/aigov_py/experiments/scenario_rubric.json`), not from the gate implementation. Synthetic observables are built in `python/aigov_py/experiments/scenario_fields.py` (decoupled from gate output); the gate consumes that field bundle and is compared to the rubric.

When injected violations are constructed to match the declared invariants in the rubric, **perfect agreement with the rubric is the expected outcome** for the full gate—this is **enforcement correctness**, not benchmark performance.

The script generates **deterministic runs** (no randomness, no network I/O): **22 scenarios × 100 replicates = 2200** rows by default (`REPLICATES_PER_SCENARIO` in `controlled_failure_injection.py`).

Synthetic data are produced locally. This work has **no production impact** on Rust, APIs, backend logic, or CI workflows unless you explicitly wire outputs elsewhere.

Outputs are written to `experiments/output/` (and mirrored where noted):

- `controlled_failure_injection.json` / `.csv` / `_full.csv` / `_summary.csv`
- `failure_injection_results.csv` (same rows as `controlled_failure_injection.csv`; paper-facing results export)
- `failure_injection_summary.json` (aggregate metrics and metadata for the paper bundle)
- `failure_injection_runs.json` / `failure_injection_runs.csv` / `failure_injection_summary.csv` (legacy filenames)
- `failure_injection_scenarios_table.tex`, `failure_injection_outcomes_table.tex`, `failure_injection_ablation_table.tex`
- `failure_injection_table.tex` (legacy alias of the outcomes table)
- `scenario_rubric.json` (copy of the machine-readable rubric for reproducibility)

## Baselines

**Baseline 1 (model-centric):** `model_validation == "passed"` ⇒ `VALID`, else `INVALID`.

**Baseline 2 (pipeline completeness):** `VALID` only if `model_validation == "passed"`, `evaluation_result == "pass"`, `run_available`, `evidence_complete`, and `approval == "granted"`. It deliberately does **not** enforce digest checks, evidence-pack presence, artifact-bound verification, policy-version match, approval freshness or causal ordering, or run-scoped digest continuity—so contrast with the full gate remains interpretable.

## Decision gate (full)

Order of evaluation (fail-closed; see `decision_gate_verdict` in `gate_model.py`):

1. If **`evaluation_result == "fail"`** → **`INVALID`**
2. Else if **`evaluation_internal_consistent` is false** → **`BLOCKED`** (conflicting evaluation signals; documented in the rubric JSON `policy_notes.inconsistent_evaluation_result`)
3. Else if **`run_available` is false** → **`BLOCKED`**
4. Else if **`evidence_pack_present` is not true** → **`BLOCKED`**
5. Else if **`events_content_sha256_match` is not true** → **`BLOCKED`**
6. Else if **`export_digest_match` is not true** → **`BLOCKED`**
7. Else if **`artifact_bound_verification` is not true** → **`BLOCKED`**
8. Else if **`policy_version_match` is not true** → **`BLOCKED`**
9. Else if **`evidence_complete` is not true** → **`BLOCKED`**
10. Else if **`ai_discovery_present` is not true** → **`BLOCKED`**
11. Else if **`approval != "granted"`** → **`BLOCKED`**
12. Else if **`approval_is_stale` is true** → **`BLOCKED`**
13. Else if **`causal_evaluation_before_approval` is not true** → **`BLOCKED`** (approval recorded before evaluation)
14. Else if **`run_id_matches_decision_scope` is not true** → **`BLOCKED`**
15. Else if **`trace_consistent` is not true** → **`BLOCKED`**
16. Else → **`VALID`**

**Events digest policy** (rubric `policy_notes.events_digest`): digest is defined over a **canonical multiset** of events (sorted by `event_id`); reordering that preserves the canonical projection leaves **`events_content_sha256_match` true** (`reordered_required_events` scenarios).

## Metrics (overall summary)

Reported in `controlled_failure_injection.json` → `summary.overall`:

- **`baseline_1_false_negative_rate`**, **`baseline_2_false_negative_rate`** on injected-violation rows
- **`gate_detection_rate`** (non-`VALID` rate on injected violations)
- **`valid_retention_rate`**, **`false_blocking_rate`** on should-pass rows
- **`verdict_classification_accuracy`**, **`invalid_vs_blocked_match_rate`**
- **`artifact_continuity_failure_detection_rate`**, **`digest_mismatch_detection_rate`**, **`approval_ordering_violation_detection_rate`**
- **`ablations`**: ablated gates vs rubric (`verdict_classification_accuracy` per ablation)

## Ablations

Offline ablations disable clauses of the full gate (see `GateAblation` in `gate_model.py` and `_ablation_presets` in `controlled_failure_injection.py`). They are **illustrative** of which predicates carry rubric satisfaction under this closed schema.

## Repository prevalence (separate script)

The **repository prevalence** check (`experiments/repository_prevalence_check.py`) remains **illustrative and non-representative**; it must not be read as statistical generalization about all public ML repositories.

## Determinism and reproducibility

From the repository root (**offline**), with `python/` on `PYTHONPATH` (the entrypoint inserts `python/` automatically):

```bash
python experiments/failure_injection_experiment.py
```

Equivalent via the `govai` CLI (editable install of `aigov-py`):

```bash
govai experiment controlled-failure-injection --output experiments/output
```

## Limitations

- **Synthetic enumerated runs**, not sampled from production logs.
- **Closed boolean / scalar field model** abstracts real artefact manifests and cryptographic checks; digest and artifact fields are **observables**, not recomputed from raw bytes in this harness.
- **Rubric is the oracle** for expected `VALID` / `INVALID` / `BLOCKED`; the experiment measures **agreement with that published policy**, not independent real-world labels.
- Intended for **systems-methodology illustration**, not regulated certification evidence.
