# GovAI documentation

This directory is the **external-facing documentation** for GovAI (CI compliance gate + audit evidence export).

## Overview

GovAI records lifecycle events as structured evidence and returns a single authoritative decision per run:

- `VALID`
- `INVALID`
- `BLOCKED`

## Product Scope

GovAI:

- accepts evidence via `POST /evidence`
- returns a deterministic compliance decision via `GET /compliance-summary`
- supports CI gating by failing unless verdict is `VALID`
- exports machine-readable audit evidence via `GET /api/export/:run_id`

GovAI does **not** generate missing evidence and is **not** a legal certification.

## Decision states

- **`VALID`**: required evidence present and policy satisfied (deployment allowed)
- **`INVALID`**: evidence present but fails policy (deployment rejected)
- **`BLOCKED`**: required evidence missing (deployment halted)

## Private pilot and pricing

- **Private pilot onboarding**: [pilot-onboarding.md](pilot-onboarding.md)
- **Pilot quickstart**: [customer-quickstart.md](customer-quickstart.md)

Pricing for the pilot is agreed directly (no self-serve checkout or automated billing in this repo).

## Quickstart links

- **Local 5-minute demo (audit service + end-to-end flow)**: [quickstart-5min.md](quickstart-5min.md)
- **Customer / CI quickstart (minimal hosted-style flow)**: [customer-quickstart.md](customer-quickstart.md)
- **GitHub Action**: [github-action.md](github-action.md)

## Concepts

- **Event**: one recorded fact about a system action.
- **Bundle**: a set of events for one run (`run_id`).
- **Compliance summary**: the decision derived from evidence.
- **Audit chain**: append-only, hash-chained integrity for recorded evidence.

## API surface

- **OpenAPI contract (canonical v1)**: [`api/govai-http-v1.openapi.yaml`](../api/govai-http-v1.openapi.yaml)
- **Endpoints used in customer flows**:
  - `POST /evidence`
  - `GET /compliance-summary?run_id=...`
  - `GET /api/export/:run_id`
  - `GET /verify`

## More docs

- [policy-contract.md](policy-contract.md)
- [technical-documentation.md](technical-documentation.md)
