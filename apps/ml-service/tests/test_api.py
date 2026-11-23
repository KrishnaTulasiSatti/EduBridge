import os
import tempfile

os.environ["MODEL_DIR"] = tempfile.mkdtemp(prefix="edubridge-ml-test-")
os.environ["ML_SERVICE_TOKEN"] = "test-token"

from fastapi.testclient import TestClient  # noqa: E402

from app.features import FEATURES  # noqa: E402
from app.main import app  # noqa: E402
from app.synthetic import generate  # noqa: E402

client = TestClient(app)
AUTH = {"X-Service-Token": "test-token"}


def test_health_is_public_and_requires_token_elsewhere():
    assert client.get("/health").status_code == 200
    assert client.get("/features").status_code == 401
    assert client.get("/features", headers={"X-Service-Token": "wrong"}).status_code == 401
    assert client.get("/features", headers=AUTH).json()["features"] == FEATURES


def test_predict_without_model():
    r = client.post("/predict", json={"features": {f: 0 for f in FEATURES}}, headers=AUTH)
    assert r.status_code == 404


def test_rejects_too_little_data():
    samples = generate(20)
    r = client.post("/train", json={"samples": samples, "source": "REVIEWED_DECISIONS"}, headers=AUTH)
    assert r.status_code == 422
    assert "At least 30" in r.json()["detail"]


def test_trains_compares_and_reports():
    r = client.post("/train/synthetic", json={"n": 400}, headers=AUTH)
    assert r.status_code == 200
    report = r.json()
    assert report["model"]["source"] == "SYNTHETIC_DEMO"
    assert {c["algorithm"] for c in report["candidates"]} == {"Logistic Regression", "Decision Tree", "Random Forest"}
    chosen = next(c for c in report["candidates"] if c["algorithm"] == report["chosen"])
    assert chosen["macroF1"] == max(c["macroF1"] for c in report["candidates"])
    assert len(chosen["confusionMatrix"]) == 3
    assert sum(map(sum, chosen["confusionMatrix"])) == 400
    assert chosen["macroF1"] > 0.6  # the synthetic labels are learnable, but noisy
    assert {g["group"] for g in report["fairness"]["groups"]} >= {"Female", "Male"}
    assert abs(sum(f["importance"] for f in report["featureImportance"]) - 1) < 0.01


def test_predicts_with_probabilities():
    poor = {f: 0 for f in FEATURES} | {
        "annual_family_income": 60000, "income_per_member": 12000, "family_members": 5, "earning_members": 1,
        "dependents_studying": 3, "total_expenses": 120000, "requested_amount": 100000, "uncovered_cost_ratio": 2.0,
        "orphan": 1, "circumstance_count": 1,
    }
    r = client.post("/predict", json={"features": poor}, headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["prediction"] == "HIGH"
    assert abs(sum(body["probabilities"].values()) - 1) < 0.01
    missing = client.post("/predict", json={"features": {"family_members": 3}}, headers=AUTH)
    assert missing.status_code == 422
