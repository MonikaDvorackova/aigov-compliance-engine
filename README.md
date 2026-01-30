AIGov Architecture

Audit ready AI Governance Framework for EU AI Act
Reference implementation of compliance by design machine learning systems aligned with Articles 9 to 13 of the EU AI Act.

What this is

AIGov Architecture is an open reference framework for building audit ready, traceable and legally compliant AI systems.
It translates the obligations of the EU AI Act into technical system design, allowing governance, risk management, logging and accountability to be implemented directly inside ML pipelines.
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
The goal is to enable compliance by design rather than after the fact compliance reporting.

Architecture

The system is split into two layers

1. Model and pipeline layer (Python)
This layer contains
• training and inference pipelines
• feature and data lineage
• evaluation and bias metrics
• model versioning
• experiment tracking
It integrates with tools such as
MLflow
PyTorch
scikit learn
custom training pipelines
This layer produces structured evidence about how models behave.

3. Governance and evidence layer (Rust)
This layer is the legal backbone.
It handles
• immutable audit logs
• cryptographic integrity of records
• policy as code
• compliance checks
• regulatory evidence export
• cross model traceability

The Rust layer is designed to be
deterministic
tamper resistant
auditor friendly
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

• High risk AI under EU AI Act
• Regulated industries
• Public sector AI
• Model auditing and certification
• Due diligence for investors
• Litigation and regulatory defense

Status

This repository is developed as a proof of concept and reference implementation.
It is also used as the technical backbone of an academic LL M thesis on
AI Governance Engineering and audit ready machine learning systems.

License

Apache 2.0
You are free to use this framework commercially.
You are not free to remove attribution or misrepresent authorship.
