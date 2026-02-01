.PHONY: audit run verify status bundle approve promote demo verify-log report report-template require-run full evidence-pack audit-object new-run ensure-dirs

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
# Guards and dirs
# =========================================================

require-run:
	@if [ -z "$(RUN_ID)" ]; then \
		echo "RUN_ID is required. Usage: RUN_ID=<run_id> make <target>"; \
		exit 2; \
	fi

ensure-dirs:
	@mkdir -p docs/reports
	@mkdir -p docs/audit
	@mkdir -p docs/packs

# Prints a new UUID (lowercase) you can copy into RUN_ID
new-run:
	@python3 -c 'import uuid; print(str(uuid.uuid4()))'


# =========================================================
# Compliance steps
# =========================================================

bundle: require-run
	cd python && . .venv/bin/activate && \
	python -m aigov_py.export_bundle $(RUN_ID)

approve: require-run verify-log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.approve

promote: require-run verify-log
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.promote

demo: require-run
	cd python && . .venv/bin/activate && \
	RUN_ID=$(RUN_ID) python -m aigov_py.demo


# =========================================================
# Report and audit object materialization (CI compatible paths)
# =========================================================
# Your python modules may currently write elsewhere. We run them and then
# normalize outputs into:
# - docs/reports/<run_id>.md
# - docs/audit/<run_id>.json
#
# Assumptions (based on your earlier output):
# - report module writes a report file (or prints) somewhere OR you have a template
# - audit_object module writes: docs/audit/<run_id>.json OR docs/evidence/<run_id>.json
# If the module already writes to the target location, the copy is a no-op.

report-template: require-run ensure-dirs
	@echo "run_id=$(RUN_ID)" > docs/reports/$(RUN_ID).md
	@echo "bundle_sha256=" >> docs/reports/$(RUN_ID).md
	@echo "policy_version=" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "# Audit report for run \`$(RUN_ID)\`" >> docs/reports/$(RUN_ID).md
	@echo "" >> docs/reports/$(RUN_ID).md
	@echo "Fill in the required header fields above and append narrative sections as needed." >> docs/reports/$(RUN_ID).md
	@echo "saved docs/reports/$(RUN_ID).md"

report: require-run ensure-dirs
	@set -e; \
	cd python && . .venv/bin/activate && RUN_ID=$(RUN_ID) python -m aigov_py.report; \
	if [ -f "docs/reports/$(RUN_ID).md" ]; then \
		echo "report OK: docs/reports/$(RUN_ID).md"; \
		exit 0; \
	fi; \
	if [ -f "docs/reports/$(RUN_ID).txt" ]; then \
		mv "docs/reports/$(RUN_ID).txt" "docs/reports/$(RUN_ID).md"; \
		echo "normalized report .txt -> .md: docs/reports/$(RUN_ID).md"; \
		exit 0; \
	fi; \
	echo "report module did not materialize docs/reports/$(RUN_ID).md"; \
	echo "Run: RUN_ID=$(RUN_ID) make report-template and fill bundle_sha256/policy_version."; \
	exit 2

audit-object: require-run ensure-dirs
	@set -e; \
	cd python && . .venv/bin/activate && RUN_ID=$(RUN_ID) python -m aigov_py.audit_object; \
	if [ -f "docs/audit/$(RUN_ID).json" ]; then \
		echo "audit object OK: docs/audit/$(RUN_ID).json"; \
		exit 0; \
	fi; \
	if [ -f "docs/evidence/$(RUN_ID).json" ]; then \
		cp "docs/evidence/$(RUN_ID).json" "docs/audit/$(RUN_ID).json"; \
		echo "copied docs/evidence/$(RUN_ID).json -> docs/audit/$(RUN_ID).json"; \
		exit 0; \
	fi; \
	if [ -f "docs/evidence/$(RUN_ID).audit.json" ]; then \
		cp "docs/evidence/$(RUN_ID).audit.json" "docs/audit/$(RUN_ID).json"; \
		echo "copied docs/evidence/$(RUN_ID).audit.json -> docs/audit/$(RUN_ID).json"; \
		exit 0; \
	fi; \
	echo "audit_object did not produce docs/audit/$(RUN_ID).json"; \
	echo "Expected either docs/audit/$(RUN_ID).json or docs/evidence/$(RUN_ID).json"; \
	exit 2


# =========================================================
# Evidence pack (CI compatible path)
# =========================================================

evidence-pack: require-run ensure-dirs
	@set -e; \
	cd python && . .venv/bin/activate && RUN_ID=$(RUN_ID) python -m aigov_py.evidence_pack; \
	if [ -f "docs/packs/$(RUN_ID).zip" ]; then \
		echo "evidence pack OK: docs/packs/$(RUN_ID).zip"; \
		exit 0; \
	fi; \
	if [ -f "docs/evidence/$(RUN_ID).zip" ]; then \
		cp "docs/evidence/$(RUN_ID).zip" "docs/packs/$(RUN_ID).zip"; \
		ec
