.PHONY: \
	help \
	audit verify-log \
	approve evaluate promote \
	report-init report-fill \
	bundle verify-cli evidence-pack \
	flow

help:
	@echo "AIGov Compliance Engine"
	@echo ""
	@echo "Required: RUN_ID=<uuid>"
	@echo ""
	@echo "Core:"
	@echo "  make approve"
	@echo "  make evaluate"
	@echo "  make promote"
	@echo "  make report-init"
	@echo "  make report-fill"
	@echo "  make bundle"
	@echo "  make verify-cli"
	@echo "  make evidence-pack"
	@echo ""
	@echo "Or full pipeline:"
	@echo "  make flow RUN_ID=<uuid>"

###############################################################################
# guards
###############################################################################

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

###############################################################################
# python runner
###############################################################################

PY = cd python && . .venv/bin/activate &&

###############################################################################
# lifecycle
###############################################################################

approve: guard check-audit verify-log
	$(PY) RUN_ID=$(RUN_ID) python -m aigov_py.approve

evaluate: guard check-audit verify-log
	$(PY) RUN_ID=$(RUN_ID) python -m aigov_py.evaluate

promote: guard check-audit verify-log
	$(PY) RUN_ID=$(RUN_ID) python -m aigov_py.promote

###############################################################################
# reports
###############################################################################

report-init: guard
	$(PY) python -m aigov_py.report_init $(RUN_ID)

report-fill: guard
	$(PY) python -m aigov_py.report_fill $(RUN_ID)

###############################################################################
# audit + verify
###############################################################################

bundle: guard
	$(PY) python -m aigov_py.export_bundle $(RUN_ID)

verify-cli: guard
	$(PY) python -m aigov_py.verify $(RUN_ID)

###############################################################################
# pack
###############################################################################

evidence-pack: guard
	mkdir -p docs/reports docs/audit docs/packs docs/evidence docs/policy
	$(PY) RUN_ID=$(RUN_ID) python -m aigov_py.evidence_pack

###############################################################################
# full deterministic pipeline
###############################################################################

flow: guard \
	approve \
	evaluate \
	promote \
	report-init \
	bundle \
	report-fill \
	verify-cli \
	evidence-pack
	@echo ""
	@echo "AIGOV FLOW COMPLETED"
	@echo "RUN_ID=$(RUN_ID)"
