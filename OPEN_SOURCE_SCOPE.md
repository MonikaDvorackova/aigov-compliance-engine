# Open source scope (v0.1)

**Research prototype** — no legal compliance guarantee, certification, or operational warranty. What follows describes what this repository **is** and **is not**, as of the **v0.1** reference implementation.

There is **no separate OSS package or directory split**: everything lives in one tree. The boundary below is **semantic**—what to treat as the portable **core** versus demo glue and optional **product** surfaces when reading or reusing the code.

**Enterprise layer ≠ OSS core.** The **enterprise layer** (Postgres-backed teams, JWT-gated `/api/*`, product RBAC, `compliance_workflow`, Supabase dashboard/helpers) is an **optional product integration** shipped in the same repo. It is **not** part of the **open-source core guarantee**: portability, semantic stability, and reuse expectations apply to the ledger and contract surfaces below, not to enterprise APIs or their schema.

| Guarantee | Applies to |
|-----------|------------|
| **OSS / “strong core”** | Ledger + policy + bundle/projection contracts and modules listed under *Portable core* below. |
| **Explicitly outside this guarantee** | **Enterprise layer**: team scope, JWT-gated `/api/*`, product RBAC, `compliance_workflow`, Supabase-integrated dashboard/helpers. Present for demos and product wiring; **may change** independently of core policy/versioning—do not treat as a frozen public API unless you fork and own it. |

**OSS core guarantee** = the portable **core** (ledger + contracts + consumers that target it). **Enterprise layer** = optional product integration only; see [ENTERPRISE_LAYER.md](ENTERPRISE_LAYER.md) and [ARCHITECTURE.md](ARCHITECTURE.md#core-vs-enterprise-layer).

## Layers in one repository (practical v0.1 boundary)

### Portable core (regulation-agnostic contracts + ledger)

- **Rust audit surface** (`rust/`, crate `aigov_audit`): append-only `audit_log.jsonl` with hash chaining; policy enforcement on `POST /evidence`; `GET /verify`, `/verify-log`, `/bundle`, `/bundle-hash`, `/compliance-summary`; event schema (`schema.rs`), policy (`policy.rs`), bundle and projection logic used by those routes.
- **Canonical contracts**: identifier and summary semantics in [docs/strong-core-contract-note.md](docs/strong-core-contract-note.md) (`aigov.bundle.v1`, `aigov.compliance_summary.v2` / compliance current state as implemented).

This is the part meant to stay stable if you swap datasets, models, or hosting; policy rules are **Rust code** for a fixed policy version, not an end-user rules language.

### Reference Python (core consumers, not the demo model)

- **Bundle and audit tooling**: `verify`, `export_bundle`, `report`, `evidence_pack`, and `fetch_bundle_from_govai` (HTTP client to the running service—the module name is historical; it targets `AIGOV_AUDIT_URL`).
- These modules **assume** the Rust API and on-disk conventions under `docs/`; they do **not** assume Iris or sklearn.

### Prototype / demo-specific (replace for real workloads)

- **Training demo**: `pipeline_train` (sklearn **Iris** `LogisticRegression`), `evaluate`, `demo` / `demo_e2e`, Makefile targets such as `run`, `demo`, `demo_new`.
- **Shared demo IDs and payloads**: `prototype_domain` (dataset fingerprinting for Iris, synthetic risk/assessment IDs, governance-shaped payloads for the PoC).
- **Human-approval helpers**: `approve` / `promote` are wired to the demo event-id conventions from `prototype_domain` (e.g. `ha_<run_id>`).
- **CI-only behavior**: `ci_fallback` (disallowed when `AIGOV_MODE=prod`).

### Enterprise layer — optional product integration (not OSS core guarantee)

Same repo; **omit entirely** if you only need the core audit service and file-based ledger.

- **Postgres + JWT**: `GET /api/me`, `POST /api/assessments`, `GET/POST /api/compliance-workflow*` (Supabase JWKS in `rust/src/auth.rs`); team scope via `x-govai-team-id` when set (`rust/src/govai_api.rs`).
- **Python**: `ingest_run` (Supabase `runs` upsert), `GovaiClient` / `client.py` helpers for team/assessment flows.
- **Dashboard** (`dashboard/`): Next.js UI that expects Supabase (and optionally `AIGOV_AUDIT_URL` for read-only compliance summary).

### Meta (shipped with the release)

- **Makefile** orchestration: `audit` / `audit_bg`, `run`, `approve`, `promote`, `report_prepare`, `demo` (train → approve → promote → `report_prepare` → `db_ingest` with caller-provided `RUN_ID`), `demo_new` (same flow with generated `RUN_ID`), `gate` (`scripts/gate_reports.py`), `bundle` / `export_bundle`, `verify_cli`, etc.
- **Documentation** ([ARCHITECTURE.md](ARCHITECTURE.md), [DEMO_FLOW.md](DEMO_FLOW.md), contracts, technical notes).
- **License**: Apache 2.0 — see [LICENSE](LICENSE).

## Out of scope (v0.1)

- **Legal or regulatory certification** — the code is a research / reference PoC; it does not by itself satisfy EU AI Act or other obligations.
- **Production-grade security** — no commitment to threat model, pen testing, or operational hardening; JWT/Supabase wiring is minimal integration.
- **Full multi-tenant SaaS product** — team-scoped tables and APIs exist as an **optional enterprise layer**, not as a complete SaaS (billing, org hierarchy, SLAs, etc.).
- **Arbitrary model frameworks** — the reference path is sklearn + joblib; other stacks would need new emitters.
- **Immutable global deployment** — single-process log file and local paths; no distributed consensus or WORM storage.
- **Exhaustive policy language** — rules are Rust code for one policy version, not a user-editable rules engine.

## Regulation framing

The **core** identifiers and contracts are **regulation-agnostic**. References to the **EU AI Act** are for **mapping and illustration** (thesis, docs, comments in PoC payloads), not as an exhaustive legal interpretation.
