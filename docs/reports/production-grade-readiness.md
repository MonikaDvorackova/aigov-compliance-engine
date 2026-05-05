## Summary

Targeted hardening of the GovAI audit service and operator documentation: **readiness URL**, **staging/prod startup validation**, **Railway-oriented deployment clarity**, **CLI alignment with `/compliance-summary` `requirements.missing`**, **GitHub Action doc accuracy**, and **structured startup logging** (no secrets).

## Changed files

- `rust/src/db.rs` — Postgres URL empty check helpers; migration count constant + verifier; parity test vs `rust/migrations/*.sql` count.
- `rust/src/govai_api.rs` — **`GET /ready`** (ungated); `/health` doc note; readiness errors use the usual `api_error` JSON shape (`ok: false`, `error`).
- `rust/src/lib.rs` — Startup ordering/logging; **`AIGOV_ENVIRONMENT=staging`/`prod` loopback refusal** unless using non-loopback bind; **`GOVAI_AUTO_MIGRATE`** false ⇒ verify `_sqlx_migrations` completeness on those tiers after connect.
- `rust/src/ledger_storage.rs` — `configured_ledger_dir()` accessor for probes.
- `rust/tests/ready_http.rs` — **`GET /ready` 200** when `DATABASE_URL` / `TEST_DATABASE_URL` Postgres + migrations applied (skipped when unset).
- `python/aigov_py/cli.py` — **`requirements.missing`** support + legacy **`missing_evidence`** unchanged.
- `python/tests/test_cli_terminal_sdk.py` — Coverage for **`missing`** and helper union parsing.
- `docs/hosted-backend-deployment.md` — `/health` vs `/ready`, **`PORT`/Railway**, production start command snippet, env contract.
- `docs/github-action.md` — **`GOVAI_RUN_ID`** resolution; workflow **`if:`** semantics; **`VALID`** sequence vs misconceptions; **`BLOCKED` / `INVALID` / infra**.
- This report.

## Evaluation gate

### Rust

Ran:

- `cargo check -p aigov_audit`
- `cargo test -p aigov_audit --lib` (including bind + migration parity tests).
- Targeted filters: loopback staging tests; migration-count test.

Skipped automatically without local Postgres URL:

- `rust/tests/ready_http.rs::ready_ok_when_db_migrated_and_ledger_writable` (same pattern as other `*_http.rs` suites).

### Python

Ran:

- `python -m pytest -q tests/test_cli_terminal_sdk.py`

All passed.

## Human approval gate

These changes stay within the existing architectural split (JSON `api_error`, SQLx `_sqlx_migrations`, tenant JSON map for staging/prod). They tighten **staging/prod** behavior only where ambiguity caused real incidents (Railway **`PORT`/bind**, half-migrated Postgres, unreadiness masquerading as liveness).

**Operational risk**: migration count is guarded by **12** (**`EXPECTED_SQLX_MIGRATION_COUNT`**) and a **filesystem count test** — adding/removing **`rust/migrations/*.sql`** requires updating the constant once.

Roll back by reverting this branch — no persisted schema format besides existing SQLx conventions.

## Runtime behavior before

- **`GET /health`** returned **200** from a handler that did **not** re-check Postgres or ledger writability on each request; some docs misread that as “DB-independent HTTP liveness.” Operators still needed **`GET /ready`** so load balancers did not treat **`/health`** alone as audit readiness.
- **Staging/prod** could bind **127.0.0.1** and still start; **Postgres** could be under-migrated when **`GOVAI_AUTO_MIGRATE`** was off.
- **Python `govai check`** detail paths looked only at **`requirements.missing_evidence`** while the API exposed **`requirements.missing`**.
- **Docs** mixed local **8088** defaults with hosted **`PORT`** expectations; **GitHub Action** doc implied a minimal evidence path for **`VALID`** that does not match **`.github/workflows/govai-check.yml`**.

## Runtime behavior after

- **`GET /ready`** returns **200** only when Postgres answers, migration rows meet the expected count, and the ledger base path is writable (**`GOVAI_LEDGER_DIR`**, or **dev** current working directory).
- **Startup / HTTP bind**: GovAI requires a reachable Postgres (and successful configured startup) **before** binding HTTP; misconfigured or unavailable DB at startup **fails the process** rather than exposing a listener that lacks DB-backed audit capability. **`GET /health`** does not query Postgres in the handler but is **only reachable after** that startup; it is **not** a substitute for **`GET /ready`** for operational readiness.
- **Staging/prod** refuse **loopback** binds and **verify migrations** when auto-migrate is **off**.
- **Startup logs** print bind, environment, policy version, ledger path summary, DB/migration status, and `/health` vs `/ready` hints **without** printing connection secrets.
- **CLI** prints **`missing (requirement ids):`** for **`requirements.missing`** and keeps **`missing_evidence:`** for structured legacy payloads; gap code extraction merges both shapes.

## Deployment impact

- **Railway / reverse proxies**: point **readiness** checks at **`GET /ready`** (Postgres + migrations + ledger). Use **`GET /health`** only for **cheap liveness after successful startup** — it does not replace **`/ready`** for dependency checks.
- **Rolling deploy**: first instance may report **503 /ready** until migrations apply — expected when **`GOVAI_AUTO_MIGRATE=true`** catches up schema.
- **Staging/prod** misconfigured binds now **fail startup** loudly instead of **502** at the edge only.

## Rollback notes

- Revert commits on branch **`feat/production-grade-readiness`**. No destructive migrations introduced.
- If a deployment relied on startup with **loopback** in staging (invalid for external ingress anyway), unset **`AIGOV_ENVIRONMENT`** mis-classification before rollback or fix **`AIGOV_BIND`**.
