AIGov Architecture
Audit ready AI Governance Framework for EU AI Act
Reference implementation of compliance by design machine learning systems aligned with Articles 9 to 13 of the EU AI Act.
What this is
AIGov Architecture is an open reference framework for building audit ready, traceable and legally compliant AI systems.
It translates the obligations of the EU AI Act directly into technical system design, allowing governance, risk management, logging and accountability to be enforced inside machine learning pipelines.
This is not documentation.
This is infrastructure.
Regulatory scope
The framework is designed around Articles 9 to 13 of the EU AI Act, covering
• Risk management systems
• Data and model governance
• Technical documentation
• Record keeping and logging
• Transparency and traceability
• Human oversight
The goal is to enable compliance by design, not after the fact compliance reporting.
Architecture
The system is split into two layers.
1 Model and pipeline layer (Python)
This layer contains
• training and inference pipelines
• feature and data lineage
• evaluation and bias metrics
• model versioning
• experiment tracking
It integrates with
• scikit learn
• PyTorch
• MLflow
• custom training pipelines
This layer produces structured, machine verifiable evidence about how models behave.
2 Governance and evidence layer (Rust)
This layer is the legal backbone.
It handles
• immutable audit logs
• cryptographic integrity of records
• policy as code
• compliance checks
• regulatory evidence export
• cross model traceability
The Rust layer is designed to be
• deterministic
• tamper resistant
• auditor friendly
This is what makes the system legally defensible.
Core idea
Every high risk AI system must be able to answer
• What data was used
• Which model version was deployed
• Who approved it
• What risks were known
• What policies were applied
• What changed
• Who is responsible
This framework makes those answers machine verifiable.
Use cases
• High risk AI under the EU AI Act
• Regulated industries
• Public sector AI
• Model auditing and certification
• Due diligence for investors
• Litigation and regulatory defense
Status
This repository is developed as a proof of concept and reference implementation.
It is also used as the technical backbone of an academic LL M thesis on
AI Governance Engineering and audit ready machine learning systems
Quick start governance demo
This demo shows how an AI model is trained, evaluated, approved by a human and only then allowed to be promoted, with a full cryptographically verifiable audit trail.
1 Start the governance engine
In the first terminal run
make audit
This starts the governance layer that enforces policies, verifies evidence and stores the immutable audit log.
In a second terminal verify that the engine is running
make verify
make status
You should see
{"ok": true, "policy_version": "v0.4_human_approval"}
2 Run a governed model training
Start a training run
make run
The pipeline will
• register the dataset
• train the model
• compute evaluation metrics
• stop before promotion
You will see output similar to
done run_id=68460594-91c0-4e63-8722-bd4f2f54abe5 accuracy=0.96 passed=True

pending_human_approval

next:
RUN_ID=68460594-91c0-4e63-8722-bd4f2f54abe5 make approve
At this point the model is trained but cannot be promoted without human approval.
3 Human approval gate
Approve the model as a human compliance officer
RUN_ID=<run_id> make approve
This creates a legally traceable human_approved decision linked to the run.
4 Promote the model
Only after approval, the model can be promoted
RUN_ID=<run_id> make promote
If you try to promote without approval, the governance engine will block it.
5 Export the legal evidence bundle
Create the evidence bundle
RUN_ID=<run_id> make bundle
This produces
docs/evidence/<run_id>.json
This file contains a cryptographically chained, policy validated record of
• dataset fingerprint
• training parameters
• evaluation results
• human approval
• model promotion
This file is suitable for audits, regulators, due diligence and court proceedings.
6 Generate the audit report
Generate a human readable audit report
RUN_ID=<run_id> make report
This produces
docs/reports/<run_id>.md
This document is a legal grade technical report of the entire model lifecycle.
What this proves
This system demonstrates that
• no model can be deployed without recorded human approval
• all training and data lineage is immutable
• every decision is cryptographically verifiable
• compliance is enforced at runtime
This is not logging.
This is compliance by design.
License
Apache 2.0
You are free to use this framework commercially.
You are not free to remove attribution or misrepresent authorship.