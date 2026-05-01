from __future__ import annotations

"""
Repository prevalence check (offline, illustrative).

This script encodes an illustrative, deterministic, manually curated snapshot of
repository-level booleans commonly discussed in governance literature (tests/CI versus
explicit decision-level artifacts). Signals are inferred from broadly observable public
patterns; the coding is not exhaustive or verified per release, and makes no statistical
claims. No network calls; no clones; reproducible offline.

has_model_centric_validation = model_validation_present OR ci_present
has_decision_level_auditability = (
    audit_evidence_trace_present
    AND explicit_approval_gate_present
    AND decision_record_present
    AND run_to_decision_traceability_present
)
auditability_gap_present = has_model_centric_validation AND NOT has_decision_level_auditability
"""

import csv
import json
import os
from dataclasses import asdict, dataclass
from typing import Iterable

# Exactly 30 real public repositories; fixed order for deterministic outputs.
CURATED_REPO_ROWS: tuple[dict[str, bool | str], ...] = (
    {
        "repo_name": "pytorch/pytorch",
        "repo_url": "https://github.com/pytorch/pytorch",
        "domain": "training_framework",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "tensorflow/tensorflow",
        "repo_url": "https://github.com/tensorflow/tensorflow",
        "domain": "training_framework",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "keras-team/keras",
        "repo_url": "https://github.com/keras-team/keras",
        "domain": "training_framework",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "huggingface/transformers",
        "repo_url": "https://github.com/huggingface/transformers",
        "domain": "model_library",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": True,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "huggingface/datasets",
        "repo_url": "https://github.com/huggingface/datasets",
        "domain": "data_tools",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "scikit-learn/scikit-learn",
        "repo_url": "https://github.com/scikit-learn/scikit-learn",
        "domain": "classical_ml",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "jax-ml/jax",
        "repo_url": "https://github.com/jax-ml/jax",
        "domain": "training_framework",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "pytorch/torchvision",
        "repo_url": "https://github.com/pytorch/vision",
        "domain": "model_library",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "dmlc/xgboost",
        "repo_url": "https://github.com/dmlc/xgboost",
        "domain": "classical_ml",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "catboost/catboost",
        "repo_url": "https://github.com/catboost/catboost",
        "domain": "classical_ml",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "lightning-ai/pytorch-lightning",
        "repo_url": "https://github.com/Lightning-AI/pytorch-lightning",
        "domain": "training_framework",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "microsoft/LightGBM",
        "repo_url": "https://github.com/microsoft/LightGBM",
        "domain": "classical_ml",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "onnx/onnx",
        "repo_url": "https://github.com/onnx/onnx",
        "domain": "interoperability",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "apache/tvm",
        "repo_url": "https://github.com/apache/tvm",
        "domain": "compiler_runtime",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "open-mmlab/mmdetection",
        "repo_url": "https://github.com/open-mmlab/mmdetection",
        "domain": "applied_cv",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "facebookresearch/fairseq",
        "repo_url": "https://github.com/facebookresearch/fairseq",
        "domain": "applied_nlp",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "allenai/allennlp",
        "repo_url": "https://github.com/allenai/allennlp",
        "domain": "applied_nlp",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "tensorflow/models",
        "repo_url": "https://github.com/tensorflow/models",
        "domain": "model_library",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "huggingface/evaluate",
        "repo_url": "https://github.com/huggingface/evaluate",
        "domain": "evaluation_tools",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "pytorch/audio",
        "repo_url": "https://github.com/pytorch/audio",
        "domain": "model_library",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "ray-project/ray",
        "repo_url": "https://github.com/ray-project/ray",
        "domain": "distributed_training_or_serving",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "apache/airflow",
        "repo_url": "https://github.com/apache/airflow",
        "domain": "workflow_orchestration",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "mlflow/mlflow",
        "repo_url": "https://github.com/mlflow/mlflow",
        "domain": "mlops_tracking",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": True,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "kubeflow/pipelines",
        "repo_url": "https://github.com/kubeflow/pipelines",
        "domain": "ml_workflow",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "dvc-org/dvc",
        "repo_url": "https://github.com/iterative/dvc",
        "domain": "data_version_control",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "wandb/wandb",
        "repo_url": "https://github.com/wandb/wandb",
        "domain": "experiment_tracking",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "optuna/optuna",
        "repo_url": "https://github.com/optuna/optuna",
        "domain": "hyperparameter_search",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "ludwig-ai/ludwig",
        "repo_url": "https://github.com/ludwig-ai/ludwig",
        "domain": "applied_automl",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "pytorch/text",
        "repo_url": "https://github.com/pytorch/text",
        "domain": "data_tools",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
    {
        "repo_name": "keras-team/keras-tuner",
        "repo_url": "https://github.com/keras-team/keras-tuner",
        "domain": "hyperparameter_search",
        "model_validation_present": True,
        "ci_present": True,
        "deployment_or_promotion_present": True,
        "audit_evidence_trace_present": False,
        "ai_discovery_or_inventory_present": False,
        "explicit_approval_gate_present": False,
        "decision_record_present": False,
        "run_to_decision_traceability_present": False,
    },
)


@dataclass(frozen=True)
class RepoSignals:
    repo_name: str
    repo_url: str
    domain: str
    model_validation_present: bool
    ci_present: bool
    deployment_or_promotion_present: bool
    audit_evidence_trace_present: bool
    ai_discovery_or_inventory_present: bool
    explicit_approval_gate_present: bool
    decision_record_present: bool
    run_to_decision_traceability_present: bool
    has_model_centric_validation: bool
    has_decision_level_auditability: bool
    auditability_gap_present: bool


def _compute_derived(row: dict[str, bool | str]) -> tuple[bool, bool, bool]:
    mv = bool(row["model_validation_present"])
    ci = bool(row["ci_present"])
    audit_ev = bool(row["audit_evidence_trace_present"])
    approval = bool(row["explicit_approval_gate_present"])
    decision_rec = bool(row["decision_record_present"])
    run_trace = bool(row["run_to_decision_traceability_present"])

    has_mc = mv or ci
    has_dla = audit_ev and approval and decision_rec and run_trace
    gap = has_mc and (not has_dla)
    return has_mc, has_dla, gap


def build_repos(rows: Iterable[dict[str, bool | str]]) -> list[RepoSignals]:
    out: list[RepoSignals] = []
    for r in rows:
        has_mc, has_dla, gap = _compute_derived(r)
        out.append(
            RepoSignals(
                repo_name=str(r["repo_name"]),
                repo_url=str(r["repo_url"]),
                domain=str(r["domain"]),
                model_validation_present=bool(r["model_validation_present"]),
                ci_present=bool(r["ci_present"]),
                deployment_or_promotion_present=bool(r["deployment_or_promotion_present"]),
                audit_evidence_trace_present=bool(r["audit_evidence_trace_present"]),
                ai_discovery_or_inventory_present=bool(r["ai_discovery_or_inventory_present"]),
                explicit_approval_gate_present=bool(r["explicit_approval_gate_present"]),
                decision_record_present=bool(r["decision_record_present"]),
                run_to_decision_traceability_present=bool(
                    r["run_to_decision_traceability_present"]
                ),
                has_model_centric_validation=has_mc,
                has_decision_level_auditability=has_dla,
                auditability_gap_present=gap,
            )
        )
    if len(out) != 30:
        raise RuntimeError(f"Expected 30 curated repositories, got {len(out)}")
    return out


def _count(repos: list[RepoSignals], pred) -> int:
    return sum(1 for r in repos if pred(r))


def compute_summary_metrics(repos: list[RepoSignals]) -> dict[str, float | int]:
    n = len(repos)
    if n == 0:
        raise RuntimeError("No repositories.")

    def rate(num: int) -> float:
        return num / n

    model_centric_count = _count(repos, lambda r: r.has_model_centric_validation)
    dla_count = _count(repos, lambda r: r.has_decision_level_auditability)
    gap_count = _count(repos, lambda r: r.auditability_gap_present)

    metrics: dict[str, float | int] = {
        "total_repositories": n,
        "model_centric_validation_count": model_centric_count,
        "model_centric_validation_rate": rate(model_centric_count),
        "decision_level_auditability_count": dla_count,
        "decision_level_auditability_rate": rate(dla_count),
        "auditability_gap_count": gap_count,
        "auditability_gap_rate": rate(gap_count),
        "approval_gate_count": _count(repos, lambda r: r.explicit_approval_gate_present),
        "approval_gate_rate": rate(_count(repos, lambda r: r.explicit_approval_gate_present)),
        "run_to_decision_traceability_count": _count(
            repos, lambda r: r.run_to_decision_traceability_present
        ),
        "run_to_decision_traceability_rate": rate(
            _count(repos, lambda r: r.run_to_decision_traceability_present)
        ),
        "audit_evidence_trace_count": _count(
            repos, lambda r: r.audit_evidence_trace_present
        ),
        "audit_evidence_trace_rate": rate(
            _count(repos, lambda r: r.audit_evidence_trace_present)
        ),
        "ai_discovery_or_inventory_count": _count(
            repos, lambda r: r.ai_discovery_or_inventory_present
        ),
        "ai_discovery_or_inventory_rate": rate(
            _count(repos, lambda r: r.ai_discovery_or_inventory_present)
        ),
    }
    return metrics


def write_repos_csv(path: str, repos: list[RepoSignals]) -> None:
    fieldnames = list(asdict(repos[0]).keys())
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for repo in repos:
            row = asdict(repo)
            for k in row:
                if isinstance(row[k], bool):
                    row[k] = str(row[k])
            writer.writerow(row)


def write_repos_json(path: str, repos: list[RepoSignals]) -> None:
    serialized = []
    for r in repos:
        d = asdict(r)
        serialized.append(d)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(serialized, handle, indent=2, sort_keys=True)


def write_summary_csv(path: str, metrics: dict[str, float | int]) -> None:
    ordered_keys = [
        "total_repositories",
        "model_centric_validation_count",
        "model_centric_validation_rate",
        "decision_level_auditability_count",
        "decision_level_auditability_rate",
        "auditability_gap_count",
        "auditability_gap_rate",
        "approval_gate_count",
        "approval_gate_rate",
        "run_to_decision_traceability_count",
        "run_to_decision_traceability_rate",
        "audit_evidence_trace_count",
        "audit_evidence_trace_rate",
        "ai_discovery_or_inventory_count",
        "ai_discovery_or_inventory_rate",
    ]
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["metric", "value"])
        writer.writeheader()
        for key in ordered_keys:
            val = metrics[key]
            if isinstance(val, float):
                value_str = f"{val:.17g}"
            else:
                value_str = str(val)
            writer.writerow({"metric": key, "value": value_str})


