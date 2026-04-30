## Summary

- Eliminate \(O(n)\) full-ledger scans from the `POST /evidence` hot append path by introducing a per-ledger sidecar state file and a per-run event-id index file.
- Preserve existing tenant isolation, API behavior, and durability semantics (`flush` + `sync_data`).
- Keep crash recovery: if a trailing partial JSONL line is detected, repair occurs before state/index use and state is rebuilt.

## Risk assessment

- **Primary risk reduced**: avoids Railway 15s proxy timeouts caused by scanning large tenant ledgers on every append.
- **Data integrity**: ledger hash-chain semantics remain unchanged; the state/index are caches that accelerate appends.
- **Residual risk**:
  - Run index update is best-effort after a durable append; if it fails, a later duplicate retry may not be rejected via index (ledger remains correct, but idempotency may degrade until index rebuild).
  - If the state file is corrupted or missing, the server rebuilds it by scanning the ledger once (slow path).

## Evaluation gate

- `POST /evidence` append path must:
  - Not scan the full ledger when state + run index exist.
  - Rebuild state exactly once when the state file is missing/invalid.
  - Reject duplicate `run_id + event_id` using the per-run index without scanning.
  - Preserve a valid hash chain after concurrent appends.
- Run:
  - `make gate`
  - `cd rust && cargo check`
  - `cd rust && cargo test`

## Human approval gate

- Review the sidecar formats and atomic update strategy:
  - Ledger state written via temp file + rename + best-effort directory sync.
  - Run index stored per run as newline-delimited `event_id` values.
- Confirm tenant isolation is unchanged (tenant selection remains API-key-derived; ledger path remains tenant-scoped).
- Confirm no public API response shapes or status codes changed.

## Rollback plan

- Revert `rust/src/audit_store.rs` and `rust/src/govai_api.rs` to restore scan-based append logic.
- Sidecar files (`*.state.json` and `*.run.*.events`) are safe to leave behind; they will be ignored by the reverted code.

