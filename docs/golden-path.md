## Golden path (2 minutes): generate artefacts → verify

Goal: exercise the **artifact-bound** workflow end-to-end using the **existing evidence-pack format**:

- `./artefacts/<run_id>.json` (JSON object with `events: [...]`)
- `./artefacts/evidence_digest_manifest.json` (portable digest manifest for artifact-bound replay)

This guide is **local and deterministic**. It works once your audit service is running and you have a valid `base_url` + `api_key`.

### Prereqs (local)

Start the audit service and configure an API key as in `docs/quickstart-5min.md`.

You need:

```bash
export GOVAI_AUDIT_BASE_URL="http://127.0.0.1:8088"
export GOVAI_API_KEY="YOUR_LOCAL_KEY"
```

If your audit service requires auth, missing/invalid `GOVAI_API_KEY` will cause **ERROR** (integration failure). This doc does not claim hosted success unless you provide a real hosted base URL + key.

### Step 1: Generate deterministic artefacts

```bash
govai demo-golden-path
```

Example output:

```text
run_id: 550e8400-e29b-41d4-a716-446655440000
artefacts_path: /abs/path/to/artefacts

next step:

govai --audit-base-url http://127.0.0.1:8088 --api-key YOUR_LOCAL_KEY verify-evidence-pack --path /abs/path/to/artefacts --run-id 550e8400-e29b-41d4-a716-446655440000
```

### Step 2: Verify the evidence pack (hosted gate)

Copy/paste the printed command. It is intentionally in the exact `verify-evidence-pack` shape used by CI.

Expected result:

```text
GovAI summary
verdict: VALID
```

If it fails:

- missing API key:
  - set `GOVAI_API_KEY`, e.g. `export GOVAI_API_KEY="YOUR_LOCAL_KEY"`
- wrong base URL:
  - set `GOVAI_AUDIT_BASE_URL`, e.g. `export GOVAI_AUDIT_BASE_URL="http://127.0.0.1:8088"`
- audit not running:
  - start it with: `make audit_bg`

