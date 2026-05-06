# Customer policy modules

## Evaluation gate

This change introduces a customer-replaceable policy module product layer.

Validated changes:
- static policy module format documentation
- AI Act high-risk example policy
- internal GenAI example policy
- customer guide for replacing policy profiles
- lightweight Python helper for loading policy YAML and extracting a flat required_evidence set

Verification:
- python -m pytest -q
- cd rust && cargo test --lib && cd ..
- action.yml YAML parse
- git diff --check

## Human approval gate

Reviewed as low-risk product-layer change.

No changes were made to:
- Rust decision logic
- VALID / INVALID / BLOCKED semantics
- fail-closed behavior
- schemas or API payloads
- backend enforcement logic

Policy modules compile to a flat required_evidence set only.
