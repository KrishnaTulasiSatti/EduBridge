"""EduBridge need-assessment ML service (experimental second opinion).

Called only by the EduBridge API, server to server. When ML_SERVICE_TOKEN is set, every request except
/health must send it in the X-Service-Token header.
"""

from __future__ import annotations

import hmac
import os
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import synthetic
from .features import FEATURES, LABELS
from .training import ModelStore, TrainingError, predict, train

app = FastAPI(title="EduBridge ML service", version="1.0.0")
store = ModelStore()


def require_token(x_service_token: str | None = Header(default=None)) -> None:
    expected = os.environ.get("ML_SERVICE_TOKEN", "")
    if expected and not hmac.compare_digest(x_service_token or "", expected):
        raise HTTPException(status_code=401, detail="Invalid service token")


class Sample(BaseModel):
    features: dict[str, float]
    label: Literal["HIGH", "MEDIUM", "LOW"]
    group: str | None = None


class TrainRequest(BaseModel):
    samples: list[Sample] = Field(max_length=100_000)
    source: Literal["REVIEWED_DECISIONS", "SYNTHETIC_DEMO"]


class SyntheticRequest(BaseModel):
    n: int = Field(default=600, ge=100, le=5000)
    seed: int = 42


class PredictRequest(BaseModel):
    features: dict[str, float]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "edubridge-ml", "model": store.report["model"] if store.report else None}


@app.get("/features", dependencies=[Depends(require_token)])
def features() -> dict:
    return {"features": FEATURES, "labels": LABELS}


@app.get("/model", dependencies=[Depends(require_token)])
def model_report() -> dict:
    if not store.report:
        raise HTTPException(status_code=404, detail="No model has been trained yet")
    return store.report


def _train(samples: list[dict], source: str) -> dict:
    try:
        model, report = train(samples, source)
    except TrainingError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    store.save(model, report)
    return report


@app.post("/train", dependencies=[Depends(require_token)])
def train_on_samples(body: TrainRequest) -> dict:
    return _train([s.model_dump() for s in body.samples], body.source)


@app.post("/train/synthetic", dependencies=[Depends(require_token)])
def train_synthetic(body: SyntheticRequest) -> dict:
    return _train(synthetic.generate(body.n, body.seed), "SYNTHETIC_DEMO")


@app.post("/predict", dependencies=[Depends(require_token)])
def predict_need(body: PredictRequest) -> dict:
    if store.model is None or store.report is None:
        raise HTTPException(status_code=404, detail="No model has been trained yet")
    missing = [f for f in FEATURES if f not in body.features]
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing features: {', '.join(missing)}")
    return predict(store.model, store.report, body.features)
