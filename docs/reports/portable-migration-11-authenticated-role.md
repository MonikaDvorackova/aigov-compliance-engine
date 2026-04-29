# Portable migration 11 authenticated role fix

## Summary

This change makes migration 11 portable across Supabase Postgres and ordinary Postgres deployments.

The hosted audit backend failed during startup because migration 11 referenced the Supabase-specific role `authenticated`. Ordinary Postgres does not create this role by default, so automatic migrations failed and the application returned HTTP 502.

## Evaluation gate

The migration must not fail when the `authenticated` role is absent.

Expected result:

- Supabase deployments keep their existing role grants.
- Ordinary Postgres deployments skip Supabase-specific grants safely.
- The audit service can start and respond to health and verdict requests.

## Human approval gate

This change does not weaken tenant isolation or compliance verdict semantics.

The change only guards database grants behind role-existence checks. It does not change evidence validation, approval logic, promotion rules, or API authorization behavior.

## Risk assessment

Risk is low.

The previous behavior assumed Supabase-specific roles. The new behavior preserves those grants when the roles exist and avoids startup failure when they do not.

## Verification

Run:

\`\`\`bash
cargo test -p aigov_audit --tests
docker compose up -d --build
curl -sS http://127.0.0.1:8088/health
curl -sS http://127.0.0.1:8088/status
\`\`\`
