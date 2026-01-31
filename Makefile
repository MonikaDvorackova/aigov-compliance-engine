.PHONY: audit run verify status bundle approve promote demo verify-log report

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

bundle:
	@if [ -z "$(RUN_ID)" ]; then echo "Usage: make bundle RUN_ID=<run_id>"; exit 2; fi
	cd python && . .venv/bin/activate && python -m aigov_py.export_bundle $(RUN_ID)

approve:
	@if [ -z "$(RUN_ID)" ]; then echo "Usage: RUN_ID=<run_id> make approve"; exit 2; fi
	cd python && . .venv/bin/activate && RUN_ID=$(RUN_ID) python -m aigov_py.approve

promote:
	@if [ -z "$(RUN_ID)" ]; then echo "Usage: RUN_ID=<run_id> make promote"; exit 2; fi
	cd python && . .venv/bin/activate && RUN_ID=$(RUN_ID) python -m aigov_py.promote

demo:
	@if [ -z "$(RUN_ID)" ]; then echo "Usage: RUN_ID=<run_id> make demo"; exit 2; fi
	cd python && . .venv/bin/activate && RUN_ID=$(RUN_ID) python -m aigov_py.demo

report:
	@if [ -z "$(RUN_ID)" ]; then echo "Usage: RUN_ID=<run_id> make report"; exit 2; fi
	cd python && . .venv/bin/activate && RUN_ID=$(RUN_ID) python -m aigov_py.report
