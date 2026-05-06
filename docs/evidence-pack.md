# Evidence pack generator (customer-ready)

This repo ships a minimal, deterministic evidence pack generator so customers can create a valid evidence pack without reverse-engineering tests or demos.

## Generate an evidence pack

This writes exactly two files:

- `<run_id>.json`
- `evidence_digest_manifest.json`

Run:

```bash
govai evidence-pack init --out evidence_pack --run-id "00000000-0000-0000-0000-000000000123"
```

Or, to use the deterministic default run id (good for a copy/paste demo path):

```bash
govai evidence-pack init --out evidence_pack
```

## Submit it

Set your audit service connection:

```bash
export GOVAI_AUDIT_BASE_URL="http://127.0.0.1:8088"
export GOVAI_API_KEY="YOUR_API_KEY"
```

Then submit:

```bash
govai submit-evidence-pack --path evidence_pack --run-id "00000000-0000-0000-0000-000000000123"
```

## Verify it (production gate)

This checks digest continuity (`evidence_digest_manifest.json` vs hosted `/bundle-hash`) and then requires the run to be `VALID`.

```bash
govai verify-evidence-pack --require-export --path evidence_pack --run-id "00000000-0000-0000-0000-000000000123"
```

## Run `govai check`

```bash
govai check --run-id "00000000-0000-0000-0000-000000000123"
```

