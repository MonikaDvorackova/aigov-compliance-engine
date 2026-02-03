.PHONY: audit run verify verify-cli status bundle approve evaluate promote demo verify-log \
        report-template require-run evidence-pack audit-object new-run ensure-dirs \
        check-audit flow report-fill report-init

audit:
	cd rust && cargo run

run:
	cd python && . .venv/bin/activate && python -m aigov_py.pipeline_train

verify:
	curl -sS http://127.0.0.1:8088/verify ; echo

verify-log:
	curl -sS http://127.0.0.1:8088/verify-log ; echo

status:
	curl -sS http://127.0.0.1:8088/status ; echo

verify-cli: require-run
	cd python && . .venv/bin/activate && \
	python -m aigov_py.verify $(RUN_ID)

require-run:
	@if [ -z "$(RUN_ID)" ]; then \
		echo "RUN_ID is required. Usage: RUN_ID=<run_id> make <target>"; \
		exit 2; \
	fi

ensure-dirs:
	@mkdir -p docs/reports
	@mkdir -p docs/audit
	@mkdir -p docs/packs
	@mkdir -p docs/evidence
	@mkdir -p docs/policy

new-run:
	@python3 -c 'import uuid; print(str(uuid.uuid4()))'

check-audit:
	@curl -sS http://127.0.0.1:8088/status >/dev/null || ( \
		echo "Audit service not reachable on http://127.0.0.1:8088"; \
		echo "Start it with: make audit"; \
		exit 2; \
	)

bundle: require-run
	cd python && . .venv/bin/activate && \
	python -m aigov_py.export_bundle $(RUN_ID)

approve: require-run check-audit
	@$(MAKE) verify-log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.approve

evaluate: require-run check-audit
	@$(MAKE) verify-log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.evaluate

promote: require-run check-audit
	@$(MAKE) verify-log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.promote

report-init: require-run
	cd python && . .venv/bin/activate && \
	python -m aigov_py.report_init $(RUN_ID)

report-fill: require-run
	cd python && . .venv/bin/activate && \
	python -m aigov_py.report_fill $(RUN_ID)

evidence-pack: require-run ensure-dirs
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.evidence_pack

demo: require-run
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.demo

report-template: require-run ensure-dirs
	@echo "run_id=$(RUN_ID)" > docs/reports/$(RUN_ID).md
	@echo "bundle_sha256=" >> docs/reports/$(RUN_ID).md
	@echo "policy_version=" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "# Audit report for run \`$(RUN_ID)\`" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "saved docs/reports/$(RUN_ID).md"

flow: require-run
	$(MAKE) approve RUN_ID=$(RUN_ID)
	$(MAKE) evaluate RUN_ID=$(RUN_ID)
	$(MAKE) promote RUN_ID=$(RUN_ID)
	$(MAKE) report-init RUN_ID=$(RUN_ID)
	$(MAKE) report-fill RUN_ID=$(RUN_ID)
	$(MAKE) bundle RUN_ID=$(RUN_ID)
	$(MAKE) verify-cli RUN_ID=$(RUN_ID)
