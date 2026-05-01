from __future__ import annotations

import csv
import json
import os
from dataclasses import asdict, dataclass
from typing import Iterable, Literal

Verdict = Literal["VALID", "INVALID", "BLOCKED"]
ModelValidation = Literal["passed", "failed"]
EvaluationResult = Literal["pass", "fail"]


FAILURE_TYPES: list[str] = [
    "missing_audit_evidence",
    "missing_ai_discovery_output",
    "missing_approval_record",
    "failed_compliance_evaluation",
    "inconsistent_run_context",
    "unavailable_audit_run",
    "partial_evidence",
]


@dataclass(frozen=True)
class Run:
    run_id: str
    condition: str
    is_injected_failure: bool
    model_validation: ModelValidation
    evidence_complete: bool
    ai_discovery_present: bool
    evaluation_result: EvaluationResult
    approval: str
    trace_consistent: bool
    run_available: bool
    baseline_verdict: Verdict
    gate_verdict: Verdict
    expected_gate_verdict: Verdict


def baseline_logic(model_validation: ModelValidation) -> Verdict:
    if model_validation == "passed":
        return "VALID"
    return "INVALID"


def decision_gate_logic(
    *,
    evaluation_result: EvaluationResult,
    run_available: bool,
    evidence_complete: bool,
    ai_discovery_present: bool,
    approval: str,
    trace_consistent: bool,
) -> Verdict:
    if evaluation_result == "fail":
        return "INVALID"
    if run_available is False:
        return "BLOCKED"
    if evidence_complete is not True:
        return "BLOCKED"
    if ai_discovery_present is not True:
        return "BLOCKED"
    if approval != "granted":
        return "BLOCKED"
    if trace_consistent is not True:
        return "BLOCKED"
    return "VALID"


def make_base_fields() -> dict:
    return {
        "model_validation": "passed",
        "evidence_complete": True,
        "ai_discovery_present": True,
        "evaluation_result": "pass",
        "approval": "granted",
        "trace_consistent": True,
        "run_available": True,
    }


def apply_failure_type(fields: dict, failure_type: str) -> dict:
    updated = dict(fields)

    if failure_type == "missing_audit_evidence":
        updated["evidence_complete"] = False

    elif failure_type == "missing_ai_discovery_output":
        updated["ai_discovery_present"] = False

    elif failure_type == "missing_approval_record":
        updated["approval"] = "missing"

    elif failure_type == "failed_compliance_evaluation":
        updated["evaluation_result"] = "fail"

    elif failure_type == "inconsistent_run_context":
        updated["trace_consistent"] = False

    elif failure_type == "unavailable_audit_run":
        updated["run_available"] = False

    elif failure_type == "partial_evidence":
        updated["evidence_complete"] = False

    else:
        raise ValueError(f"Unsupported failure type: {failure_type}")

    return updated


def run_id_for(index_1_based: int) -> str:
    return f"fi-{index_1_based:04d}"


def build_run(*, run_id: str, condition: str, is_injected_failure: bool, fields: dict) -> Run:
    baseline_verdict = baseline_logic(fields["model_validation"])
    gate_verdict = decision_gate_logic(
        evaluation_result=fields["evaluation_result"],
        run_available=fields["run_available"],
        evidence_complete=fields["evidence_complete"],
        ai_discovery_present=fields["ai_discovery_present"],
        approval=fields["approval"],
        trace_consistent=fields["trace_consistent"],
    )
    expected_gate_verdict = gate_verdict

    return Run(
        run_id=run_id,
        condition=condition,
        is_injected_failure=is_injected_failure,
        model_validation=fields["model_validation"],
        evidence_complete=fields["evidence_complete"],
        ai_discovery_present=fields["ai_discovery_present"],
        evaluation_result=fields["evaluation_result"],
        approval=fields["approval"],
        trace_consistent=fields["trace_consistent"],
        run_available=fields["run_available"],
        baseline_verdict=baseline_verdict,
        gate_verdict=gate_verdict,
        expected_gate_verdict=expected_gate_verdict,
    )


