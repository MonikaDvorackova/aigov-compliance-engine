# Branching strategy

## Flow

```text
feature/*  ──PR──▶  staging  ──PR──▶  main
```

1. **Feature branches** (`feature/*`, `fix/*`, `chore/*`, etc.) are the default place for product and infrastructure work.
2. **Merge features into `staging` first** via pull request. `staging` is the integration branch: it should carry the next release candidate and catch conflicts between parallel features early.
3. **Promote to `main` only through a pull request from `staging`**. Treat merges to `main` as production-facing: they should reflect code that has already been integrated and validated on `staging`.

Direct merges from feature branches into `main` are not part of this workflow. The compliance workflow enforces that pull requests **targeting `main`** must have **`staging` as the head branch**, so accidental feature→`main` PRs fail CI.

## Why `staging` exists

- **Integration**: combine multiple feature branches and resolve integration issues before production.
- **Pre-production validation**: run the same CI and manual checks against a single, stable integration point that is not yet `main`.

## GitHub Actions

The `compliance` workflow runs on:

- Pull requests whose **base** branch is `main` or `staging`.
- Pushes to `main` or `staging`.

PRs to `main` additionally require the head branch to be `staging` (see workflow).

## Branch protection (recommended)

These are **suggestions** for repository settings. They are not applied by automation in this repo.

### `main`

- Require a pull request before merging.
- Require status checks to pass (required checks: the jobs from the compliance workflow you rely on, e.g. `make_verify` and any other gates you mark as required).
- Restrict who can push (or disallow direct pushes) so `main` only moves via PR.
- Optionally require linear history or squash merge, per team preference.

### `staging`

- Allow merges via pull request from feature branches.
- Keep required checks **lighter or optional** if you want faster iteration on integration; tighten over time as the branch stabilizes.
- Allow direct pushes only if your team needs hotfixes; otherwise prefer PRs for auditability.

### Optional

- Use **rulesets** or classic branch protection consistently for both branches.
- Add a **merge queue** for `main` if you need serialized, always-green merges.
