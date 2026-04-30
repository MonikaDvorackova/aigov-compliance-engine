## Summary

Staging → main release promotions now use **one aggregate compliance run id** instead of per-report basenames.

This ensures the emitted run id, evidence creation, local audit check, hosted evidence submission, hosted check,
explain, compliance-summary, and artifact generation all reference the **same** `run_id`.

## Background / Problem

The CI workflow emits a unique aggregate run id for staging → main promotions:

- `release-promotion-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`

Previously, the workflow still created evidence packs per changed report basename from `docs/reports/*.md`
(for example `govai-check-valid-evidence-sequence`, `pre-release-marketplace-audit`, etc.). This produced a mismatch:

- validation/checks used `release-promotion-...`
- evidence artifacts existed only under per-report basenames

Result: hosted validation could fail with `RUN_NOT_FOUND` for the aggregate run id.

## Release promotion evidence model (staging → main)

- **Exactly one run id** is used: `release-promotion-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`
- **Evidence packs are created once** for that aggregate `run_id`
- **Local audit** (`govai check`) runs against that same `run_id`
- **Hosted evidence + hosted gate** uses the same `run_id` via `needs.evidence_pack.outputs.run_id`

## Duplicate hosted event id avoidance

Release promotions include `GITHUB_RUN_ATTEMPT` in the run id, which makes hosted event ids derived from the run id
unique per rerun attempt.

Additionally, the local `ai_discovery_reported` event posted to the local audit service uses an event id that includes
both `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`:

- `evt_ai_discovery_${RUN_ID}_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}`

## Normal PR behavior (non-release PRs)

For normal PRs (including PRs into `staging`, and non-staging→main PRs into `main`):

- The run id continues to map to the **changed report basename** (exactly as before).
- The workflow keeps the existing per-report loop over changed `docs/reports/*.md` files and builds evidence per basename.

