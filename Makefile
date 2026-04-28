SHELL := /bin/bash
-include .env
export

AIGOV_MODE ?= ci

.PHONY: \
	FORCE \
	audit audit_bg audit_stop audit_restart audit_logs \
	status verify verify_log \
	run \
	require_run ensure_dirs ensure_reports_dir new_run report_new report_prepare report_prepare_new ensure_evidence pr_report pr_report_commit db_ingest \
	check_audit \
	report_template report_init report_fill \
	bundle verify_cli evidence_pack \
	emit_event \
	flow flow_full \
	pr_prepare gate \
	audit_close \
	demo demo_new \
	env_check

.PHONY: discovery_scan
discovery_scan:
	cd python && . .venv/bin/activate && \
		python -m aigov_py.cli discovery scan --path ..

FORCE:

AUDIT_URL ?= http://127.0.0.1:8088
AUDIT_PORT ?= 8088

AUDIT_PIDFILE ?= .aigov_audit.pid
AUDIT_LOG ?= .aigov_audit.log

# ================================
# Env debug
# ================================

env_check:
	@echo "PWD=$$(pwd)"
	@echo "SUPABASE_URL=$(SUPABASE_URL)"
	@echo "SUPABASE_SERVICE_ROLE_KEY=$$(if [ -n "$(SUPABASE_SERVICE_ROLE_KEY)" ]; then echo "SET"; else echo "MISSING"; fi)"
	@ls -la .env 2>/dev/null || true

# Compliance "gate" check used by CI:
# ensure that generated audit reports include the minimum required sections.
gate:
	@python3 scripts/gate_reports.py

# ================================
# Audit service
# ================================

audit:
	cd rust && cargo run

audit_bg:
	@set -euo pipefail; \
	if curl -fsS --max-time 1 "$(AUDIT_URL)/status" >/dev/null 2>&1; then \
		echo "aigov_audit already running on $(AUDIT_URL)"; \
		exit 0; \
	fi; \
	PIDS="$$(lsof -tiTCP:$(AUDIT_PORT) -sTCP:LISTEN 2>/dev/null || true)"; \
	if [ -n "$$PIDS" ]; then \
		echo "port $(AUDIT_PORT) already in use by: $$PIDS"; \
		exit 2; \
	fi; \
	echo "starting aigov_audit in background on $(AUDIT_URL)"; \
	echo "log: $(AUDIT_LOG)"; \
	: > "$(AUDIT_LOG)"; \
	nohup bash -lc 'cd rust && cargo run' >>"$(AUDIT_LOG)" 2>&1 & echo $$! >"$(AUDIT_PIDFILE)"; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12; do \
		if curl -fsS --max-time 1 "$(AUDIT_URL)/status" >/dev/null 2>&1; then \
			echo "ready on $(AUDIT_URL)"; \
			exit 0; \
		fi; \
		sleep 0.5; \
	done; \
	echo "start failed, last log lines:"; \
	tail -n 120 "$(AUDIT_LOG)" || true; \
	exit 1

audit_stop:
	@set -euo pipefail; \
	PID=""; \
	if [ -f "$(AUDIT_PIDFILE)" ]; then \
		PID="$$(cat "$(AUDIT_PIDFILE)" 2>/dev/null || true)"; \
	fi; \
	if [ -n "$$PID" ] && kill -0 "$$PID" >/dev/null 2>&1; then \
		echo "stopping pid $$PID"; \
		kill "$$PID" || true; \
		sleep 0.3; \
	fi; \
	PIDS="$$(lsof -tiTCP:$(AUDIT_PORT) -sTCP:LISTEN 2>/dev/null || true)"; \
	if [ -n "$$PIDS" ]; then \
		echo "stopping processes on port $(AUDIT_PORT): $$PIDS"; \
		kill $$PIDS || true; \
		sleep 0.3; \
		PIDS2="$$(lsof -tiTCP:$(AUDIT_PORT) -sTCP:LISTEN 2>/dev/null || true)"; \
		if [ -n "$$PIDS2" ]; then \
			echo "forcing stop: $$PIDS2"; \
			kill -9 $$PIDS2 || true; \
		fi; \
	fi; \
	rm -f "$(AUDIT_PIDFILE)"; \
	echo "stopped"

