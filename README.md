# GovAI

GovAI turns compliance evidence into a production decision.

Most systems log compliance.  
GovAI enforces it.

## Decision-Oriented Compliance

The run detail page is designed to answer a single question:

Can this model be promoted to production?

Each run resolves to one of three states:

- VALID – all requirements met (evaluation passed, approval granted, promotion allowed)
- INVALID – evaluation failed
- BLOCKED – at least one required step is missing or unresolved

The decision follows a strict rule order:

evaluation → approval → promotion

## What the UI shows

- a dominant decision (VALID / INVALID / BLOCKED)
- a single-line explanation
- readiness signals:
  - Evaluation
  - Approval
  - Promotion
  - Primary risk (if present)

All technical details (hashes, raw payloads, audit diagnostics) are separated into a secondary view.

## Design guarantees

- No inconsistent states between decision and signals
- No false VALID results when audit data is missing or invalid
- Decisions are scannable in seconds

## Example

VALID  
All requirements met. Promotion is allowed.

BLOCKED  
Approval required before promotion.

INVALID  
Evaluation failed. Do not promote.

---

## AIGov Compliance Engine (v0.1)

**Research prototype** — governance-by-design reference for ML runs: append-only, hash-chained evidence in a Rust service, policy checks before append, Python training and reporting, and optional Supabase-backed UI ingest. **This software does not provide legal compliance, certification, or a warranty of any kind.**

The **core abstractions** (identifiers, evidence events, bundle, projection, compliance summary) are **regulation-agnostic**. The [EU AI Act](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) appears only as **illustrative mapping** for documentation and thesis context—not as legal advice or exhaustive compliance.

## What it does

- **Append-only audit ledger** — Rust service appends hash-chained JSONL (`rust/audit_log.jsonl`) on successful `POST /evidence`; policy version is `v0.4_human_approval` (see `rust/src/main.rs`).
- **Bundle and compliance views** — `GET /bundle`, `/bundle-hash`, `/compliance-summary` derive from the log; `GET /verify` checks chain integrity.
- **Reference Iris pipeline** — Python `pipeline_train` trains sklearn `LogisticRegression`, emits events to the audit URL, then stops for human approval; `approve` / `promote` complete the lifecycle.
- **Reports and packs** — Markdown audit reports, audit manifest JSON, and ZIP packs under `docs/` via Makefile targets.
- **Optional dashboard** — Next.js app reads runs from Supabase after `db_ingest` (see [DEMO_FLOW.md](DEMO_FLOW.md)).

**Core vs prototype:** the portable core is the Rust ledger + policy + bundle/summary HTTP surface and identifier contracts in [docs/strong-core-contract-note.md](docs/strong-core-contract-note.md). Iris, `prototype_domain`, and optional Supabase/dashboard paths are integration/demo layers. Boundary detail: [OPEN_SOURCE_SCOPE.md](OPEN_SOURCE_SCOPE.md).

## Prerequisites

- **Rust** (2021) — `rust/`
- **Python ≥ 3.10** — venv under `python/.venv`, `pip install -e .` from `python/`
- **PostgreSQL** — **`DATABASE_URL`** required (Rust builds a pool at startup)

Optional: **Supabase** credentials for `db_ingest` and the dashboard; Rust **`/api/me`** / **`/api/assessments`** need **`SUPABASE_URL`** (JWKS) and a valid Bearer JWT (see [ARCHITECTURE.md](ARCHITECTURE.md)).

```bash
cd python && python -m venv .venv && . .venv/bin/activate && pip install -e .
```

## Quick start (five steps)

1. **Set `DATABASE_URL`** to a reachable Postgres connection string.

2. **Start the evidence service** (default `http://127.0.0.1:8088`, override with `AIGOV_BIND`):

   ```bash
   make audit_bg
   ```

   On success the server prints `govai listening on http://…` (see `rust/src/main.rs`); `make audit_bg` prints `ready on http://127.0.0.1:8088` when the `/status` probe succeeds.

3. **Sanity check:** `make status` → `{"ok":true,"policy_version":"v0.4_human_approval"}`; `make verify` → JSON with `"ok":true` and `"policy_version"` when the chain is valid.

4. **Train:** `make run` → note `done run_id=<uuid> accuracy=<float> passed=<true|false>`, then `pending_human_approval`.

5. **Finish the run:** use that `RUN_ID`:

   ```bash
   RUN_ID=<uuid> make approve
   RUN_ID=<uuid> make promote
   RUN_ID=<uuid> make report_prepare
   ```

   This produces `docs/evidence/<RUN_ID>.json`, `docs/reports/<RUN_ID>.md`, `docs/audit/<RUN_ID>.json`, `docs/packs/<RUN_ID>.zip` and runs CLI verification.

**Optional:** `make flow_full` runs train → approve → promote → `report_prepare`, then prints **`GET /compliance-summary`** JSON (same prerequisites as `audit_bg`). `make demo_new` runs the same train → approve → promote → `report_prepare` → `db_ingest` (needs Supabase env for ingest). **`make gate`** checks that `docs/reports/*.md` contain `## Evaluation gate` and `## Human approval gate`.

## Demo commands and expected outputs

| Step | Command | Expected (representative) |
|------|---------|---------------------------|
| Service up | `make audit_bg` | `starting aigov_audit…` then `ready on http://127.0.0.1:8088`, or `aigov_audit already running…` |
| Liveness | `make status` | `{"ok":true,"policy_version":"v0.4_human_approval"}` |
| Chain | `make verify` | `"ok":true` and `policy_version`, or `"ok":false` with `error` |
| Train | `make run` | `done run_id=…`, `pending_human_approval`, printed `make bundle RUN_ID=…` hint |
| Approve | `RUN_ID=… make approve` | JSON with `"ok":true` and `record_hash` on success |
| Promote | `RUN_ID=… make promote` | JSON with `"ok":true` on success |
| Report pack | `RUN_ID=… make report_prepare` | Writes under `docs/`; `verify_cli` prints `AIGOV VERIFICATION REPORT` and ends with `VERDICT VALID` or `VERDICT INVALID` |
| Full flow + compliance summary | `RUN_ID=… make flow_full` | Same as report row, then stdout JSON from `/compliance-summary?run_id=…` (`ok`, `schema_version`, `current_state`, …) |
| CI gate | `make gate` | `gate OK; checked N reports` or `gate: no reports found; OK` |

UUIDs, accuracy, and hashes change every run. Full walkthrough: [DEMO_FLOW.md](DEMO_FLOW.md).

## Golden run reference path

Stable location for optional pinned snapshots and notes: **[docs/demo/golden-run/](docs/demo/golden-run/)** (see README there). Live reproduction always uses the Makefile flow above.

## Documentation

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, routes, storage paths |
| [DEMO_FLOW.md](DEMO_FLOW.md) | Commands and expected outputs in detail |
| [OPEN_SOURCE_SCOPE.md](OPEN_SOURCE_SCOPE.md) | Core vs demo vs optional; out of scope |
| [docs/THESIS_REFERENCE_SCOPE.md](docs/THESIS_REFERENCE_SCOPE.md) | Thesis vs repository |
| [docs/strong-core-contract-note.md](docs/strong-core-contract-note.md) | Identifiers and compliance-summary contract |
| [docs/technical-documentation.md](docs/technical-documentation.md) | Legacy notes (partially superseded for v0.1) |

## License

Apache License 2.0 — see [LICENSE](LICENSE).
