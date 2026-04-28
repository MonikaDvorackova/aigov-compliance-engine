# Hosted onboarding primary path

## Summary
This change makes hosted onboarding the primary customer path from the dashboard homepage and presents the hosted flow before developer-only setup.

## Evaluation gate
The homepage now exposes a clear primary CTA to `/onboarding`.

The onboarding page presents the hosted customer flow first:
1. configure base URL
2. configure API key
3. run deterministic demo
4. observe BLOCKED
5. submit evidence
6. observe VALID
7. export JSON

Developer-only setup remains available as a secondary path.

## Human approval gate
This change does not modify authentication, tenant isolation, persistence, or authorization behavior.

The UI change is intentionally minimal and limited to customer onboarding copy and CTA priority.

## Validation
Dashboard build was run successfully:

```bash
cd dashboard
npm run build
