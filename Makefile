.PHONY: audit run verify status bundle approve promote demo verify-log report require-run full

# =========================================================
# Core runtime
# =========================================================

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


# =========================================================
# Guards
# =========================================================

require-run:
	@if [ -z "$(RUN_ID)" ]; then \
		echo "RUN_ID is required. Usage: RUN_ID=<run_id> make <target>"; \
		exit 2; \
	fi


# =========================================================
# Compliance steps
# =========================================================

bundle: require-run
	cd python && . .venv/bin/activate && \
	python -m aigov_py.export_bundle $(RUN_ID)

approve: require-run verify-log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.approve

report: require-run
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.report
	report-template: require-run
	@mkdir -p docs/reports
	@echo "run_id=$(RUN_ID)" > docs/reports/$(RUN_ID).md
	@echo "bundle_sha256=" >> docs/reports/$(RUN_ID).md
	@echo "policy_version=" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "# Audit report for run \`$(RUN_ID)\`" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "Fill in the required header fields above and append narrative sections as needed." >> docs/reports/$(RUN_ID).md
	@echo "saved docs/reports/$(RUN_ID).md"

promote: require-run approve report bundle verify-log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.promote

demo: require-run
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.demo


# =========================================================
# One button compliance
# =========================================================

full: run verify
	@echo ""
	@echo "Pipeline finished"
	@echo "Now run"
	@echo "RUN_ID=<run_id> make promote"
	@echo ""
