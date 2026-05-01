# Artefact-bound production gate (evaluation report)

Date: 2026-05-01

## Evaluation gate — what changed

- **Rust ledger API**
  - Centralised **`bundle::canonicalize_evidence_events`** (same semantics as legacy `canonicalize_events` in **`govai_api`**).
  - Added **`bundle::portable_evidence_digest_v1`**: deterministic SHA-256 over canonical JSON (`schema` **`aigov.evidence_digest.v1`**, `run_id`, ordered evidence events with `environment` omitted so dev/staging ingest stamps do not diverge CI vs hosted).
  - **`GET /bundle-hash`** now returns **`events_content_sha256`**, **`evidence_digest_schema`**, beside existing **`bundle_sha256`** (still includes tier / `log_path` metadata — not suitable alone for CI→hosted equality).
  - **`GET /api/export/:run_id`** embeds **`evidence_hashes.events_content_sha256`** for optional cross-consistency checks from the CLI.
- **Workflow / CI artefacts**
  - **`compliance.yml` `evidence_pack`**: writes **`evidence_digest_manifest.json`** via **`python -m aigov_py.write_digest_manifest`** (local audit hits **`GET /bundle-hash`**). Manifest is uploaded beside **`${run_id}.json`** (exported bundle from the same ledger).
  - **`compliance.yml` `govai-compliance-gate`** (push **`main`** only): **downloads artefacts**, fails if bundle or manifest missing, runs **`govai submit-evidence-pack`** then **`govai verify-evidence-pack`** instead of scripted curl demos.
  - **`govai-check.yml`**: header + step captions state **synthetic** evidence only; **not** the production artefact replay path.

## Artifact continuity verification

Manifest stores **`events_content_sha256`** from the ledger that ingested CI-generated **`POST /evidence`** payloads during **`evidence_pack`**.

Hosted gate replays **`${run_id}.json` `.events`** in canonical order (matching Rust dedupe + sort), submits without `environment` (hosted re-stamps), then:

1. **`GET /bundle-hash`**: **`events_content_sha256`** MUST equal CI manifest (**ERROR / exit `1`** on mismatch — classified as infra/continuity defect, distinct from **`BLOCKED` / `INVALID` verdict semantics** below).
2. Optional: if **`GET /api/export`** returns **`evidence_hashes.events_content_sha256`**, MUST equal **`bundle-hash`**’s **`events_content_sha256`** (ERROR if inconsistent).
3. **`GET /compliance-summary`**: **`verdict == VALID`** (exit **`2`** for **`INVALID`**, **`3`** for **`BLOCKED`**, **`0`** for **`VALID`**).

## Evaluation gate — tests run

Local execution for this branch:

```bash
cd rust && cargo test -q

cd ../python && python -m pytest -q
```

Results on the development machine during authorship: **`cargo test` ok** (`portable_digest_tests` plus full suite); **`pytest`** **56 passed**.

GitHub Actions for this YAML path was **not** re-run locally (infra-specific).

---

## Human approval gate — safer than synthetic replay

**Why artefact-bound is meaningfully tighter**

Synthetic replay (**`govai-check.yml`** style **or legacy hosted curl blocks**) proves that *some* valid sequence can satisfy policy for *some* `run_id`; it proves nothing about the exact events your pipeline wrote to **`docs/evidence/<run_id>.json`**. Artefact-bound flow ties the hosted ledger to those JSON payloads and to a cryptographic digest anchored at CI time (**`events_content_sha256` / manifest**).

**Remaining risks**

- **Operational**: hosted duplicate **`event_id` / `POST /evidence`** replays (**HTTP 409**) fail hard on workflow re-run until ledger policy / procedures address idempotency.
- **Policy skew**: tier differences (**dev CI** ingest vs hosted **prod**) can reject otherwise identical payloads; failure is surfaced as ingestion / verdict errors (**not masked**).
- **Digest scope**: portability intentionally hashes evidence **excluding** **`environment`**; it does **not** replace **`bundle_sha256`** for bundle documents that intentionally bind **`policy_version`** and **`log_path`**.
- **Trust boundary**: artefacts are GitHub artefacts; compromise of **`evidence_digest_manifest.json`** or bundle JSON between jobs invalidates continuity — mitigated by guarded paths + strict missing-file failures.

---

## Changed files

- `.github/workflows/compliance.yml`
- `.github/workflows/govai-check.yml`
- `python/aigov_py/cli.py`
- `python/aigov_py/cli_exit.py`
- `python/aigov_py/evidence_artifact_gate.py`
- `python/aigov_py/write_digest_manifest.py`
- `python/tests/test_cli_terminal_sdk.py`
- `python/tests/test_evidence_artifact_gate.py`
- `rust/src/bundle.rs`
- `rust/src/govai_api.rs`
- `docs/github-action.md`
- `docs/hosted-backend-deployment.md`
- `docs/technical-documentation.md`
- `docs/reports/artifact-bound-production-gate.md`

## Semantics — before vs after

| Aspect | Before | After |
|--------|--------|-------|
| **Hosted main gate (`compliance.yml`)** | Scripted JSON posts + **`govai check`** (**VALID** achievable without CI bundle JSON continuity) | **Submit CI bundle events** + **digest continuity** (**`manifest` ⇄ **`/bundle-hash`**) + **VALID verdict** |
| **`bundle_sha256` alone** | N/A equality across hosts (includes **`log_path` / tier** fields) — **already unsuitable for CI↔hosted identity** | Unchanged semantics; supplemented by **`events_content_sha256`** |
| **`govai check` exits** | Non-**VALID** uniformly **`2`** | **`BLOCKED` → `3`**, **`INVALID` → `2`**, infra/digest **`1`** (see **`cli_exit.py`**) |

## Rollback notes

- Revert **`.github/workflows/compliance.yml`** hosted job to scripted curl (**not recommended** unless emergency).
- Remove **`events_content_sha256`** clients first or keep compatible servers that still return **`ok:true`** payloads with extra fields (**forward-compatible additive JSON** safely ignored by unaware clients).

---

Branch: **`feat/artifact-bound-production-gate`**
