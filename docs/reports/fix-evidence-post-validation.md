## Summary

`POST /evidence` in `.github/workflows/govai-check.yml` was failing with HTTP 400, but the workflow did not reliably surface the error response body in CI logs.

This change updates the workflow to capture and print the full response body (successful or error) and to fail explicitly with an actionable message that includes the HTTP status code.

## Root cause

The workflow’s evidence submission used a failing `curl` invocation in a way that effectively hid the response body from logs (redirected to `/dev/null`), leaving only a generic failure signal when the endpoint returned HTTP 400.

Without the response body, we could not see which server-side validation path was rejecting the request (e.g., missing tenant context, environment constraints, or JSON/schema issues).

## Fix

- Replaced the existing `POST /evidence` call with a version that:
  - **captures** the response body to a temp file
  - **captures** the HTTP status code
  - **prints** the response body to the workflow log
  - **fails** with `::error::Evidence POST failed with HTTP <status>` for any non-2xx status
- Kept required fields:
  - Authorization header
  - `run_id`
  - unique `event_id`
  - ISO8601 UTC timestamp (`ts_utc`)
- Payload remains the minimal `ai_discovery_reported` shape already supported by the ledger projection (`payload.openai|transformers|model_artifacts` booleans).

## Verification steps

- Confirm the workflow targets the evidence endpoint:

```bash
grep -n "/evidence" .github/workflows/govai-check.yml
```

- Confirm the workflow prints the server response body:
  - Look for the log line `Evidence POST response:` followed by the response JSON/text.
- Confirm the workflow fails with a meaningful error:
  - For non-2xx responses, the step should emit `::error::Evidence POST failed with HTTP <status>` and exit 1.


## Evaluation gate

The workflow must print the full `POST /evidence` response body and HTTP status before failing, so validation errors are diagnosable.

## Human approval gate

This change is approved because it improves CI observability only. It does not change compliance verdict logic, evidence requirements, or backend authorization.
