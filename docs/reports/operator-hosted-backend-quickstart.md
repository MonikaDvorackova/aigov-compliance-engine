# Operator hosted backend quickstart

## Scope

This change adds a minimal operator-hosted backend quickstart for running the GovAI Rust audit service with Postgres through Docker Compose.

It is intended as a boring local or operator-managed deployment path, not as a production-hardened hosting platform.

## Evaluation gate

The change is acceptable if:

- `docker compose up -d --build` starts Postgres and the GovAI Rust service.
- The service exposes the documented port `8088`.
- `GET /status` responds successfully.
- `GET /health` responds successfully.
- Migrations are either run automatically only when explicitly enabled or clearly documented.
- Existing local developer behavior remains unchanged unless `GOVAI_AUTO_MIGRATE=true` is set.

## Human approval gate

A human reviewer must confirm that:

- The compose path is clearly labeled as an operator hosted quickstart.
- The documentation does not claim production hardening.
- Insecure defaults are documented as local/operator defaults only.
- TLS, HA, secret management, and ingress are explicitly listed as out of scope.
- Existing non-compose workflows are not broken.

## Verification

Recommended verification commands:

```bash
docker compose up -d --build
curl -sS http://127.0.0.1:8088/status
curl -sS http://127.0.0.1:8088/health
docker compose logs --tail=100 govai-audit
docker compose down
