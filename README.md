AIGov Architecture

Audit ready AI Governance Framework for the EU AI Act

Reference implementation of compliance by design machine learning systems aligned with Articles 9 to 13 of the EU AI Act.

What this is

AIGov Architecture is an open reference framework for building audit ready, traceable and legally compliant AI systems.
It translates the obligations of the EU AI Act directly into technical system design, so that governance, risk management, logging and accountability are enforced inside the machine learning pipeline, not added afterwards.

This is not documentation.
This is infrastructure.

Regulatory scope

The framework is designed around Articles 9 to 13 of the EU AI Act, covering
Risk management systems
Data and model governance
Technical documentation
Record keeping and logging
Transparency and traceability
Human oversight
The goal is to enable compliance by design, not after the fact compliance reporting.

Architecture

The system is split into two tightly coupled layers.
1 Model and pipeline layer (Python)
This layer contains
Training and inference pipelines
Feature and data lineage
Evaluation and bias metrics
Model versioning
Experiment tracking
It integrates with
scikit learn
PyTorch
MLflow
Custom training pipelines
This layer produces structured machine verifiable evidence about how models are trained, evaluated and deployed.
2 Governance and evidence layer (Rust)
This layer is the legal backbone.
It handles
Immutable audit logs
Cryptographic integrity of records
Policy as code
Compliance checks
Regulatory evidence export
Cross model traceability
The Rust layer is designed to be
Deterministic
Tamper resistant
Auditor friendly
This is what makes the system legally defensible.

Core idea

Every high risk AI system must be able to answer
What data was used
Which model version was deployed
Who approved it
What risks were known
What policies were applied
What changed
Who is responsible
This framework makes those answers machine verifiable.

Use cases

High risk AI under the EU AI Act
Regulated industries
Public sector AI
Model auditing and certification
Due diligence for investors
Litigation and regulatory defense

Status

This repository is developed as a proof of concept and reference implementation.
It is also used as the technical backbone of an academic LLM thesis on AI Governance Engineering and audit ready machine learning systems.

Quick start governance demo

This demo shows how an AI model is trained, evaluated, approved by a human and only then allowed to be promoted, with a cryptographically verifiable audit trail.
1 Start the governance engine
In the first terminal run
make audit
This starts the governance layer that enforces policies, verifies evidence and stores the immutable audit log.
In a second terminal verify that the engine is running
make verify
make status
You should see something like
{"ok": true, "policy_version": "v0.4_human_approval"}
2 Run a governed model training
Start a training run
make run
The pipeline will
Register the dataset
Train the model
Compute evaluation metrics
Stop before promotion
You will see output similar to
done run_id=68460594-91c0-4e63-8722-bd4f2f54abe5 accuracy=0.96 passed=True

pending_human_approval

next:
RUN_ID=68460594-91c0-4e63-8722-bd4f2f54abe5 make approve
At this point the model is trained but cannot be promoted without human approval.
3 Human approval gate
Approve the model as a human compliance officer
RUN_ID=<run_id> make approve
This creates a legally traceable human approval linked to the run.
4 Promote the model
Only after approval the model can be promoted
RUN_ID=<run_id> make promote
If you try to promote without approval, the governance engine will block it.
5 Export the legal evidence bundle
Create the evidence bundle
RUN_ID=<run_id> make bundle
This produces
docs/evidence/<run_id>.json
This file contains a cryptographically chained, policy validated record of
Dataset fingerprint
Training parameters
Evaluation results
Human approval
Model promotion
This file is suitable for audits, regulators, due diligence and court proceedings.
6 Generate the audit report
Generate a human readable audit report
RUN_ID=<run_id> make report
This produces
docs/reports/<run_id>.md
This document is a legal grade technical report of the entire model lifecycle.

What this proves

This system demonstrates that
No model can be deployed without recorded human approval
All training and data lineage is immutable
Every decision is cryptographically verifiable
Compliance is enforced at runtime

This is not logging.

This is compliance by design.

License

Apache 2.0
You are free to use this framework commercially.
You are not free to remove attribution or misrepresent authorship. 
