SHELL := /bin/bash

AIGOV_MODE ?= ci

.PHONY: \
	audit audit_bg audit_stop audit_restart audit_logs \
	status verify verify_log \
	run \
	require_run ensure_dirs ensure_reports_dir new_run report_new report_prepare report_prepare_new ensure_evidence pr_report pr_report_commit db_ingest \
	check_audit \
	approve evaluate promote \
	report_template report_init report_fill \
	bundle verify_cli evidence_pack audit_close \
	emit_event \
	flow flow_full \
	pr_prepare gate

AUDIT_URL ?= http://127.0.0.1:8088
AUDIT_PORT ?= 8088

AUDIT_PIDFILE ?= .aigov_audit.pid
AUDIT_LOG ?= .aigov_audit.log

# =========================
# Audit service
# =========================

audit:
	cd rust && cargo run

audit_bg:
	@set -euo pipefail; \
	if curl -fsS --max-time 1 "$(AUDIT_URL)/status" >/dev/null 2>&1; then \
		echo "aigov_audit already running on $(AUDIT_URL)"; \
		exit 0; \
	fi; \
	echo "starting aigov_audit in background on $(AUDIT_URL)"; \
	nohup bash -lc 'cd rust && cargo run' >>"$(AUDIT_LOG)" 2>&1 & echo $$! >"$(AUDIT_PIDFILE)"; \
	sleep 1

audit_stop:
	@set -euo pipefail; \
	if [ -f "$(AUDIT_PIDFILE)" ]; then \
		kill "$$(cat $(AUDIT_PIDFILE))" || true; \
		rm -f "$(AUDIT_PIDFILE)"; \
	fi

# =========================
# Common helpers
# =========================

require_run:
	@if [ -z "$(RUN_ID)" ]; then \
		echo "RUN_ID is required"; \
		exit 2; \
	fi

ensure_dirs:
	@mkdir -p docs/reports docs/audit docs/audit_meta docs/packs docs/evidence docs/policy

ensure_reports_dir:
	@mkdir -p docs/reports

new_run:
	@python3 -c 'import uuid; print(str(uuid.uuid4()))'

check_audit:
	@curl -fsS --max-time 1 $(AUDIT_URL)/status >/dev/null 2>&1 || exit 2

# =========================
# Evidence handling
# =========================

ensure_evidence: require_run ensure_dirs
	@set -euo pipefail; \
	if [ -f "docs/evidence/$(RUN_ID).json" ]; then \
		echo "evidence exists"; \
		exit 0; \
	fi; \
	if [ "$(AIGOV_MODE)" = "prod" ]; then \
		echo "ERROR: missing evidence in prod mode"; \
		exit 2; \
	fi; \
	echo "CI fallback evidence"; \
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.ci_fallback $(RUN_ID)

# =========================
# Report pipeline
# =========================

report_init: require_run ensure_reports_dir
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.report_init $(RUN_ID)

report_fill: require_run ensure_reports_dir
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.report_fill $(RUN_ID)

bundle: require_run ensure_dirs
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.export_bundle $(RUN_ID)

verify_cli: require_run
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.verify $(RUN_ID)

evidence_pack: require_run ensure_dirs
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.evidence_pack $(RUN_ID)

audit_close: require_run
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.audit_close $(RUN_ID)

# =========================
# Full pipeline
# =========================

report_prepare: require_run
	$(MAKE) ensure_evidence RUN_ID=$(RUN_ID)
	$(MAKE) report_init RUN_ID=$(RUN_ID)
	$(MAKE) bundle RUN_ID=$(RUN_ID)
	$(MAKE) report_fill RUN_ID=$(RUN_ID)
	$(MAKE) bundle RUN_ID=$(RUN_ID)
	$(MAKE) verify_cli RUN_ID=$(RUN_ID)
	$(MAKE) audit_close RUN_ID=$(RUN_ID)

report_prepare_new:
	@set -euo pipefail; \
	RUN_ID="$$(python3 -c 'import uuid; print(str(uuid.uuid4()))')"; \
	echo "$$RUN_ID"; \
	$(MAKE) report_prepare RUN_ID="$$RUN_ID"

# =========================
# Supabase ingestion
# =========================

db_ingest: require_run
	@set -euo pipefail; \
	if [ -f .env ]; then \
		set -a; . ./.env; set +a; \
	fi; \
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.ingest_run $(RUN_ID)

# =========================
# Flow alias
# =========================

flow: report_prepare

# =========================
# Safety gate
# =========================

gate:
	cd python && . .venv/bin/activate && python -m compileall aigov_py
	cd rust && cargo check
