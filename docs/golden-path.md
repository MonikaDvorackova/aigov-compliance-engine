## Golden path (2 minutes): generate artefacts → submit → verify

Goal: exercise the **artifact-bound** workflow end-to-end using the **existing evidence-pack format**:

- `./artefacts/<run_id>.json` (JSON object with `events: [...]`)
- `./artefacts/evidence_digest_manifest.json` (portable digest manifest for artifact-bound replay)

This guide is **local and deterministic**. `VALID` is only reached after **both** `submit-evidence-pack` **and** `verify-evidence-pack` succeed against a running audit service whose **default ingest policy** matches this repository (see `rust/src/policy.rs`). This doc does **not** claim hosted success unless you provide a matching base URL + API key.

### Prerequisites (exact)

1. **`govai` CLI installed** — same as `docs/quickstart-5min.md` (editable install from `python/` **or** `pip install aigov-py` at the repo’s pinned version).
2. **Audit HTTP API running** with **default PolicyConfig** (for example **`docker compose up -d`** from repo root — uses `GOVAI_API_KEYS=test-key`; or **`make audit_bg`** after Postgres + keys per `docs/quickstart-5min.md`).
3. **Environment:**
   ```bash
   export GOVAI_AUDIT_BASE_URL="http://127.0.0.1:8088"
   export GOVAI_API_KEY="test-key"
   ```
   Adjust `GOVAI_API_KEY` if your operator maps a **different** secret to `GOVAI_API_KEYS` / `GOVAI_API_KEYS_JSON` on the server. Missing/wrong credentials produce **ERROR** (integration failure), not `BLOCKED` / `INVALID`.

4. **`/api/export`** — optional for `verify-evidence-pack` **unless** you pass **`--require-export`** (composite GitHub Action defaults that on). Local golden path commands below use the CLI default (**no** `--require-export`), so export need not succeed for **`VALID`** on verify.

### Step 1: Generate deterministic artefacts

```bash
govai demo-golden-path --output-dir artefacts
```

To script the next steps, emit only `run_id` on stdout:

```bash
RUN_ID="$(govai demo-golden-path --output-dir artefacts --print-run-id)"
```

Example copy/paste from default output:

```text
run_id: 550e8400-e29b-41d4-a716-446655440000
artefacts_path: /abs/path/to/artefacts

next step:

govai --audit-base-url http://127.0.0.1:8088 --api-key '$GOVAI_API_KEY' verify-evidence-pack --path '/abs/path/to/artefacts' --run-id 550e8400-e29b-41d4-a716-446655440000
```

The CLI prints **`verify-evidence-pack` first**, but ingestion must happen **before** verify (see step 2).

### Step 2: Submit evidence, then verify (production shape)

Replay the bundle to the ledger, then enforce digest continuity **and** `GET /compliance-summary` **`VALID`**:

```bash
govai submit-evidence-pack --path artefacts --run-id "$RUN_ID"
govai verify-evidence-pack --path artefacts --run-id "$RUN_ID"
```

### Step 3: Optional explicit check

```bash
govai check --run-id "$RUN_ID"
```

Expected stdout: **`VALID`**, exit code **0**.

### Expected final result (**only after submit succeeded**)

`verify-evidence-pack` exits **0** and the trailing summary includes:

```text
GovAI summary
verdict: VALID
category: policy
reason_codes: []
next_action: Proceed with deployment.
```

If **`submit-evidence-pack` fails**, fix **`POLICY_VIOLATION`** / schema messages first — **`verify-evidence-pack` cannot pass** until the hosted ledger contains a matching canonical event stream.

If verify fails:

- **Digest / ERROR:** ensure you did **not** edit `artefacts/<run_id>.json` after generation; rerun `demo-golden-path` fresh.
- **Missing API key / 401:** set `GOVAI_API_KEY` to a key accepted by `GOVAI_API_KEYS*` on the audit service.
- **Audit not reachable:** ensure the process listens (e.g. `curl -sS "$GOVAI_AUDIT_BASE_URL/health"`).
- **`--require-export`:** if you opted in, **`GET /api/export/:run_id`** must succeed or verify exits **1** (integration), not **`INVALID`**.
