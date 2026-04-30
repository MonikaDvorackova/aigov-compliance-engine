## Summary

GovAI CI workflow now installs the in-repo CLI (`./python`) and passes the same project context to `govai check` as the evidence initialization step uses for `POST /evidence` (`X-GovAI-Project=github-actions`). This prevents `RUN_NOT_FOUND` caused by mismatched project scoping.

## Root cause

The workflow installed `aigov-py==0.1.1` from PyPI, which predates the recent project-context support (`GOVAI_PROJECT` / `--project`). As a result, evidence was written under project `github-actions`, while `govai check` queried without that same project context, leading to missing-run lookups.

## Fix

- Install the CLI from the repository source with `python -m pip install -e ./python` (so the workflow uses the latest project-context behavior).
- Update the compliance gate invocation to pass project explicitly:
  `govai --project "${GOVAI_PROJECT}" check --run-id "${GOVAI_RUN_ID}"`

## Evaluation gate

`govai check` is the merge/deploy evaluation gate. Expected verdicts are **VALID** or **BLOCKED** (not `RUN_NOT_FOUND` / 404). The job fails unless the first line of output is exactly `VALID`.

## Human approval gate

Changes are limited to CI wiring (workflow install + CLI invocation) and do not alter API behavior, evidence payloads, or application logic. Human review should confirm:

- the workflow no longer pins `aigov-py==0.1.1`
- evidence and check share the same project (`github-actions`)
