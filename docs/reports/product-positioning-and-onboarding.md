## Summary

This change productizes GovAI documentation and onboarding without modifying API contracts or runtime compliance semantics.

## Scope

- product positioning docs
- README
- homepage copy
- GitHub Action documentation
- customer quickstart
- CI/GitHub Action surface (documentation only)

## Evaluation gate

- No change to compliance gate behavior
- CI must still fail unless verdict = VALID
- This change does not relax or bypass the gate

## Human approval gate

- No change to human approval semantics
- VALID still requires required evidence and approval
- Missing approval remains BLOCKED

## Promotion gate

- No change to promotion semantics
- Promotion allowed only when policy conditions are satisfied
- INVALID and BLOCKED remain non-deployable

## API contract impact

- No API paths changed
- No response schema intentionally changed
- Existing endpoints documented:
  - POST /evidence
  - GET /compliance-summary
  - GET /usage
  - GET /api/export/:run_id

## Risk

- risk of overclaiming product readiness
- risk of onboarding failure if CLI installation is not deterministic
- risk of CI false-green if verdict enforcement is weakened

## Verification

- git status --short
- git diff --check
- CI workflow execution (compliance.yml)
