import os
import uuid
import hashlib

from joblib import dump
from sklearn.datasets import load_iris
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

from aigov_py.emit_evidence import emit


EVIDENCE_ENDPOINT = os.getenv("AIGOV_EVIDENCE_ENDPOINT", "http://127.0.0.1:8088/evidence")


def fingerprint_iris(x, y) -> str:
    h = hashlib.sha256()
    h.update(str(x.shape).encode("utf-8"))
    h.update(str(y.shape).encode("utf-8"))
    h.update(x[:5].tobytes())
    h.update(y[:20].tobytes())
    return h.hexdigest()


def main() -> None:
    run_id = str(uuid.uuid4())
    actor = os.getenv("AIGOV_ACTOR", "monika")
    system = os.getenv("AIGOV_SYSTEM", "aigov_poc")

    emit(EVIDENCE_ENDPOINT, "run_started", actor, system, run_id, {"purpose": "poc_train"})

    data = load_iris()
    ds_fp = fingerprint_iris(data.data, data.target)

    emit(
        EVIDENCE_ENDPOINT,
        "data_registered",
        actor,
        system,
        run_id,
        {
            "dataset": "iris",
            "dataset_fingerprint": ds_fp,
            "n_rows": int(data.data.shape[0]),
            "n_features": int(data.data.shape[1]),
            "target_names": list(getattr(data, "target_names", [])),
        },
    )

    X_train, X_test, y_train, y_test = train_test_split(
        data.data, data.target, test_size=0.2, random_state=42, stratify=data.target
    )

    model = LogisticRegression(max_iter=200)
    model.fit(X_train, y_train)

    emit(
        EVIDENCE_ENDPOINT,
        "model_trained",
        actor,
        system,
        run_id,
        {"model_type": "LogisticRegression", "params": model.get_params()},
    )

    y_pred = model.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))

    emit(
        EVIDENCE_ENDPOINT,
        "evaluation_reported",
        actor,
        system,
        run_id,
        {"metric": "accuracy", "value": acc, "threshold": 0.8, "passed": acc >= 0.8},
    )

    os.makedirs("artifacts", exist_ok=True)
    model_path = f"model_{run_id}.joblib"
    dump(model, os.path.join("artifacts", model_path))

    emit(
        EVIDENCE_ENDPOINT,
        "model_promoted",
        actor,
        system,
        run_id,
        {"artifact_path": f"python/artifacts/{model_path}", "promotion_reason": "poc"},
    )

    print(f"done run_id={run_id} accuracy={acc}")


if __name__ == "__main__":
    main()
