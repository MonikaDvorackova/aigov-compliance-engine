# CI local PR validation

## Summary

This change separates PR validation from hosted release validation.

Pull request and staging validation must test the backend from the current commit. The compliance workflow already starts a local audit service and validates evidence against `http://127.0.0.1:8088`.

The hosted GovAI compliance gate is restricted to `main` branch runs, where it can validate the deployed production endpoint.

## Risk assessment

Risk before this change:
- PR validation could call the production Railway endpoint running `main`.
- This validated new workflow and evidence changes against an older backend.
- Failures could appear unrelated to the PR code.

Risk after this change:
- PR validation uses the local audit service built from the checked-out commit.
- Hosted validation remains available for `main` release verification.
- No compliance gate is disabled; the validation target is corrected.

## Evaluation gate

Verified requirements:
- PR and staging validation use the local audit service from the current commit.
- Hosted production validation is restricted to `main`.
- The change does not weaken authentication.
- The change does not weaken tenant isolation.
- The change does not disable evidence submission.
- The change does not disable the compliance gate.

Run:
- make gate
- cd rust && cargo check
- cd rust && cargo test

## Human approval gate

This is a CI correctness fix. It does not change runtime product behavior, billing, Stripe, tenant isolation, or ledger durability.

## Rollback plan

Revert the workflow condition change and remove this report if hosted validation must temporarily run on all branches again.
