# Customer-facing error handling audit report

## Summary

This change standardizes customer-facing API error responses across auth, API key validation, evidence submission, compliance summary, export, discovery, and tenant isolation paths.

## Customer impact

Customers now receive actionable error responses with a stable machine-readable code, human-readable message, recovery hint, and optional details.

## Standard format

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
