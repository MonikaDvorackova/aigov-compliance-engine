# Audit export product surface

## Scope

This change exposes audit export as a visible product feature through API, CLI, documentation, and tests.

## API surface

The export endpoint is documented as:

- `GET /api/export/{run_id}`

The response includes:

- stable schema version
- run metadata
- decision fields
- evidence hashes
- chain head hash
- log chain entries
- timestamps

## CLI surface

The CLI exposes:

- `govai export-run --run-id <id>`

The command returns JSON from the export endpoint.

## Decision fields

The export response includes:

- `human_approval`
- `promotion`
- `evaluation_passed`

## Hash fields

The export response includes:

- `bundle_sha256`
- `chain_head_record_sha256`
- `log_chain`

## Evaluation gate

Export must not change compliance decision semantics. It only exposes the current decision state in a stable JSON export.

## Human approval gate

Human approval is exported as audit evidence. Missing approval remains represented explicitly as `null`, not inferred as approval.

## Promotion gate

Promotion state is exported as audit evidence. Missing promotion remains represented explicitly as `null`, not inferred as promotion.

## Verification

Relevant tests:

- `cargo test --manifest-path rust/Cargo.toml --test export_http`
- `cargo test --manifest-path rust/Cargo.toml --test pricing_http`
- `cargo test --manifest-path rust/Cargo.toml --test usage_http`

## Risk

Low. The change exposes existing audit information and adds tests around response shape and hash consistency.
