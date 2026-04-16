# GovAI console Postgres reads (dashboard TLS)

The dashboard reads run metadata from the `console` schema via `node-postgres` when `GOVAI_CONSOLE_RUNS_ENABLED` is set. TLS is configured in `lib/console/govaiConsoleRunsRead.ts`.

## Production (recommended)

Enable console reads and verify the server certificate using the Supabase (or provider) CA PEM:

```bash
GOVAI_CONSOLE_RUNS_ENABLED=true
GOVAI_CONSOLE_PG_CA_CERT_PATH=/path/to/supabase-ca.crt
# PEM text in a .crt or .pem file is fine. Use GOVAI_DATABASE_URL or DATABASE_URL for Postgres (pooler URL is fine).
```

- **Do not** set `GOVAI_CONSOLE_PG_SSL_NO_VERIFY` in production.
- **Connection string:** Prefer URLs **without** `sslmode`, `sslrootcert`, `sslcert`, `sslkey` when using `GOVAI_CONSOLE_PG_CA_CERT_PATH`. The app strips these query parameters when explicit `ssl` options are used, but keeping the URL minimal avoids confusion.

## Local / dev (fallback only)

If TLS verification fails in local canary (e.g. chain issues with the pooler):

```bash
GOVAI_CONSOLE_RUNS_ENABLED=true
GOVAI_CONSOLE_PG_SSL_NO_VERIFY=true
```

This disables certificate verification. **Do not use in production.**

## Environment variable precedence

- **`GOVAI_CONSOLE_PG_CA_CERT_PATH`** — highest priority for TLS: when set, the pool uses CA-based verification (see below for interaction with `GOVAI_CONSOLE_PG_SSL_NO_VERIFY`).
- **If CA path is not set**, `GOVAI_CONSOLE_PG_SSL_NO_VERIFY=true` may be used for local development only (disables verification).
- **Connection URL:** if both `GOVAI_DATABASE_URL` and `DATABASE_URL` are set, **`GOVAI_DATABASE_URL` wins**.

If both `GOVAI_CONSOLE_PG_CA_CERT_PATH` and `GOVAI_CONSOLE_PG_SSL_NO_VERIFY` are set, **CA-based verification wins** (the no-verify flag is ignored for pool creation).

## Related

- Python tooling uses `aigov_py.psycopg_database_url` (separate from Node `pg`).
