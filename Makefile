SHELL := /bin/bash
.ONESHELL:

PY := cd python && . .venv/bin/activate &&

AIGOV_EVAL_METRIC ?= f1
AIGOV_EVAL_THRESHOLD ?= 0.85
AIGOV_EVAL_VALUE ?=

.PHONY: guard check-audit verify-log approve evaluate promote report-init report-fill bundle verify-cli evidence-pack flow

guard:
	@if [ -z "$(RUN_ID)" ]; then \
		echo "RUN_ID is required. Usage: RUN_ID=<uuid> make <target>"; \
		exit 2; \
	fi

check-audit:
	@curl -sS http://127.0.0.1:8088/status >/dev/null || ( \
		echo "Audit service not reachable on http://127.0.0.1:8088"; \
		echo "Start it with: make audit"; \
		exit 2; \
	)

verify-log:
	@curl -sS http://127.0.0.1:8088/verify-log ; echo

approve: guard check-audit verify-log
	$(PY) RUN_ID=$(RUN_ID) python -m aigov_py.approve

evaluate: guard check-audit verify-log
	@if [ -z "$(AIGOV_EVAL_VALUE)" ]; then \
		echo "AIGOV_EVAL_VALUE is required"; \
		echo "Example:"; \
		echo "  make evaluate RUN_ID=$(RUN_ID) AIGOV_EVAL_VALUE=0.88"; \
		exit 2; \
	fi
	$(PY) RUN_ID=$(RUN_ID) \
		AIGOV_EVAL_METRIC=$(AIGOV_EVAL_METRIC) \
		AIGOV_EVAL_VALUE=$(AIGOV_EVAL_VALUE) \
		AIGOV_EVAL_THRESHOLD=$(AIGOV_EVAL_THRESHOLD) \
		python -m aigov_py.evaluate

promote: guard check-audit verify-log
	$(PY) RUN_ID=$(RUN_ID) python -m aigov_py.promote

report-init: guard
	$(PY) python -m aigov_py.report_init $(RUN_ID)

report-fill: guard
	$(PY) python -m aigov_py.report_fill $(RUN_ID)

bundle: guard
	$(PY) python -m aigov_py.export_bundle $(RUN_ID)

verify-cli: guard
	$(PY) python -m aigov_py.verify $(RUN_ID)

evidence-pack: guard
	mkdir -p docs/reports docs/audit docs/packs docs/evidence docs/policy
	$(PY) RUN_ID=$(RUN_ID) python -m aigov_py.evidence_pack

flow: approve evaluate promote report-init report-fill bundle verify-cli evidence-pack
