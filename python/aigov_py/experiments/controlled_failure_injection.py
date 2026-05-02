from __future__ import annotations

import csv
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Iterable

from aigov_py.experiments.gate_model import (
    FAILURE_TAXONOMY,
    RunRecord,
    apply_failure_type,
    build_run,
    make_base_fields,
    run_id_for_cfi,
)


def failure_taxonomy() -> list[str]:
    return list(FAILURE_TAXONOMY)


def generate_runs() -> list[RunRecord]:
    runs: list[RunRecord] = []

    def add(condition: str, is_injected_failure: bool, fields: dict[str, object]) -> None:
        runs.append(
            build_run(
                run_id=run_id_for_cfi(len(runs) + 1),
                condition=condition,
                is_injected_failure=is_injected_failure,
                fields=fields,
            )
        )

    for _ in range(100):
        add("valid", False, make_base_fields())

    for _ in range(100):
        noisy = make_base_fields()
        noisy["model_validation"] = "failed"
        add("noisy_but_valid", False, noisy)

    for failure_type in FAILURE_TAXONOMY:
        for _ in range(100):
            base = make_base_fields()
            base["model_validation"] = "passed"
            add(failure_type, True, apply_failure_type(base, failure_type))

    if len(runs) != 900:
        raise RuntimeError(f"Expected 900 runs, got {len(runs)}")

    return runs


def rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def compute_overall_extra_metrics(runs_list: list[RunRecord]) -> dict[str, float]:
    injected = [r for r in runs_list if r.is_injected_failure]
    n_inj = len(injected)

    abv_fail = sum(1 for r in injected if r.artifact_bound_verification is not True)
    digest_mismatch_runs = [
        r
        for r in injected
        if (r.events_content_sha256_match is not True) or (r.export_digest_match is not True)
    ]
    digest_detected = sum(
        1 for r in digest_mismatch_runs if r.gate_verdict in {"BLOCKED", "INVALID"}
    )

    return {
        "artifact_bound_verification_failure_rate": rate(abv_fail, n_inj),
        "digest_mismatch_detection_rate": rate(digest_detected, len(digest_mismatch_runs)),
    }


def summarize(runs: Iterable[RunRecord]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    runs_list = list(runs)
    conditions = ["valid", "noisy_but_valid"] + failure_taxonomy()

    extra = compute_overall_extra_metrics(runs_list)

    rows: list[dict[str, Any]] = []
    overall = {
        "total_runs": len(runs_list),
        "total_failures": 0,
        "baseline_false_negatives": 0,
        "decision_gate_detections": 0,
        "total_valid": 0,
        "gate_valid_on_valid": 0,
    }

    for condition in conditions:
        subset = [r for r in runs_list if r.condition == condition]
        failures = [r for r in subset if r.is_injected_failure]
        valids = [r for r in subset if not r.is_injected_failure]

        baseline_fn = sum(1 for r in failures if r.baseline_verdict == "VALID")
        gate_detect = sum(1 for r in failures if r.gate_verdict in {"BLOCKED", "INVALID"})
        gate_valid_on_valid = sum(1 for r in valids if r.gate_verdict == "VALID")

        abv_fn = sum(1 for r in failures if r.artifact_bound_verification is not True)
        digest_subset = [
            r
            for r in failures
            if (r.events_content_sha256_match is not True) or (r.export_digest_match is not True)
        ]
        digest_detected = sum(
            1 for r in digest_subset if r.gate_verdict in {"BLOCKED", "INVALID"}
        )

        row = {
            "condition": condition,
            "runs": len(subset),
            "failures": len(failures),
            "valids": len(valids),
            "baseline_valid": sum(1 for r in subset if r.baseline_verdict == "VALID"),
            "baseline_invalid": sum(1 for r in subset if r.baseline_verdict == "INVALID"),
            "gate_valid": sum(1 for r in subset if r.gate_verdict == "VALID"),
            "gate_blocked": sum(1 for r in subset if r.gate_verdict == "BLOCKED"),
            "gate_invalid": sum(1 for r in subset if r.gate_verdict == "INVALID"),
            "baseline_false_negatives": baseline_fn,
            "decision_gate_detections": gate_detect,
            "baseline_false_negative_rate": f"{rate(baseline_fn, len(failures)):.3f}",
            "decision_gate_detection_rate": f"{rate(gate_detect, len(failures)):.3f}",
            "valid_retention_rate": f"{rate(gate_valid_on_valid, len(valids)):.3f}",
            "artifact_bound_verification_failure_rate": f"{rate(abv_fn, len(failures)):.3f}",
            "digest_mismatch_detection_rate": f"{rate(digest_detected, len(digest_subset)):.3f}",
        }
        rows.append(row)

        overall["total_failures"] += len(failures)
        overall["baseline_false_negatives"] += baseline_fn
        overall["decision_gate_detections"] += gate_detect
        overall["total_valid"] += len(valids)
        overall["gate_valid_on_valid"] += gate_valid_on_valid

    overall_metrics = {
        "baseline_false_negative_rate": rate(
            overall["baseline_false_negatives"], overall["total_failures"]
        ),
        "decision_gate_detection_rate": rate(
            overall["decision_gate_detections"], overall["total_failures"]
        ),
        "valid_retention_rate": rate(overall["gate_valid_on_valid"], overall["total_valid"]),
        "artifact_bound_verification_failure_rate": extra["artifact_bound_verification_failure_rate"],
        "digest_mismatch_detection_rate": extra["digest_mismatch_detection_rate"],
        "failure_taxonomy": list(FAILURE_TAXONOMY),
        "total_runs": overall["total_runs"],
    }

    return rows, overall_metrics


def write_outputs(out_dir: Path, *, runs: list[RunRecord] | None = None) -> dict[str, str]:
    out_dir = out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if runs is None:
        runs = generate_runs()

    rows, overall_metrics = summarize(runs)
    by_condition = {r["condition"]: r for r in rows}

    minimal_runs: list[dict[str, str]] = []
    for r in runs:
        minimal_runs.append(
            {
                "run_id": r.run_id,
                "condition": r.condition,
                "expected_label": r.expected_gate_verdict,
                "gate_label": r.gate_verdict,
            }
        )

    summary_obj = {
        "by_condition": by_condition,
        "overall": overall_metrics,
        "condition_tables": rows,
    }

    payload = {
        "runs": [asdict(r) for r in runs],
        "summary": summary_obj,
    }

    json_path = out_dir / "controlled_failure_injection.json"
    csv_path = out_dir / "controlled_failure_injection.csv"
    full_csv_path = out_dir / "controlled_failure_injection_full.csv"

    with open(json_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)

    with open(csv_path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["run_id", "condition", "expected_label", "gate_label"]
        )
        writer.writeheader()
        writer.writerows(minimal_runs)

    if runs:
        fieldnames = list(asdict(runs[0]).keys())
        with open(full_csv_path, "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for run in runs:
                writer.writerow(asdict(run))

    return {
        "json": str(json_path),
        "csv": str(csv_path),
        "csv_full": str(full_csv_path),
    }


def main_cli(output: Path) -> int:
    paths = write_outputs(output)
    print("Wrote:")
    for _k, v in paths.items():
        print(f"  - {v}")
    return 0
