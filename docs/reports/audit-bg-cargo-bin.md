# Audit report: audit background binary selection

## Summary

This change fixes the Makefile audit service startup command by explicitly selecting the Rust binary aigov_audit.

## Problem

The repository contains multiple Rust binaries, so plain cargo run is ambiguous and fails when make audit_bg starts the audit service.

## Fix

The Makefile now starts the audit service with cargo run --bin aigov_audit.

## Evaluation gate

Verified that the audit service startup path no longer uses ambiguous plain cargo run for the audit service binary.

## Human approval gate

This change is limited to Makefile startup command selection. It does not change compliance verdict semantics, policy logic, evidence requirements, or gate behavior.
