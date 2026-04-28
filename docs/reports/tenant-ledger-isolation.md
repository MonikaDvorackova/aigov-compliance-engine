# Tenant Ledger Isolation Fix

## Summary
This change hardens tenant ledger isolation.

## Changes
- bundle / summary return run_not_found for empty tenant runs

## Validation
- cargo test -q