audit_restart:
	@$(MAKE) audit_stop
	@$(MAKE) audit_bg

audit_logs:
	@set -euo pipefail; \
	if [ -f "$(AUDIT_LOG)" ]; then \
		tail -n 200 "$(AUDIT_LOG)"; \
	else \
		echo "no log file yet: $(AUDIT_LOG)"; \
	fi

status:
	curl -sS $(AUDIT_URL)/status ; echo

verify:
	curl -sS $(AUDIT_URL)/verify ; echo

verify_log:
	curl -sS $(AUDIT_URL)/verify-log ; echo

# ================================
# Core
# ================================

run:
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.pipeline_train

require_run:
	@if [ -z "$(RUN_ID)" ]; then \
		echo "RUN_ID is required"; \
		exit 2; \
	fi

check_audit:
	@curl -fsS --max-time 1 $(AUDIT_URL)/status >/dev/null 2>&1 || ( \
		echo "Audit service not reachable on $(AUDIT_URL)"; \
		echo "Start it with: make audit_bg"; \
		exit 2; \
	)

ensure_dirs:
	@mkdir -p docs/reports docs/audit docs/audit_meta docs/packs docs/evidence docs/policy

ensure_reports_dir:
	@mkdir -p docs/reports

new_run:
	@python3 -c 'import uuid; print(str(uuid.uuid4()))'

report_new:
	@$(MAKE) new_run

# ================================
# Evidence
# ================================

ensure_evidence: require_run ensure_dirs
	@set -euo pipefail; \
	if [ ! -f "docs/evidence/$(RUN_ID).json" ] && [ "$(AIGOV_MODE)" = "prod" ]; then \
		echo "ERROR: missing evidence in prod mode"; \
		exit 2; \
	fi; \
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.fetch_bundle_from_govai $(RUN_ID) || \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.ci_fallback $(RUN_ID)

# ================================
# Report flow
# ================================

report_template: require_run ensure_reports_dir
	@echo "run_id=$(RUN_ID)" > docs/reports/$(RUN_ID).md
	@echo "bundle_sha256=" >> docs/reports/$(RUN_ID).md
	@echo "policy_version=" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "# Audit report for run \`$(RUN_ID)\`" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "saved docs/reports/$(RUN_ID).md"

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
	AIGOV_MODE=$(AIGOV_MODE) RUN_ID=$(RUN_ID) python -m aigov_py.evidence_pack

audit_close: require_run
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.audit_close $(RUN_ID)

report_prepare: require_run
	@echo "Preparing report for RUN_ID=$(RUN_ID) (AIGOV_MODE=$(AIGOV_MODE))"
	$(MAKE) ensure_evidence RUN_ID=$(RUN_ID)
	cd python && . .venv/bin/activate && \
		RUN_ID=$(RUN_ID) AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.report
	$(MAKE) export_bundle RUN_ID=$(RUN_ID)
	$(MAKE) verify_cli RUN_ID=$(RUN_ID)

report_prepare_new:
	@set -euo pipefail; \
	RUN_ID="$$(python3 -c 'import uuid; print(str(uuid.uuid4()))')"; \
	echo "$$RUN_ID"; \
	$(MAKE) report_prepare RUN_ID="$$RUN_ID"

# ================================
# Supabase ingest
# ================================

db_ingest: require_run
	cd python && . .venv/bin/activate && \
	AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.ingest_run $(RUN_ID)

# ================================
# Demo
# ================================
# demo: end to end run that generates artifacts and ingests a row to Supabase
# demo_new: same but generates RUN_ID automatically and prints it for dashboard usage

