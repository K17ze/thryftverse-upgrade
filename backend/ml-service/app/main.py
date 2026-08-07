from __future__ import annotations

from datetime import datetime, timezone
import hmac
import os

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException

from app.ranking import FEATURE_SCHEMA_VERSION, POLICY_VERSION, rank_recommendations
from app.schemas import (
    CandidateItem,
    ClassificationRequest,
    InteractionEvent,
    PriceForecastRequest,
    PricingActionRequest,
    RecommendationRequest,
    RecommendationResponse,
)


app = FastAPI(
    title="thryftverse-decision-baseline-service",
    version="2.0.0",
    description=(
        "Versioned deterministic ranking, forecasting and pricing baselines. "
        "This service does not claim trained ML capabilities."
    ),
)


def require_decision_service(
    x_decision_service_token: str | None = Header(default=None),
) -> None:
    expected = os.environ.get("DECISION_SERVICE_TOKEN", "local-decision-service-token")
    if not x_decision_service_token or not hmac.compare_digest(
        x_decision_service_token,
        expected,
    ):
        raise HTTPException(status_code=401, detail="Invalid decision service credential.")


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": "thryftverse-decision-baseline-service",
        "capability_level": "heuristic_baseline",
        "trained_models": False,
        "recommendation_policy_version": POLICY_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "ts": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/recommendations", response_model=RecommendationResponse)
def recommendations(
    payload: RecommendationRequest,
    _: None = Depends(require_decision_service),
) -> RecommendationResponse:
    del _
    return rank_recommendations(payload)


@app.post("/classify-image")
def classify_image(
    payload: ClassificationRequest,
    _: None = Depends(require_decision_service),
) -> dict[str, object]:
    del _
    del payload
    raise HTTPException(
        status_code=501,
        detail="Image classification is not available in the decision baseline service.",
    )


@app.post("/forecast-price")
def forecast_price(
    payload: PriceForecastRequest,
    _: None = Depends(require_decision_service),
) -> dict[str, object]:
    del _
    series = np.array(payload.series, dtype=np.float64)
    recent = series[-5:]
    differences = np.diff(recent)
    trend = float(np.mean(differences)) if recent.size >= 2 else 0.0
    residual_scale = float(np.std(differences)) if differences.size >= 2 else 0.0

    last = float(series[-1])
    forecast: list[float] = []
    lower_bound: list[float] = []
    upper_bound: list[float] = []
    for step in range(payload.horizon_steps):
        last = max(0.0, last + trend)
        uncertainty = 1.96 * residual_scale * ((step + 1) ** 0.5)
        forecast.append(round(last, 6))
        lower_bound.append(round(max(0.0, last - uncertainty), 6))
        upper_bound.append(round(last + uncertainty, 6))

    return {
        "model": "moving_trend_baseline",
        "policy_version": "price-forecast-baseline-v2",
        "trained_model": False,
        "methodology": "mean first difference over the latest five observations",
        "horizon_steps": payload.horizon_steps,
        "forecast": forecast,
        "uncertainty": {
            "method": "normal approximation from recent first-difference volatility",
            "lower_95": lower_bound,
            "upper_95": upper_bound,
        },
    }


@app.post("/pricing-action")
def pricing_action(
    payload: PricingActionRequest,
    _: None = Depends(require_decision_service),
) -> dict[str, object]:
    del _
    if payload.inventory > 20 and payload.demand_index < 0.6:
        action = "decrease_price"
        next_price = payload.current_price * 0.97
        reason_codes = ["high_inventory", "low_demand"]
    elif payload.demand_index > 1.2:
        action = "increase_price"
        next_price = payload.current_price * 1.03
        reason_codes = ["high_demand"]
    else:
        action = "hold"
        next_price = payload.current_price
        reason_codes = ["within_policy_band"]

    return {
        "policy": "deterministic_inventory_policy",
        "policy_version": "inventory-pricing-v2",
        "trained_model": False,
        "action": action,
        "suggested_price": round(next_price, 4),
        "reason_codes": reason_codes,
        "guardrails": {
            "maximum_change_percent": 3,
            "human_review_required": True,
            "automatic_price_change": False,
        },
    }


__all__ = [
    "CandidateItem",
    "ClassificationRequest",
    "InteractionEvent",
    "PriceForecastRequest",
    "PricingActionRequest",
    "RecommendationRequest",
    "classify_image",
    "forecast_price",
    "health",
    "pricing_action",
    "recommendations",
    "require_decision_service",
]
