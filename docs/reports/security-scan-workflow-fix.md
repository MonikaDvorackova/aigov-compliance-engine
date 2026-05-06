# Security scan workflow fix

## Summary

This change fixes the security scanning workflow so pull request secret scanning and dependency scanning can run reliably in CI.

Changes:
- Adds the required GitHub token for Gitleaks pull request scans.
- Uses full checkout history so Gitleaks can scan the pull request commit range.
- Updates the Trivy action reference to a resolvable versioned tag.

## Evaluation gate

Validation performed:
- GitHub Actions workflow syntax remains valid.
- Gitleaks is configured with `GITHUB_TOKEN`.
- Checkout uses `fetch-depth: 0` for pull request range scanning.
- Trivy uses a resolvable action version.

Expected result:
- `security-scan` runs both secret scanning and dependency scanning without workflow setup failures.

## Human approval gate

This change does not weaken governance enforcement, audit semantics, evidence requirements, tenant isolation, or artifact-bound verification. It only fixes CI security scanning configuration.
