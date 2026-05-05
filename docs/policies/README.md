## Policies (customer-replaceable modules)

GovAI’s core engine evaluates runs against a **flat set of `required_evidence` codes** and produces deterministic verdicts (`VALID`, `BLOCKED`, `INVALID`) via `GET /compliance-summary`.

GovAI does **not** enforce legal frameworks directly.

Instead, legal/regulatory/internal frameworks are modeled as a **product-layer policy module** that maps “what your policy requires” → “which evidence codes must exist for a run”.

### What this folder is

- **Policy modules**: static YAML files that compile into a flat `required_evidence` set.
- **Examples**: reference mappings for common starting points.

### What this folder is not

- Not executable logic.
- Not a rules engine.
- Not a place to implement conditionals based on runtime data.

### Examples included

- `ai-act-high-risk.example.yaml`: example mapping for an “AI Act high-risk” framing (illustrative only).
- `internal-genai-policy.example.yaml`: example mapping for an internal GenAI policy.

### Why “AI Act” is just one policy

The EU AI Act can be one policy module among many:

- internal policy (security/approval gates)
- sector policy (health/finance)
- customer contract policy (procurement requirements)

GovAI remains policy-agnostic: it enforces **evidence completeness and deterministic decision semantics**, not legal interpretation.

