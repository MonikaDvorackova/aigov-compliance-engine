# Repository prevalence check (systems experiment)

This report documents an **illustrative, offline prevalence check** over a fixed curated set of thirty public ML/AI-related repositories. It complements the synthetic failure-injection experiment by grounding the auditability-gap discussion in **repository-level observable signals**, without implying statistical representativeness or exhaustive coding.

The script `experiments/repository_prevalence_check.py`:

- Reads a deterministic embedded dataset (repository names, URLs, domains, and boolean flags).
- Derives composite fields: **model-centric validation** (tests/CI-oriented signals), **decision-level auditability** (conjunction of audit evidence, approval, decision records, and run-to-decision linkage), and **auditability gap** (model-centric present but decision-level stack absent under the scripted definition).
- Writes CSV, JSON, summary metrics, and a LaTeX table under `experiments/output/`.

**Runtime constraints:** No network access, no git clones, no GitHub API calls, and **no production or backend impact**—the tooling is standalone Python that only writes local artifacts.

## Evaluation gate

In this prevalence check, “evaluation-aligned” cues are summarized by **model-centric validation**: the script marks a repository as having model-centric validation when **either** `model_validation_present` (e.g., tests or evaluation-oriented checks as reflected in curated coding) **or** `ci_present` (continuous integration) is true.

This framing is deliberately **systems-level and illustrative**: it distinguishes widely adopted engineering signals from the stricter conjunction used for decision-level auditability. The coding is performed **once**, **offline**, and **manually** in the experiment source; it is **not** re-verified on every upstream commit.

## Human approval gate

The boolean `explicit_approval_gate_present` encodes whether the curated snapshot treats the repository’s public artifacts as exposing an **explicit, decision-oriented approval boundary** aligned with regulated AI governance—not merely informal code review defaults.

For **decision-level auditability** to be true, the script additionally requires observable **audit-evidence traces**, **decision records**, and **run-to-decision traceability** alongside that approval notion. Few public OSS ML repositories standardize all four as first-class exported artifacts; the experiment is written to highlight that asymmetry relative to pervasive CI/tests, **without** asserting that upstream projects lack informal review.

## Outputs

Generated files (paths relative to repo root):

- `experiments/output/repository_prevalence_repos.csv`
- `experiments/output/repository_prevalence_repos.json`
- `experiments/output/repository_prevalence_summary.csv`
- `experiments/output/repository_prevalence_table.tex`

Regenerate by running:

```bash
python experiments/repository_prevalence_check.py
```

## Limitations

- **Illustrative prevalence check**, not a benchmark and **not statistically representative**.
- Dataset is a **fixed sample of thirty** well-known repositories, not drawn from a defined population frame.
- Boolean labels are **manually curated** and **not exhaustive**; different reviewers could classify edge cases differently.
- No automation re-fetches repositories; classifications are frozen in the experiment script for **deterministic reproducibility**.