demo: require_run check_audit
	@set -euo pipefail; \
	echo "DEMO: RUN_ID=$(RUN_ID) AIGOV_MODE=$(AIGOV_MODE)"; \
	$(MAKE) run RUN_ID="$(RUN_ID)"; \
	$(MAKE) approve RUN_ID="$(RUN_ID)"; \
	$(MAKE) promote RUN_ID="$(RUN_ID)"; \
	$(MAKE) report_prepare RUN_ID="$(RUN_ID)"; \
	$(MAKE) db_ingest RUN_ID="$(RUN_ID)"; \
	echo "OK: demo completed RUN_ID=$(RUN_ID)"; \
	echo "Dashboard: /runs/$(RUN_ID)"

demo_new: check_audit
	@set -euo pipefail; \
	RUN_ID="$$(python3 -c 'import uuid; print(str(uuid.uuid4()))')"; \
	echo "DEMO: generated RUN_ID=$$RUN_ID AIGOV_MODE=$(AIGOV_MODE)"; \
	$(MAKE) run RUN_ID="$$RUN_ID"; \
	$(MAKE) approve RUN_ID="$$RUN_ID"; \
	$(MAKE) promote RUN_ID="$$RUN_ID"; \
	$(MAKE) report_prepare RUN_ID="$$RUN_ID"; \
	$(MAKE) db_ingest RUN_ID="$$RUN_ID"; \
	echo "OK: demo completed RUN_ID=$$RUN_ID"; \
	echo "Dashboard: /runs/$$RUN_ID"

# Train → approve → promote → report_prepare (evidence + report + bundle + verify_cli) → compliance summary (HTTP)
flow_full: require_run check_audit
	@set -euo pipefail; \
	echo "flow_full: RUN_ID=$(RUN_ID) AIGOV_MODE=$(AIGOV_MODE)"; \
	$(MAKE) run RUN_ID="$(RUN_ID)"; \
	$(MAKE) approve RUN_ID="$(RUN_ID)"; \
	$(MAKE) promote RUN_ID="$(RUN_ID)"; \
	$(MAKE) report_prepare RUN_ID="$(RUN_ID)"; \
	echo "GET $(AUDIT_URL)/compliance-summary?run_id=$(RUN_ID)"; \
	curl -fsS "$(AUDIT_URL)/compliance-summary?run_id=$(RUN_ID)"; echo

flow: flow_full

# Thin wrappers around Python scripts (core flow glue)
approve: require_run
	cd python && . .venv/bin/activate && \
		RUN_ID=$(RUN_ID) AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.approve

promote: require_run
	cd python && . .venv/bin/activate && \
		RUN_ID=$(RUN_ID) AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.promote

export_bundle: require_run ensure_dirs
	cd python && . .venv/bin/activate && \
		AIGOV_MODE=$(AIGOV_MODE) python -m aigov_py.export_bundle $(RUN_ID)

# ================================
# PR helpers
# ================================

pr_report:
	@set -euo pipefail; \
	RUN_ID="$$(python3 -c 'import uuid; print(str(uuid.uuid4()))')"; \
	echo "Generated RUN_ID=$$RUN_ID"; \
	$(MAKE) report_prepare RUN_ID="$$RUN_ID"

pr_report_commit: FORCE
	@set -euo pipefail; \
	BRANCH="$$(git rev-parse --abbrev-ref HEAD)"; \
	if [ "$$BRANCH" = "main" ]; then \
		echo "ERROR: do not run on main branch"; \
		exit 2; \
	fi; \
	if ! git diff --quiet || ! git diff --cached --quiet; then \
		echo "ERROR: working tree not clean. Commit or stash first."; \
		exit 2; \
	fi; \
	RUN_ID="$$(python3 -c 'import uuid; print(str(uuid.uuid4()))')"; \
	echo "Generated RUN_ID=$$RUN_ID"; \
	$(MAKE) report_prepare RUN_ID="$$RUN_ID"; \
	git add "docs/reports/$$RUN_ID.md"; \
	if git diff --cached --quiet; then \
		echo "ERROR: nothing staged (report not generated?)"; \
		exit 2; \
	fi; \
	git commit -m "docs: add audit report ($$RUN_ID)"; \
	git push
