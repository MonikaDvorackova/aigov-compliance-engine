## Self-serve customer onboarding flow — audit report

Scope: documentation-only product-readiness blocker — ensure an external user can reach `VALID` or understand why they are `BLOCKED` using only supported commands and docs.

### Findings

- The repository had **two plausible “first run” paths**:
  - `docs/customer-onboarding-10min.md` used `govai run demo-deterministic` + `govai export-run`.
  - `docs/evidence-pack.md` / CI docs used the **evidence pack** contract: `evidence-pack init` → `submit-evidence-pack` → `verify-evidence-pack` (often with `--require-export`) → `check`.
- This created ambiguity for customers: a user could reasonably conclude that `VALID` can be reached (or relied upon) without the **submit + verify + check** sequence that enforces digest/export continuity and fail-closed semantics in CI.

### Changes made (docs only)

- `docs/customer-onboarding-10min.md` is now the **canonical customer entrypoint** and documents exactly one supported path:
  - install CLI
  - configure `GOVAI_AUDIT_BASE_URL` + `GOVAI_API_KEY`
  - generate an evidence pack
  - submit the pack
  - verify the pack with `--require-export`
  - run `govai check`
  - interpret `VALID` / `BLOCKED` / `INVALID`
  - troubleshooting for known first-run failures
- `docs/golden-path.md` is explicitly labeled **local demo** and points customers back to the canonical onboarding doc.
- Added a lightweight pytest that asserts the canonical onboarding doc contains:
  - `govai evidence-pack init`
  - a single `RUN_ID` reused through init/submit/verify/check
  - `--require-export`
  - troubleshooting keywords: `APPEND_ERROR`, `RUN_NOT_FOUND`, “digest mismatch”, `BLOCKED`

## Evaluation gate

Customer-facing, supported gate for artefact-bound verification:

- `govai verify-evidence-pack --require-export --path "$OUT_DIR" --run-id "$RUN_ID"`

Properties:

- **Fail-closed** on infrastructure/digest/export errors (non-zero exit).
- Requires digest continuity via hosted `/bundle-hash` and (when `--require-export` is used) a hosted export cross-check via `/api/export/:run_id`.
- Requires the authoritative server verdict to be **`VALID`** (does not treat `BLOCKED` as pass).

## Human approval gate

GovAI can report `BLOCKED` for reasons beyond missing evidence, including missing **risk/human approval/promotion prerequisites**. The canonical onboarding doc:

- Treats `BLOCKED` as “not eligible yet” (not success, not “evaluation failed”).
- Directs customers to read `missing_evidence` / `blocked_reasons` surfaced by the authoritative `govai check` / `GET /compliance-summary` output and to provide the missing approvals/evidence through their real workflow.