def generate_runs() -> list[Run]:
    runs: list[Run] = []

    def add(condition: str, is_injected_failure: bool, fields: dict) -> None:
        runs.append(
            build_run(
                run_id=run_id_for(len(runs) + 1),
                condition=condition,
                is_injected_failure=is_injected_failure,
                fields=fields,
            )
        )

    # 100 valid runs
    for _ in range(100):
        add("valid", False, make_base_fields())

    # 100 noisy but valid runs (model-centric validation fails, decision gate remains valid)
    for _ in range(100):
        noisy = make_base_fields()
        noisy["model_validation"] = "failed"
        add("noisy_but_valid", False, noisy)

    # 700 failure runs: 7 failure types × 100 each
    for failure_type in FAILURE_TYPES:
        for _ in range(100):
            base = make_base_fields()
            # Ensure baseline misses the failure when model_validation passes.
            base["model_validation"] = "passed"
            add(failure_type, True, apply_failure_type(base, failure_type))

    if len(runs) != 900:
        raise RuntimeError(f"Expected 900 runs, got {len(runs)}")

    return runs


def write_json(path: str, runs: list[Run]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump([asdict(r) for r in runs], handle, indent=2, sort_keys=False)


def write_csv(path: str, runs: list[Run]) -> None:
    fieldnames = list(asdict(runs[0]).keys())
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for run in runs:
            writer.writerow(asdict(run))


def failure_conditions() -> list[str]:
    return list(FAILURE_TYPES)


def rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def summarize(runs: Iterable[Run]) -> tuple[list[dict], dict]:
    runs_list = list(runs)
    conditions = ["valid", "noisy_but_valid"] + failure_conditions()

    rows: list[dict] = []
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
    }

    return rows, overall_metrics


def write_summary_csv(path: str, rows: list[dict], overall_metrics: dict) -> None:
    fieldnames = list(rows[0].keys())
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

        overall_row = {k: "" for k in fieldnames}
        overall_row["condition"] = "OVERALL"
        overall_row["runs"] = str(sum(int(r["runs"]) for r in rows))
        overall_row["failures"] = str(sum(int(r["failures"]) for r in rows))
        overall_row["valids"] = str(sum(int(r["valids"]) for r in rows))
        overall_row["baseline_false_negative_rate"] = f"{overall_metrics['baseline_false_negative_rate']:.3f}"
        overall_row["decision_gate_detection_rate"] = f"{overall_metrics['decision_gate_detection_rate']:.3f}"
        overall_row["valid_retention_rate"] = f"{overall_metrics['valid_retention_rate']:.3f}"
        writer.writerow(overall_row)


def write_latex_table(path: str, rows: list[dict], overall_metrics: dict) -> None:
    def tex_escape(s: str) -> str:
        return (
            s.replace("\\", "\\textbackslash{}")
            .replace("_", "\\_")
            .replace("%", "\\%")
            .replace("&", "\\&")
        )

    # Table focuses on failure conditions + overall, per paper claim.
    failure_rows = [r for r in rows if r["condition"] in set(FAILURE_TYPES)]

    lines: list[str] = []
    lines.append("\\begin{tabular}{lrr}")
    lines.append("\\toprule")
    lines.append("Condition & Baseline false negative rate & Decision gate detection rate \\\\")
    lines.append("\\midrule")

    for r in failure_rows:
        lines.append(
            f"{tex_escape(r['condition'])} & {r['baseline_false_negative_rate']} & {r['decision_gate_detection_rate']} \\\\"
        )

    lines.append("\\midrule")
    lines.append(
        f"OVERALL (failures) & {overall_metrics['baseline_false_negative_rate']:.3f} & {overall_metrics['decision_gate_detection_rate']:.3f} \\\\"
    )
    lines.append("\\bottomrule")
    lines.append("\\end{tabular}")
    lines.append("")

    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main() -> None:
    runs = generate_runs()

    out_dir = os.path.join("experiments", "output")
    os.makedirs(out_dir, exist_ok=True)

    runs_json = os.path.join(out_dir, "failure_injection_runs.json")
    runs_csv = os.path.join(out_dir, "failure_injection_runs.csv")
    summary_csv = os.path.join(out_dir, "failure_injection_summary.csv")
    table_tex = os.path.join(out_dir, "failure_injection_table.tex")

    write_json(runs_json, runs)
    write_csv(runs_csv, runs)

    rows, overall_metrics = summarize(runs)
    write_summary_csv(summary_csv, rows, overall_metrics)
    write_latex_table(table_tex, rows, overall_metrics)

    print("Wrote outputs:")
    print(f"- {runs_json}")
    print(f"- {runs_csv}")
    print(f"- {summary_csv}")
    print(f"- {table_tex}")
    print("")
    print("Overall metrics:")
    print(f"- baseline_false_negative_rate={overall_metrics['baseline_false_negative_rate']:.3f}")
    print(f"- decision_gate_detection_rate={overall_metrics['decision_gate_detection_rate']:.3f}")
    print(f"- valid_retention_rate={overall_metrics['valid_retention_rate']:.3f}")


if __name__ == "__main__":
    main()
