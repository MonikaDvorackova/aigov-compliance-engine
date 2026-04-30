## Summary
This change makes the JSONL audit ledger crash-recoverable by tolerating and repairing **a single trailing partial/corrupted line** that can occur if the process crashes mid-append. Valid committed records before the corrupted tail remain readable and verifiable, and appends can continue safely after deterministic repair.

This fixes crash-induced trailing ledger corruption. This does not change public API behavior. This does not enable billing or Stripe. This does not change tenant isolation.

## Risk assessment
- **Primary risk addressed**: operational bricking of the ledger due to a crash during append leaving a trailing partial JSONL line.
- **New risk introduced**: truncation logic could remove valid bytes if implemented incorrectly; mitigation is strict “truncate only the trailing invalid final line” behavior plus tests that assert valid records are never truncated.
- **Non-goals preserved**: no ledger format redesign, no Postgres migration, no metering/Stripe changes, no tenant isolation changes.

## Evaluation gate
- Crash-tail scenario: a ledger with valid records followed by a trailing partial JSON line must remain usable for scans/verification/exports.
- Append path: when a trailing partial line exists, append must deterministically repair (truncate tail under lock) and then append a valid record without breaking the hash chain.
- Corruption safety: any invalid JSONL line **not** at EOF must still fail as hard corruption (no silent skipping).

## Human approval gate
- Approve after reviewing:
  - The shared tolerant scan behavior (only trailing corruption is recoverable).
  - The repair helper (truncates only the trailing invalid bytes and syncs).
  - The append critical section (repair happens under the existing per-ledger lock).

## Rollback plan
- Revert the commit(s) that introduce tolerant scanning and repair/truncation behavior.
- Operationally, if any unexpected truncation behavior is observed, stop writes, restore the ledger file from the last known-good backup/snapshot, and redeploy the prior version.
