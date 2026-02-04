SHELL := /bin/bash

.PHONY: \
	audit audit_bg audit_stop audit_restart audit_logs \
	status verify verify_log \
	run \
	require_run ensure_dirs new_run \
	check_audit \
	approve evaluate promote \
	report_template report_init report_fill \
	bundle verify_cli evidence_pack \
	emit_event \
	flow flow_full \
	pr_prepare gate

AUDIT_URL ?= http://127.0.0.1:8088
AUDIT_PORT ?= 8088

AUDIT_PIDFILE ?= .aigov_audit.pid
AUDIT_LOG ?= .aigov_audit.log

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

run:
	cd python && . .venv/bin/activate && python -m aigov_py.pipeline_train

require_run:
	@if [ -z "$(RUN_ID)" ]; then \
		echo "RUN_ID is required. Usage: RUN_ID=<run_id> make <target>"; \
		exit 2; \
	fi

ensure_dirs:
	@mkdir -p docs/reports docs/audit docs/audit_meta docs/packs docs/evidence docs/policy

new_run:
	@python3 -c 'import uuid; print(str(uuid.uuid4()))'

check_audit:
	@curl -fsS --max-time 1 $(AUDIT_URL)/status >/dev/null 2>&1 || ( \
		echo "Audit service not reachable on $(AUDIT_URL)"; \
		echo "Start it with: make audit_bg"; \
		exit 2; \
	)

approve: require_run check_audit
	@$(MAKE) verify_log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.approve

evaluate: require_run check_audit
	@$(MAKE) verify_log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) \
	AIGOV_EVAL_METRIC=$${AIGOV_EVAL_METRIC:-f1} \
	AIGOV_EVAL_VALUE=$${AIGOV_EVAL_VALUE:-} \
	AIGOV_EVAL_THRESHOLD=$${AIGOV_EVAL_THRESHOLD:-0.85} \
	python -m aigov_py.evaluate

promote: require_run check_audit
	@$(MAKE) verify_log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.promote

report_template: require_run ensure_dirs
	@echo "run_id=$(RUN_ID)" > docs/reports/$(RUN_ID).md
	@echo "bundle_sha256=" >> docs/reports/$(RUN_ID).md
	@echo "policy_version=" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "# Audit report for run \`$(RUN_ID)\`" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "saved docs/reports/$(RUN_ID).md"

report_init: require_run ensure_dirs
	cd python && . .venv/bin/activate && \
	python -m aigov_py.report_init $(RUN_ID)

bundle: require_run ensure_dirs
	cd python && . .venv/bin/activate && \
	python -m aigov_py.export_bundle $(RUN_ID)

report_fill: require_run ensure_dirs
	cd python && . .venv/bin/activate && \
	python -m aigov_py.report_fill $(RUN_ID)

verify_cli: require_run
	cd python && . .venv/bin/activate && \
	python -m aigov_py.verify $(RUN_ID)

evidence_pack: require_run ensure_dirs
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.evidence_pack

emit_event: require_run check_audit
	@if [ -z "$(EVENT_TYPE)" ]; then \
		echo "EVENT_TYPE is required. Example:"; \
		echo "  make emit_event RUN_ID=<id> EVENT_TYPE=demo PAYLOAD='\{\"hello\":\"world\"\}'"; \
		exit 2; \
	fi
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.emit_event $(EVENT_TYPE) --system "aigov_make" --payload '$(PAYLOAD)'

flow: flow_full

flow_full: require_run
	@echo "Running full AIGov flow for RUN_ID=$(RUN_ID)"
	$(MAKE) approve RUN_ID=$(RUN_ID)
	$(MAKE) evaluate RUN_ID=$(RUN_ID) AIGOV_EVAL_VALUE=$${AIGOV_EVAL_VALUE:-1.0}
	$(MAKE) promote RUN_ID=$(RUN_ID)
	$(MAKE) report_template RUN_ID=$(RUN_ID)
	$(MAKE) bundle RUN_ID=$(RUN_ID)
	$(MAKE) report_fill RUN_ID=$(RUN_ID)
	$(MAKE) bundle RUN_ID=$(RUN_ID)
	$(MAKE) verify_cli RUN_ID=$(RUN_ID)
	$(MAKE) evidence_pack RUN_ID=$(RUN_ID)
	@echo "AIGov flow complete for RUN_ID=$(RUN_ID)"

pr_prepare:
	@bash scripts/aigov_pr_prepare.sh

gate:
	@rg -n "^(<<<<<<<|=======|>>>>>>>)" -S . || true
	cd python && . .venv/bin/activate && python -m compileall aigov_py
	cd rust && cargo check
