# Audit report: audit background binary selection

## Summary

This change fixes the Makefile audit service startup command by explicitly selecting the Rust binary `aigov_audit`.

## Problem

The repository now contains multiple Rust binaries:

- `aigov_audit`
- `portable_evidence_digest_once`

Because of that, plain `cargo run` is ambiguous and CI fails when `make audit_bg` tries to start the audit service.

## Fix

The Makefile now uses:

```bash
cargo run --bin aigov_audit
