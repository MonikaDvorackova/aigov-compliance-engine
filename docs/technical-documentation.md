# AI Governance Engineering PoC Technical Documentation

## Scope
This repository provides a proof of concept for compliance by design in an ML pipeline. The PoC focuses on:
- tamper evident audit logging (hash chained records)
- policy as code enforcement in the evidence service
- traceability of data via dataset fingerprint
- exportable evidence bundle per ML run

## Components
### Rust evidence service
- HTTP API
  - POST /evidence ingests evidence events
  - GET /verify verifies the hash chain integrity
  - GET /status returns policy version
  - GET /bundle?run_id=... exports the evidence set for a single ML run
- Storage
  - rust/audit_log.jsonl stores StoredRecord lines with prev_hash and record_hash
  - record_hash = sha256(prev_hash || json(event))
- Policy as code
  - policy rules are enforced before events are appended to the log

### Python ML pipeline
- trains a simple baseline model (LogisticRegression on iris)
- emits evidence events to the evidence service
- persists model artifact under python/artifacts/

## Evidence schema
Each event uses:
- event_id, event_type, ts_utc, actor, system, run_id, payload

Required event sequence (enforced by policy):
- run_started
- data_registered (must include dataset_fingerprint)
- model_trained (requires prior data_registered for same run_id)
- evaluation_reported (payload schema enforced)
- model_promoted (requires prior evaluation_reported with passed=true for same run_id)

## Policy versions
- v0.3_traceability
  - data_registered must contain dataset(str) and dataset_fingerprint(str)
  - model_trained requires prior data_registered for same run_id
  - evaluation_reported payload must include metric(str), value(number), threshold(number), passed(bool)
  - model_promoted requires prior evaluation_reported passed=true for same run_id

## Evidence bundle export
To export a single run evidence bundle:
- make bundle RUN_ID=<run_id>

The bundle includes:
- policy_version
- log_path
- model_artifact_path (if model_promoted exists)
- ordered list of events for the run_id

## Integrity verification
- make verify
The verify endpoint checks the full chain in rust/audit_log.jsonl and fails if any record is altered or reordered.

## EU AI Act mapping (Articles 9 to 13)
This PoC demonstrates technical mechanisms that support:
- risk management workflow hooks via policy enforced gates (Article 9)
- data governance and traceability via dataset fingerprint and data_registered evidence (Article 10)
- technical documentation and record keeping via exportable evidence bundles and append only logs (Articles 11 and 12)
- transparency and observability signals via evaluation_reported and model_promoted evidence (Article 13)
