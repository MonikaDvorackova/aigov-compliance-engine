# Tenant Ledger Isolation Fix

## Summary
This change hardens tenant ledger isolation for hosted GovAI audit routes.

## Problem
A tenant could request a run ID that was not present in its own tenant ledger and still receive a successful empty bundle or summary response.

## Changes
- `/bundle` returns `ok: false` with `run_not_found` when no events exist for the requested run in the current tenant ledger.
- `/bundle-hash` returns `ok: false` with `run_not_found` for empty tenant-local runs.
- `/compliance-summary` returns `ok: false` with `run_not_found` for empty tenant-local runs.
- Tenant ledger tests seed the correct tenant ledger before ingest.
- Billing HTTP tests assert against persisted evidence events.

## Evaluation gate
- `cargo fmt`
- `cargo test -q`
- Tenant B cannot receive a successful bundle or summary response for a run absent from Tenant B’s ledger.

## Human approval gate
Approved for staging promotion after tests pass and CI lidates this report.

## Security impact
This prevents successful cross-tenant read responses for run IDs that are not present in the requester tenant ledger.

## Validation
- `cargo fmt`
- `cargo test -q`
