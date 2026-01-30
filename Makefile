.PHONY: audit run verify bundle status

audit:
	cd rust && cargo run

run:
	cd python && . .venv/bin/activate && python -m aigov_py.pipeline_train

verify:
	curl -sS http://127.0.0.1:8088/verify

status:
	curl -sS http://127.0.0.1:8088/status

bundle:
	@if [ -z "$(RUN_ID)" ]; then echo "Usage: make bundle RUN_ID=<run_id>"; exit 2; fi
	cd python && . .venv/bin/activate && python -m aigov_py.export_bundle $(RUN_ID)
