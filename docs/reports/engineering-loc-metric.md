# Engineering LOC metric (process note)

This report accompanies the addition of `scripts/engineering_loc.py`, documentation in `docs/engineering-loc.md`, a `make engineering_loc` target, and `scripts/test_engineering_loc_smoke.py` wired into the compliance workflow. The goal is a reproducible, stdlib-only breakdown of tracked lines by category plus a headline **engineering LOC** (core dashboard + backend/library source excluding tests, docs, experiments, fixtures, and generated trees).

## Evaluation gate

The metric is **deterministic** (sorted `git ls-files`, stable UTF-8 handling with replacement on decode errors), **bounded to tracked files** (no filesystem `find`), and **fails fast** outside a Git repository (exit code 2). Categories are assigned by path and extension rules documented in `docs/engineering-loc.md`; binary and common media extensions contribute **files** but **zero LOC** in the data/assets bucket. CI runs `scripts/test_engineering_loc_smoke.py` after `make gate` in the `make_verify` job so regressions in the script or smoke harness are caught on pull requests.

## Human approval gate

Classification rules are **heuristic**: boundary cases (for example a new top-level tooling directory or a new tracked generated artefact) may need a follow-up adjustment to `scripts/engineering_loc.py`. Reviewers should treat **engineering LOC** as a **comparable internal signal**, not a substitute for architecture risk review or effort estimation.
