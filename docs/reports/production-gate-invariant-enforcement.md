# Production gate invariant enforcement

## Evaluation gate

**Invariant enforced:** A green CI run that produces ledger-backed evidence must mean that **CI-generated evidence artefacts were submitted to the hosted ledger, verified via `events_content_sha256` on `/bundle-hash`, and evaluated as `VALID`** — not merely that a workflow finished or that `govai check` printed `VALID` against ad-hoc evidence.

**How PR / main green semantics changed**

- **`govai-compliance-gate`** now runs whenever **`evidence_pack`** emits a non-empty **`run_id`** and the head repository for **`pull_request`** events is **this** repository (fork PRs cannot use repository secrets; those workflows fail closed with an explicit error instead of skipping hosted validation silently).
- **`pull_request`** targets **`main` / `staging`** are no longer excluded from the hosted gate solely because they are PRs.
- **`govai-compliance-gate`** installs **`aigov-py==0.2.1`** from PyPI (same pin as the published composite action), not an editable install from `./python`.
- **`verify-evidence-pack`** in that gate uses **`--require-export`** so the export cross-check is not best-effort in production CI.
- Emitting an empty **`run_id`** when **`docs/reports`** changes could not produce a single report basename is now a **hard error** (no empty **`run_id`** with a “skip” that still looks like success).
- Local **`evidence_pack`** GovAI check no longer exits **0** when **`run_id`** is unexpectedly empty after report changes.

**Tests run (during authoring)**

- `cargo test`
- `python -m pytest -q` (including `python/tests/test_workflow_compliance_invariants.py`, `test_cli_terminal_sdk.py`, `test_evidence_artifact_gate.py`)

## Human approval gate

**Why this is safer**

- **Branch protection** can be aimed at a single, unambiguous job: hosted **submit + verify** with real CI artefacts, not smoke or **`check` alone**.
- **Fork PRs** no longer get a false “all required jobs green” story when hosted secrets are missing: the workflow **fails** with a documented reason.
- **API clients** no longer receive raw internal error strings for **`/bundle-hash`**, **`/api/export`**, or **`/ready`** failure paths; operators still see details in **server logs** (`eprintln!`).

**Remaining operational limitations**

- **Fork PRs** still cannot run the hosted gate without a trusted in-repo branch or a separate maintainer process.
- **Export** can be down or version-mismatched: without **`--require-export`**, the CLI only **logs** a skip; with **`--require-export`** (used in **`compliance.yml`**), the gate **fails closed**.

## Changed files (summary)

- `.github/workflows/compliance.yml` — PR + same-repo hosted gate, fork fail-closed job, pinned CLI, **`--require-export`**, run_id and local check behaviour, exit kind logging.
- `.github/workflows/govai-ci.yml` — wait on **`/ready`**.
- `action.yml`, `.github/actions/govai-check/action.yml` — **`require_export`** (default **`true`** for stricter export cross-check), exit kind line, unexpanded verify flag.
- `Makefile` — **`audit_bg` / `check_audit`** use **`/ready`**.
- `rust/src/govai_api.rs` — client-safe errors for **`/bundle-hash`**, **`/api/export`**, **`/ready`**; no **`raw`** in JSON for those paths; tenant details not echoed.
- `python/aigov_py/evidence_artifact_gate.py` — export fetch returns **(hashes, skip reason)**.
- `python/aigov_py/cli.py` — **`--require-export`**, usage exit codes for missing args, export skip logging.
- `docs/github-action.md`, `docs/technical-documentation.md`, `docs/hosted-backend-deployment.md`, `README.md` — branch protection, **`/ready`**, export optional vs required.
- `python/tests/*` — new/updated tests.

## Before / after (behaviour)

| Area | Before | After |
|------|--------|--------|
| PR to `main` / `staging` with evidence | Hosted gate often **skipped** (only **`push` to `main`**) | Same-repo PRs with **`run_id`** run **`govai-compliance-gate`** |
| Fork PR with evidence | Could be **green** without hosted verify | **Fails** with explicit **fork** message |
| Empty **`run_id`** with report changes | Could **skip** local check | **Fail** in emit or local check |
| Hosted gate CLI install | **`pip install -e ./python`** | **`aigov-py==0.2.1`** |
| Export cross-check in production CI | Best-effort / silent | **`--require-export`** in **`compliance.yml`** |
| API error JSON | Could include **`raw`** / internal strings | Generic messages; details in logs |
| Readiness in docs / CI | Mixed **`/status` / `/health`** | **`/ready`** for automation |

## Rollback notes

- Revert **`.github/workflows/compliance.yml`** to restore **PR**-excluded hosted gate and editable install (not recommended: weakens the invariant).
- Revert Rust API error changes only if a client depended on **`raw`** fields (discouraged; was never a stable contract).

## Remaining risks

- **Hosted service** must implement **`/bundle-hash`**, **`/compliance-summary`**, and **`/api/export`** consistently; **`--require-export`** will fail the gate if export is broken even when digest + verdict are otherwise correct.
- **Repository variables/secrets** (**`GOVAI_AUDIT_BASE_URL`**, **`GOVAI_API_KEY`**) must be set or the hosted gate fails — intentional fail-closed behaviour.
