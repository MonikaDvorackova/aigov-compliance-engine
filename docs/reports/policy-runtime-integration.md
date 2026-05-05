## Policy runtime integration (compile-only)

Goal: allow GovAI to load a customer-provided policy module YAML and compile it into a flat deterministic `required_evidence` set, without changing core verdict semantics.

This document is an audit report for the **compile-only product layer** added in Python.

### Explicit non-goals (guardrails)

- No Rust changes.
- No changes to `VALID` / `INVALID` / `BLOCKED` semantics.
- No new verdicts.
- No API schema/payload changes.
- No backend runtime enforcement changes.
- No dynamic policy logic (no conditionals; no runtime interpretation).
- No legal interpretation.

---

## Evaluation gate

This change introduces **no new evaluation logic** and does not alter evaluation semantics.

- Policy modules compile to a flat `required_evidence` set.
- Existing evidence submission and compliance verdict evaluation remain unchanged.

---

## Human approval gate

This change introduces **no new approval logic** and does not alter approval semantics.

- If a policy module includes `human_approved` in `required_evidence`, it appears in the compiled set.
- Any enforcement of `human_approved` remains in the existing backend / engine behavior.

---

## Changed files

- `python/aigov_py/policy_loader.py`
- `python/aigov_py/cli.py`
- `python/aigov_py/discovery_policy_mapping.py`
- `python/tests/test_policy_loader.py`
- `python/tests/test_cli_terminal_sdk.py`
- `docs/customer-policy-modules.md`
- `docs/policies/README.md`
- `README.md`

---

## Exact diffs

See `git diff` for the authoritative patch.

---

## Example CLI output

Example:

```bash
govai policy compile --path docs/policies/ai-act-high-risk.example.yaml
```

Expected output shape:

- newline-separated evidence codes
- sorted
- deduplicated

---

## Example JSON output

Example:

```bash
govai policy compile --path docs/policies/ai-act-high-risk.example.yaml --json
```

Expected output shape:

```json
{
  "policy": { "id": "...", "name": "...", "version": "..." },
  "required_evidence": ["..."]
}
```

---

## Verification results

Run:

- `python -m pytest -q`
- `cd rust && cargo test --lib && cd ..`
- `python -c "import yaml; yaml.safe_load(open('action.yml', encoding='utf-8')); print('action yaml ok')"`
- `git diff --check`
- `git status --short`

Results: filled in after local verification.

---

## Risk assessment

Overall risk: **low**.

- **Surface area**: compile-only Python utilities + CLI; no backend calls; no Rust changes.
- **Semantics risk**: none (does not touch verdict logic).
- **Operational risk**: minimal; new CLI subcommand only.
- **Failure mode**: invalid policy modules raise `ValueError` and `govai policy compile` exits with usage error; does not affect other commands.
