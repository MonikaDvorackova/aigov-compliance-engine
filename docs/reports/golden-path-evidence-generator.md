# Golden path evidence generator alignment

Audience: engineers validating local onboarding artefacts against **default ingest policy**.

## Goal

`python/aigov_py/demo_golden_path.py` emits a single evidence bundle **`generate_demo_golden_path`** consumes as `events[]`, aligned with **`rust/src/policy.rs`** **`enforce`** for each submitted event type and with **`rust/src/projection.rs`** discovery-driven **`required_evidence`** (additive `BLOCKED` when missing).

Semantics **`VALID` / `INVALID` / `BLOCKED`** are unchanged; only the **golden-path payloads** were brought in line with enforced schema and linkage.

## Discovery gate

Event type **`ai_discovery_reported`** is **not** subject to **`policy::enforce` match arms** (`_ => Ok(())`). Projection derives **`DiscoverySignals`** from the **last** such event.

Golden path payload:

- `openai: false`
- `transformers: false`
- `model_artifacts: false`

Therefore **`derive_evidence_requirements`** inserts only **`ai_discovery_completed`**, satisfied by **`has_evidence`** mapping **`ai_discovery_reported`** → **`ai_discovery_completed`**. No extra discovery-driven requirement codes (**`model_registered`**, **`usage_policy_defined`**, **`evaluation_completed`**, **`model_artifact_documented`**) apply.

If a tenant changes discovery flags to **`true`** in a real repo scan, **`required_evidence`** grows and this static bundle pattern may no longer reach **`VALID`** without additional matching events — that is intentional product behavior.

## Evaluation gate

**`evaluation_reported`** is enforced by **`enforce_evaluation_reported`** (`rust/src/policy.rs`):

- `metric` (string), `value` (number), `threshold` (number), `passed` (boolean)
- `ai_system_id`, `dataset_id`, `model_version_id` — all non-empty strings

Golden path submits **`passed: true`** so projection sets **`evaluation_passed == Some(true)`** for **`INVALID` vs VALID** ordering on the server.

**`has_passed_evaluation`** (used before **`model_promoted`**) scans the ledger for a prior **`evaluation_reported`** with **`passed == true`** for the same **`run_id`**.

## Dataset / training ordering

Under default **`PolicyConfig`**, **`block_if_missing_evidence: true`**:

- **`model_trained`** requires a prior **`data_registered`** for the same **`run_id`** (**`enforce_model_trained`**).

Golden path order: **`data_registered`** → **`model_trained`**.

## Risk lifecycle gates

Default policy requires **`risk_reviewed`** with **`decision == approve`** matching linkage **before**:

- **`human_approved`** (when **`require_risk_review_for_approval`**)
- **`model_promoted`** (**`require_risk_review_for_promotion`**)

Golden path includes **`risk_recorded`** → **`risk_mitigated`** → **`risk_reviewed`** (approve), all payloads meeting **`enforce_risk_*`** schema (**`risk_id`**, **`assessment_id`**, **`dataset_governance_commitment`**, **`ai_system_id`**, **`dataset_id`**, **`model_version_id`**, plus severity/likelihood/meta fields for **`risk_recorded`**).

Linkage strings are deterministic per run: **`assessment_id_for_run`**, **`risk_id_for_run`**, **`model_version_id_for_run`** (`python/aigov_py/prototype_domain.py`).

## Human approval gate

**`human_approved`** (**`enforce_human_approved`**):

- `scope=model_promoted`, `decision=approve`, non-empty **`approver`**, **`justification`**
- Linkage: **`assessment_id`**, **`risk_id`**, **`dataset_governance_commitment`**, **`ai_system_id`**, **`dataset_id`**, **`model_version_id`**
- **`approver`** **`compliance_officer`** matches default **`PolicyConfig`** allowlist when **`enforce_approver_allowlist`** is **`true`**.
- **`require_risk_review_for_approval`**: prior **`risk_reviewed`** with **`decision approve`** matching the same linkage keys.

**Event id** **`approved_human_event_id`** on **`model_promoted`** must equal the **`human_approved`** **`event_id`** (**`human_approved_event_ok`**).

## Promotion gate

**`model_promoted`** (**`enforce_model_promoted`**):

- `artifact_path`, `promotion_reason`
- linkage: **`assessment_id`**, **`risk_id`**, **`dataset_governance_commitment`**, **`ai_system_id`**, **`dataset_id`**, **`model_version_id`**
- **`approved_human_event_id`**
- Ordering: **`require_passed_evaluation_for_promotion`**, **`require_risk_review_for_promotion`**, **`require_approval`** — all enforced against the append-only ledger.

## Artefact correctness

After generation:

- **`events_content_sha256`** in **`evidence_digest_manifest.json`** equals **`portable_evidence_digest_v1(run_id, events)`**, verified in **`python/tests/test_demo_golden_path.py`**.
- Canonical JSON sort order (`sort_keys=True`) matches existing evidence-pack tooling.

## Proof checklist (manual)

Against default local Compose (`GOVAI_API_KEYS=test-key`):

1. `python -m pytest -q python/tests/test_demo_golden_path.py`
2. `govai demo-golden-path --output-dir artefacts --print-run-id`
3. `govai submit-evidence-pack --path artefacts --run-id <run_id>`
4. `govai verify-evidence-pack --path artefacts --run-id <run_id>` → **`VALID`**, exit **0**

## Risks / limits

- **Fresh `run_id` per attempt:** ledger is append-only; re-submitting the same **`event_id`** can fail (**idempotency** depends on stored state). Prefer a new **`demo-golden-path`** run after a rejected submit.
- **Flag drift:** Turning discovery **`openai` / transformers / model_artifacts`** on in **`ai_discovery_reported`** without adding satisfying events **`BLOCKED`s** **`VALID`**.
- **`--require-export`:** Strict CI requires **`/api_export`** parity; omit it for local sanity unless infra supports export.
