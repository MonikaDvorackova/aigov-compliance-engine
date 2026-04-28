# Common API errors and fixes

All GovAI API error responses use this JSON shape:

```json
{
  "ok": false,
  "error": {
    "code": "SCREAMING_SNAKE_CASE",
    "message": "Human-readable message",
    "hint": "Actionable recovery step",
    "details": {}
  }
}
```

## Auth and API key validation

### `MISSING_API_KEY` (401)
- **Meaning**: No API key was provided.
- **Fix**: Add `Authorization: Bearer <api_key>`.

### `INVALID_API_KEY` (401)
- **Meaning**: The API key is present but not recognized.
- **Fix**: Verify you’re using the GovAI API key (not a JWT), and update your integration if the key was rotated.

### `MISSING_TENANT_CONTEXT` (400)
- **Meaning**: The request is missing tenant context in `staging`/`prod`.
- **Fix**: Provide `X-GovAI-Project: <your_project_id>` (recommended) or send a bearer API key (tenant fingerprint fallback).

## Evidence submission (`POST /evidence`)

### `POLICY_VIOLATION` (400)
- **Meaning**: The evidence event payload violates the active policy (or environment rules).
- **Fix**: Correct the event fields per the error message and retry.

### `DUPLICATE_EVENT_ID` (409)
- **Meaning**: The `event_id` already exists for this `run_id`.
- **Fix**: Treat as an idempotent retry (do not resend), or use a new `event_id`.

## Compliance summary (`GET /compliance-summary`)

### `RUN_NOT_FOUND` (404)
- **Meaning**: No evidence exists for this `run_id` in the current tenant ledger.
- **Fix**: Verify `run_id` and ensure the same tenant context (`X-GovAI-Project` / API key) is used as when evidence was ingested.

## Export (`GET /api/export/:run_id`)

### `RUN_ID_REQUIRED` (400)
- **Meaning**: The `run_id` path parameter was empty.
- **Fix**: Provide a non-empty `run_id`.

### `RUN_NOT_FOUND` (404)
- **Meaning**: No evidence exists for this `run_id` in the current tenant ledger.
- **Fix**: Same as compliance summary: check `run_id` + tenant context.

