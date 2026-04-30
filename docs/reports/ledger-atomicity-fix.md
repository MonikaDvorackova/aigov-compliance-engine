## Summary
- Fixes **concurrency-induced audit ledger corruption** by enforcing single-writer semantics per tenant ledger file.
- Moves duplicate `run_id + event_id` detection into the locked append critical section to make duplicate rejection deterministic under concurrency.
- Improves durability of ledger writes by flushing and syncing appended data to disk; sync failures now return an error.

## Risk assessment
- **Primary risk reduced**: prevents hash-chain breaks caused by concurrent writes that previously could append conflicting `prev_hash` values.
- **Behavioral compatibility**: does **not** change billing, does **not** change public API behavior, and does **not** enable Stripe.
- **Residual risk**: this provides in-process single-writer semantics; it does not address multi-process writers to the same ledger file.

## Evaluation gate
- Automated Rust tests include concurrency coverage proving:
  - Concurrent distinct appends preserve a valid hash chain.
  - Concurrent duplicates are rejected deterministically (exactly one success).
- Run `make gate`, `cd rust && cargo check`, and `cd rust && cargo test`.

## Human approval gate
- Review that the lock scope covers the full critical section (duplicate check + last hash + append + flush/sync).
- Confirm the duplicate error behavior remains a conflict with the same error code and response shape.
- Confirm no billing/metering logic changes and no Stripe enablement.

## Rollback plan
- Revert the changes in `rust/src/audit_store.rs` and `rust/src/govai_api.rs` to restore the prior append path.
- No schema migrations or data migrations are introduced by this change.
