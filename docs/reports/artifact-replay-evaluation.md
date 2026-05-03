# End-to-end artifact bound replay (Experiment 2)

## Purpose

This experiment complements the **closed-schema controlled failure injection** harness (Experiment 1) by **materialising concrete evidence artefacts** on disk—an evidence bundle JSON (`{run_id}.json`), a portable digest manifest (`evidence_digest_manifest.json`), and a minimal audit-export stub (`audit_export.json`)—and **reconstructing gate observables** from those files before applying the same decision gate predicates (`VALID` / `INVALID` / `BLOCKED`).

It is designed so reviewers cannot fairly dismiss the evaluation as **only** synthetic tuple assignment, while the framing remains honest: this is still **deterministic, author-generated replay**, not production telemetry or deployment failure-rate estimation.

## Design

- **8 representative scenarios** × **25 deterministic replicates** = **200** runs.
- **Independent oracle:** `python/aigov_py/experiments/artifact_bundle_replay_rubric.json`.
- **Portable digest:** `python/aigov_py/portable_evidence_digest_v1` matches Rust `bundle::portable_evidence_digest_v1` on the checked fixture (see `python/tests/test_portable_evidence_digest.py`).

## Regeneration

From the repository root (after `pip install -e ./python` or equivalent).

Preferred (requires a `govai` entrypoint from this repository’s `aigov-py` install):

```bash
cd python && govai experiment artifact-bundle-replay --output ../experiments/output
```

Equivalent without the CLI shim:

```bash
cd python && python -c "from pathlib import Path; from aigov_py.experiments.artifact_bundle_replay import main_cli; raise SystemExit(main_cli(output=Path('../experiments/output')))"
```

## Outputs

Under `experiments/output/`:

- `artifact_bundle_replay.json`, `artifact_bundle_replay.csv`, `artifact_bundle_replay_summary.csv`
- `artifact_bundle_replay_table.tex` (NeurIPS-ready per-scenario summary table)
- `artifact_bundle_replay_rubric.json` (copy of the oracle)
- `artifact_bundle_replay_artifacts/` (per-run directories with bundle, manifest, export)

## Limitations

- The audit export is a **minimal replay stub**, not a full hosted `GET /api/export` payload.
- Semantic fields (evaluation outcome, approval state) are **inferred from a small event vocabulary** in the bundle, not from the complete Rust compliance projection.
- The experiment **does not** replace evaluation on independently produced production audit logs.
