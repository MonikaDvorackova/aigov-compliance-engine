## Audit report: customer policy modules (product-layer addition)

### Summary

This change introduces a **customer-replaceable policy module format** as a documentation + lightweight helper layer:

policy module (YAML) → flat `required_evidence` set → existing GovAI engine

### What changed

- Added documentation describing a static YAML policy module format.
- Added example policy module YAML files.
- Added a minimal Python helper to load YAML and extract a flat `required_evidence` set.

### What did not change (hard constraints)

- **No Rust changes** (engine unchanged).
- **No change to `VALID` / `INVALID` / `BLOCKED` semantics**.
- **No schema changes** and **no API payload changes**.
- **No dynamic runtime logic** (policy modules are deterministic mapping only).
- **No enforcement logic changes** (engine enforcement remains authoritative and deterministic).

### Risk assessment

Low risk:

- Documentation-only changes are non-executable.
- The Python helper is standalone and not wired into the CLI or runtime paths.

### Verification

Run repository verification:

```bash
python -m pytest -q
cd rust && cargo test --lib && cd ..
python -c "import yaml; yaml.safe_load(open('action.yml', encoding='utf-8')); print('action yaml ok')"
git diff --check
git status --short
```

