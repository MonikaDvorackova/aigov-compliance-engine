# Demo flow (v0.1)

Exact commands and **representative** expected outputs. UUIDs, accuracy, and hashes change each run.

> **Disclaimer:** This is a **research prototype**. Outputs describe what the current code prints or returns; they are **not** legal or compliance guarantees.

## Prerequisites

1. **`DATABASE_URL`** — Postgres connection string (required for `make audit` / `audit_bg`).
2. **Python venv** — `cd python && . .venv/bin/activate` with `pip install -e .` (see [README.md](README.md)).
3. For **`make demo_new`** / **`make db_ingest`**: **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`**, and the `supabase` Python package if not already installed.

## Golden run reference path

One canonical **`run_id`** with symlinked pointers to evidence, report, audit JSON, and packs lives under **[docs/demo/golden-run/README.md](docs/demo/golden-run/README.md)**. Compliance-summary JSON is not duplicated there (ledger-dependent API); see **[docs/demo/golden-run/COMPLIANCE_SUMMARY.md](docs/demo/golden-run/COMPLIANCE_SUMMARY.md)**.

## 1. Start the evidence service

```bash
make audit_bg
```

**Expected (stdout):** `starting aigov_audit in background on http://127.0.0.1:8088`, then `ready on http://127.0.0.1:8088` — or `aigov_audit already running on http://127.0.0.1:8088` if the service was already up.

The Rust process prints `govai listening on http://…` to **its** stdout (captured in `.aigov_audit.log` when using `audit_bg`).

```bash
make status
```

**Expected:** `{"ok":true,"policy_version":"v0.4_human_approval"}`

```bash
make verify
```

**Expected:** JSON including `"ok":true` and `"policy_version":"v0.4_human_approval"` when the hash chain is intact; otherwise `"ok":false` with an `error` string.

> `GET /status` is a lightweight liveness check and **includes** `policy_version`. `GET /verify` additionally validates the full append-only chain in `rust/audit_log.jsonl`.

## 2. Training run (stops at human approval)

```bash
make run
```

**Expected (stdout):**

- `done run_id=<uuid> accuracy=<float> passed=<true|false>`
- Blank line, then `pending_human_approval`
- Printed `curl` examples and `make bundle RUN_ID=<uuid>`

Copy **`RUN_ID`** for the next steps.

## 3. Human approval

```bash
RUN_ID=<uuid-from-step-2> make approve
```

**Expected:** JSON line from the service, e.g. `{"ok":true,"record_hash":"…","policy_version":"v0.4_human_approval"}` (exact hash varies).

## 4. Promotion

Requires the joblib artifact from training: `python/artifacts/model_<RUN_ID>.joblib`.

```bash
RUN_ID=<uuid> make promote
```

**Expected:** JSON with `"ok":true` on success; policy errors return `"ok":false` with an `error` message.

## 5. Report, audit manifest, pack, CLI verify

```bash
RUN_ID=<uuid> make report_prepare
```

This runs (via Makefile): `ensure_evidence` → `report` → `export_bundle` → `verify_cli`.

**Expected:**

- `ensure_evidence`: either fetches from `GET /bundle` / `GET /bundle-hash`, or falls back to `ci_fallback` when `AIGOV_MODE` is not `prod` and fetch fails.
- `report`: writes `docs/reports/<RUN_ID>.md` (includes sections required by `make gate`: `## Evaluation gate`, `## Human approval gate`).
- `export_bundle`: prints paths to `docs/audit/<RUN_ID>.json` and `docs/packs/<RUN_ID>.zip` and `bundle_sha256=…`.
- `verify_cli` (`python -m aigov_py.verify`): prints `AIGOV VERIFICATION REPORT`, lines such as `OK   audit file present` / `OK   governance hash chain verified`, and ends with **`VERDICT VALID`** or **`VERDICT INVALID`**.

### One-shot (train → gates → bundle → compliance summary JSON)

`make flow_full` runs **`run` → `approve` → `promote` → `report_prepare`**, then **`GET /compliance-summary?run_id=…`** (response printed to stdout). `make flow` is an alias.

```bash
make audit_bg
RUN_ID=$(make new_run)
export RUN_ID
make flow_full RUN_ID="$RUN_ID"
```

Requires **`DATABASE_URL`**, audit up (`check_audit`), and default **`AUDIT_URL`** unless overridden.

## 6. Makefile demo targets

### `make demo_new` (full iris path + artifacts + ingest)

```bash
make demo_new
```

**Expected:** prints `DEMO: generated RUN_ID=…`, then runs `run` → `approve` → `promote` → `report_prepare` → `db_ingest`, then `OK: demo completed RUN_ID=…` and `Dashboard: /runs/<RUN_ID>`.

**Note:** `db_ingest` fails if Supabase env vars or the `supabase` Python client are missing — use the manual path (steps 1–5) without ingest if you only want local files under `docs/`.

### `make demo RUN_ID=<uuid>` (full path with a fixed id)

Same sequence as `make demo_new`, but uses your **`RUN_ID`** (prefer a new uuid so the ledger does not collide with prior approvals for the same id). Same Supabase requirements as `db_ingest` above.

To **only** regenerate reports/packs for a run that already finished training/approval/promotion, run **`RUN_ID=<uuid> make report_prepare`** (and optionally **`make db_ingest`**).

## 7. Optional: audit pack only (`export_bundle`)

`make bundle` is an alias for `python -m aigov_py.export_bundle` (same as `make export_bundle`). It **requires** existing `docs/evidence/<RUN_ID>.json` and `docs/reports/<RUN_ID>.md` (e.g. after `report_prepare` or manual generation). It writes `docs/audit/<RUN_ID>.json` and `docs/packs/<RUN_ID>.zip`.

```bash
RUN_ID=<uuid> make bundle
```

## Dashboard

Local dev (from repo root):

```bash
cd dashboard && npm install && npm run dev
```

Set **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (or **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**, see `dashboard/lib/supabase/`) so the app can read `runs` from Supabase.

After a successful **`db_ingest`**, open **`/runs/<RUN_ID>`** (URL printed by `demo_new`).

## CI gate on reports

```bash
make gate
```

**Expected:** `gate OK; checked N reports` or `gate: no reports found; OK` if `docs/reports/` has no `*.md`.

The gate scans **every** `docs/reports/*.md`; each file must contain `## Evaluation gate` and `## Human approval gate` (regenerate with `report_prepare` or remove stale placeholders).