def write_latex_table(path: str, metrics: dict[str, float | int]) -> None:
    def tex_escape(s: str) -> str:
        return (
            s.replace("\\", "\\textbackslash{}")
            .replace("_", "\\_")
            .replace("%", "\\%")
            .replace("&", "\\&")
        )

    total = int(metrics["total_repositories"])

    rows_spec: list[tuple[str, int]] = (
        ("Model-centric validation present", int(metrics["model_centric_validation_count"])),
        (
            "Decision-level auditability present",
            int(metrics["decision_level_auditability_count"]),
        ),
        ("Auditability gap present", int(metrics["auditability_gap_count"])),
        ("Audit evidence trace present", int(metrics["audit_evidence_trace_count"])),
        (
            "AI discovery or inventory present",
            int(metrics["ai_discovery_or_inventory_count"]),
        ),
        ("Explicit approval gate present", int(metrics["approval_gate_count"])),
        (
            "Run-to-decision traceability present",
            int(metrics["run_to_decision_traceability_count"]),
        ),
    )

    lines: list[str] = []
    lines.append("\\begin{tabular}{lrr}")
    lines.append("\\toprule")
    lines.append("Signal & Repositories & Rate \\\\")
    lines.append("\\midrule")

    for label, count in rows_spec:
        rate = count / total if total else 0.0
        lines.append(f"{tex_escape(label)} & {count} & {rate:.3f} \\\\")

    lines.append("\\bottomrule")
    lines.append("\\end{tabular}")
    lines.append("")

    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main() -> None:
    repos = build_repos(CURATED_REPO_ROWS)
    metrics = compute_summary_metrics(repos)

    out_dir = os.path.join("experiments", "output")
    os.makedirs(out_dir, exist_ok=True)

    repos_csv = os.path.join(out_dir, "repository_prevalence_repos.csv")
    repos_json = os.path.join(out_dir, "repository_prevalence_repos.json")
    summary_csv = os.path.join(out_dir, "repository_prevalence_summary.csv")
    table_tex = os.path.join(out_dir, "repository_prevalence_table.tex")

    write_repos_csv(repos_csv, repos)
    write_repos_json(repos_json, repos)
    write_summary_csv(summary_csv, metrics)
    write_latex_table(table_tex, metrics)

    print("Wrote outputs:")
    print(f"- {repos_csv}")
    print(f"- {repos_json}")
    print(f"- {summary_csv}")
    print(f"- {table_tex}")
    print("")
    print("Summary:")
    print(f"- total_repositories={int(metrics['total_repositories'])}")
    print(
        f"- model_centric_validation_rate={float(metrics['model_centric_validation_rate']):.3f}"
    )
    print(
        f"- decision_level_auditability_rate="
        f"{float(metrics['decision_level_auditability_rate']):.3f}"
    )
    print(f"- auditability_gap_rate={float(metrics['auditability_gap_rate']):.3f}")


if __name__ == "__main__":
    main()
