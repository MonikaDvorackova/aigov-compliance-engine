# Customer onboarding (hosted pilot, ~10 minutes)

Goal: verify a hosted GovAI backend is wired correctly by running a deterministic evidence flow that transitions:

`BLOCKED` → `VALID`, then exporting the audit JSON.

This is the **canonical hosted-pilot onboarding** entry point. It assumes manual or semi-automated provisioning by an operator (not a self-serve signup flow).

## Prereqs

- Python 3.10+
- Your GovAI admin/operator provides (pilot provisioning):
  - `GOVAI_AUDIT_BASE_URL` (e.g. `https://api.example.com`)
  - `GOVAI_API_KEY` (Bearer token)

## 1) Install the CLI

```bash
python -m pip install --upgrade pip
python -m pip install "aigov-py==0.2.1"
govai --version
```

## 2) Set GOVAI_AUDIT_BASE_URL and GOVAI_API_KEY

```bash
export GOVAI_AUDIT_BASE_URL="https://api.example.com"
export GOVAI_API_KEY="YOUR_API_KEY"
```

## 3) Create GOVAI_RUN_ID

Use a new UUID for this onboarding run:

```bash
export GOVAI_RUN_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
echo "$GOVAI_RUN_ID"
```

## 4) Run the deterministic demo (hosted)

Force the deterministic demo to use your `GOVAI_RUN_ID`:

```bash
export GOVAI_DEMO_RUN_ID="$GOVAI_RUN_ID"
govai run demo-deterministic
```

Expected output includes:

- `verdict: BLOCKED`
- `missing evidence:` (one or more entries)
- later: `verdict: VALID`

## 5) Verify the final decision explicitly

```bash
govai check --run-id "$GOVAI_RUN_ID"
```

Expected: prints `VALID` and exits `0`.

## 6) Export audit JSON (machine-readable)

```bash
govai export-run --run-id "$GOVAI_RUN_ID" > "govai-export-${GOVAI_RUN_ID}.json"
ls -la "govai-export-${GOVAI_RUN_ID}.json"
```

## What to do next

- Read the precise definitions and non-claims:
  - [trust-model.md](trust-model.md)

- Add the GitHub Action compliance gate: see [github-action.md](github-action.md).
  - Your CI must submit evidence events for the same `GOVAI_RUN_ID` before the gate runs.

## Advanced usage

For manual control over evidence submission (without the deterministic demo), see:
[manual-evidence-flow.md](manual-evidence-flow.md)
