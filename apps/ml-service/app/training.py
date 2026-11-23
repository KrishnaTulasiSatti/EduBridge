"""Training, evaluation and prediction for the need-level classifier.

Three candidate models are compared with stratified 5-fold cross-validation (Logistic Regression as the
baseline, a Decision Tree as the explainable model and a Random Forest as the strong candidate). The one
with the best macro F1 is refitted on all samples. Every report includes per-class metrics, the confusion
matrix and a fairness breakdown by a protected attribute that is never used as a model input.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from .features import FEATURES, LABELS, MIN_PER_CLASS, MIN_SAMPLES


class TrainingError(ValueError):
    pass


def _candidates() -> dict[str, Any]:
    return {
        "Logistic Regression": Pipeline(
            [("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=5000, class_weight="balanced"))]
        ),
        "Decision Tree": DecisionTreeClassifier(max_depth=5, min_samples_leaf=3, class_weight="balanced", random_state=42),
        "Random Forest": RandomForestClassifier(
            n_estimators=200, max_depth=8, min_samples_leaf=2, class_weight="balanced", random_state=42
        ),
    }


def _matrix(samples: list[dict]) -> np.ndarray:
    return np.array([[float(s["features"].get(f, 0.0)) for f in FEATURES] for s in samples], dtype=float)


def _r(v: float) -> float:
    return round(float(v), 4)


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=LABELS, zero_division=0)
    present = [i for i, n in enumerate(s) if n > 0]
    return {
        "accuracy": _r(accuracy_score(y_true, y_pred)),
        "macroPrecision": _r(np.mean([p[i] for i in present])),
        "macroRecall": _r(np.mean([r[i] for i in present])),
        "macroF1": _r(np.mean([f[i] for i in present])),
        "perClass": {
            LABELS[i]: {"precision": _r(p[i]), "recall": _r(r[i]), "f1": _r(f[i]), "support": int(s[i])} for i in present
        },
        "confusionMatrix": confusion_matrix(y_true, y_pred, labels=LABELS).tolist(),
    }


def _importance(model: Any) -> list[dict]:
    if hasattr(model, "feature_importances_"):
        raw = np.asarray(model.feature_importances_, dtype=float)
    else:  # Logistic Regression: mean absolute coefficient on standardised features
        raw = np.abs(model.named_steps["clf"].coef_).mean(axis=0)
    total = raw.sum() or 1.0
    ranked = sorted(zip(FEATURES, raw / total), key=lambda t: -t[1])
    return [{"feature": f, "importance": _r(v)} for f, v in ranked]


def _fairness(y_true: np.ndarray, y_pred: np.ndarray, groups: list[str]) -> list[dict]:
    out = []
    g = np.array(groups)
    for name in sorted(set(groups)):
        mask = g == name
        yt, yp = y_true[mask], y_pred[mask]
        high = yt == "HIGH"
        out.append(
            {
                "group": name,
                "count": int(mask.sum()),
                "predictedHighRate": _r(np.mean(yp == "HIGH")),
                "actualHighRate": _r(np.mean(high)),
                "recallHigh": _r(np.mean(yp[high] == "HIGH")) if high.any() else None,
                "accuracy": _r(np.mean(yt == yp)),
            }
        )
    return out


def validate(samples: list[dict]) -> None:
    if len(samples) < MIN_SAMPLES:
        raise TrainingError(f"At least {MIN_SAMPLES} labelled samples are needed; got {len(samples)}.")
    counts = {lab: sum(1 for s in samples if s["label"] == lab) for lab in LABELS}
    present = {k: v for k, v in counts.items() if v > 0}
    if len(present) < 2:
        raise TrainingError("Samples from at least two need levels are needed.")
    small = [k for k, v in present.items() if v < MIN_PER_CLASS]
    if small:
        raise TrainingError(f"Each need level present needs at least {MIN_PER_CLASS} samples; too few for: {', '.join(small)}.")


def train(samples: list[dict], source: str) -> tuple[Any, dict]:
    validate(samples)
    X = _matrix(samples)
    y = np.array([s["label"] for s in samples])
    groups = [s.get("group") or "Not stated" for s in samples]

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    candidates, predictions = [], {}
    for name, estimator in _candidates().items():
        pred = cross_val_predict(estimator, X, y, cv=cv)
        predictions[name] = pred
        candidates.append({"algorithm": name, **_metrics(y, pred)})

    # Best macro F1; on a tie the earlier (simpler, more explainable) model wins.
    chosen = max(candidates, key=lambda c: c["macroF1"])["algorithm"]
    model = _candidates()[chosen].fit(X, y)
    chosen_metrics = next(c for c in candidates if c["algorithm"] == chosen)

    info = {
        "modelId": uuid.uuid4().hex[:12],
        "algorithm": chosen,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "samples": len(samples),
        "macroF1": chosen_metrics["macroF1"],
    }
    report = {
        "model": info,
        "labels": LABELS,
        "evaluation": "STRATIFIED_5_FOLD_CV",
        "candidates": candidates,
        "chosen": chosen,
        "featureImportance": _importance(model),
        "fairness": {
            "attribute": "gender",
            "groups": _fairness(y, predictions[chosen], groups),
            "note": "Gender is never a model input. Large gaps between groups in the predicted high-need rate or in recall would indicate bias to investigate.",
        },
        "classCounts": {lab: int((y == lab).sum()) for lab in LABELS if (y == lab).any()},
    }
    return model, report


def predict(model: Any, report: dict, features: dict) -> dict:
    x = np.array([[float(features.get(f, 0.0)) for f in FEATURES]], dtype=float)
    proba = model.predict_proba(x)[0]
    probabilities = {str(c): _r(p) for c, p in zip(model.classes_, proba)}
    prediction = max(probabilities, key=probabilities.get)
    return {"prediction": prediction, "probabilities": probabilities, "model": report["model"]}


class ModelStore:
    """Keeps the current model in memory and on disk (MODEL_DIR)."""

    def __init__(self, directory: str | None = None):
        self.dir = Path(directory or os.environ.get("MODEL_DIR") or Path(__file__).resolve().parent.parent / "models")
        self.model: Any = None
        self.report: dict | None = None
        self._load()

    def _load(self) -> None:
        try:
            self.model = joblib.load(self.dir / "model.joblib")
            self.report = json.loads((self.dir / "report.json").read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError, OSError):
            self.model, self.report = None, None

    def save(self, model: Any, report: dict) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, self.dir / "model.joblib")
        (self.dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        self.model, self.report = model, report
