from __future__ import annotations

from datetime import datetime, timezone
import hmac
import logging
import os
from typing import Any

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.fraud_model_loader import (
    FRAUD_FEATURE_SCHEMA_VERSION,
    FraudModelRegistry,
)
from app.model_loader import ModelRegistry
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


logger = logging.getLogger(__name__)

app = FastAPI(
    title="thryftverse-decision-baseline-service",
    version="2.1.0",
    description=(
        "Versioned deterministic ranking, forecasting and pricing baselines "
        "with optional LightGBM shadow scoring. The heuristic ranker remains "
        "the champion; a trained challenger may shadow it for offline comparison "
        "without affecting user-facing responses."
    ),
)

# Global model registry — champion is always the heuristic baseline.
# A shadow challenger may be loaded at runtime via /shadow/load.
_registry = ModelRegistry()

# Global fraud model registry — champion is always the rule-engine baseline.
# A shadow challenger may be loaded at runtime via /fraud/shadow/load.
_fraud_registry = FraudModelRegistry()


def require_decision_service(
    x_decision_service_token: str | None = Header(default=None),
) -> None:
    expected = os.environ.get("DECISION_SERVICE_TOKEN", "local-decision-service-token")
    if not x_decision_service_token or not hmac.compare_digest(
        x_decision_service_token,
        expected,
    ):
        raise HTTPException(status_code=401, detail="Invalid decision service credential.")


def require_admin(
    x_admin_service_token: str | None = Header(default=None),
) -> None:
    """Admin-only guard for shadow model load/unload operations."""
    expected = os.environ.get("ADMIN_SERVICE_TOKEN", "local-admin-token")
    if not x_admin_service_token or not hmac.compare_digest(
        x_admin_service_token,
        expected,
    ):
        raise HTTPException(status_code=403, detail="Admin credential required.")


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": "thryftverse-decision-baseline-service",
        "capability_level": "trained_model" if _registry.shadow_loaded else "heuristic_baseline",
        "trained_models": _registry.shadow_loaded,
        "shadow_model_loaded": _registry.shadow_loaded,
        "shadow_model_version": _registry.shadow_version,
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
    # Champion: always the heuristic ranker. This produces the user-facing
    # response. If it fails, FastAPI returns a 500 — the deterministic fallback
    # is the heuristic itself, which is always available in-process.
    response = rank_recommendations(payload)

    # Shadow: score with the challenger if loaded. This never modifies the
    # user-facing response. Errors are logged and swallowed.
    if _registry.shadow_loaded:
        try:
            from app.model_loader import HeuristicRankingModel

            champion_model = HeuristicRankingModel()
            champion_scored = champion_model.score(payload)
            shadow_scoring = _registry.score_shadow(payload, champion_scored)
            if shadow_scoring is not None:
                response.decision.diagnostics.shadow_scoring = shadow_scoring
        except Exception as exc:
            logger.exception("shadow scoring pipeline error (non-fatal): %s", exc)

    return response


# ---------------------------------------------------------------------------
# Shadow model management endpoints
# ---------------------------------------------------------------------------


class ShadowLoadRequest(BaseModel):
    model_path: str = Field(min_length=1)
    manifest_path: str = Field(min_length=1)


@app.post("/shadow/load")
def shadow_load(
    payload: ShadowLoadRequest,
    _: None = Depends(require_admin),
) -> dict[str, object]:
    del _
    success, message = _registry.load_shadow(payload.model_path, payload.manifest_path)
    return {
        "loaded": success,
        "message": message,
        "shadow_model_loaded": _registry.shadow_loaded,
        "shadow_model_version": _registry.shadow_version,
    }


@app.post("/shadow/unload")
def shadow_unload(
    _: None = Depends(require_admin),
) -> dict[str, object]:
    _registry.unload_shadow()
    return {
        "loaded": False,
        "message": "shadow model unloaded",
        "shadow_model_loaded": False,
        "shadow_model_version": None,
    }


@app.get("/shadow/status")
def shadow_status() -> dict[str, object]:
    return {
        "shadow_model_loaded": _registry.shadow_loaded,
        "shadow_model_version": _registry.shadow_version,
        "champion_policy_version": POLICY_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "telemetry": _registry.telemetry_summary(),
    }


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


# ---------------------------------------------------------------------------
# Fraud scoring endpoints (shadow deployment — Phase 6)
# ---------------------------------------------------------------------------


class FraudScoreRequest(BaseModel):
    """Payload for POST /fraud/score.

    Contains the same signals the rule engine uses, so the shadow model
    operates on the same feature space as the champion.
    """

    event_id: str = Field(min_length=2, max_length=120)
    event_type: str = Field(min_length=2, max_length=40)
    user_id: str | None = Field(default=None, max_length=120)
    rule_engine_score: int = Field(ge=0, le=100)
    rule_engine_level: str = Field(min_length=2, max_length=10)
    rule_engine_action: str | None = Field(default=None, max_length=10)
    signals: list[dict[str, Any]] = Field(default_factory=list)
    velocity: dict[str, Any] = Field(default_factory=dict)
    account_age_seconds: float = Field(default=-1)
    amount_gbp: float = Field(default=0, ge=0)
    device_multiple_accounts: int = Field(default=0, ge=0)


@app.post("/fraud/score")
def fraud_score(
    payload: FraudScoreRequest,
    _: None = Depends(require_decision_service),
) -> dict[str, object]:
    del _
    signals = {
        "event_id": payload.event_id,
        "event_type": payload.event_type,
        "user_id": payload.user_id,
        "rule_engine_score": payload.rule_engine_score,
        "rule_engine_level": payload.rule_engine_level,
        "rule_engine_action": payload.rule_engine_action,
        "signals": payload.signals,
        "velocity": payload.velocity,
        "account_age_seconds": payload.account_age_seconds,
        "amount_gbp": payload.amount_gbp,
        "device_multiple_accounts": payload.device_multiple_accounts,
    }
    result = _fraud_registry.score_shadow(signals)
    return {
        "score": result.score,
        "decision": result.decision,
        "confidence": result.confidence,
        "model_id": result.model_id,
        "model_version": result.model_version,
        "features": result.features,
        "reason": result.reason,
    }


@app.get("/fraud/status")
def fraud_status() -> dict[str, object]:
    return {
        "shadow_model_loaded": _fraud_registry.shadow_loaded,
        "shadow_model_id": _fraud_registry.shadow_model_id,
        "shadow_model_version": _fraud_registry.shadow_version,
        "champion_model_id": _fraud_registry.champion.model_id,
        "champion_model_version": _fraud_registry.champion.model_version,
        "feature_schema_version": FRAUD_FEATURE_SCHEMA_VERSION,
        "telemetry": _fraud_registry.telemetry_summary(),
    }


class FraudShadowLoadRequest(BaseModel):
    model_path: str = Field(min_length=1)
    manifest_path: str = Field(min_length=1)


@app.post("/fraud/shadow/load")
def fraud_shadow_load(
    payload: FraudShadowLoadRequest,
    _: None = Depends(require_admin),
) -> dict[str, object]:
    del _
    success, message = _fraud_registry.load_shadow(
        payload.model_path, payload.manifest_path
    )
    return {
        "loaded": success,
        "message": message,
        "shadow_model_loaded": _fraud_registry.shadow_loaded,
        "shadow_model_version": _fraud_registry.shadow_version,
    }


@app.post("/fraud/shadow/unload")
def fraud_shadow_unload(
    _: None = Depends(require_admin),
) -> dict[str, object]:
    _fraud_registry.unload_shadow()
    return {
        "loaded": False,
        "message": "fraud shadow model unloaded",
        "shadow_model_loaded": False,
        "shadow_model_version": None,
    }


__all__ = [
    "CandidateItem",
    "ClassificationRequest",
    "FraudScoreRequest",
    "FraudShadowLoadRequest",
    "InteractionEvent",
    "PriceForecastRequest",
    "PricingActionRequest",
    "RecommendationRequest",
    "classify_image",
    "forecast_price",
    "fraud_score",
    "fraud_shadow_load",
    "fraud_shadow_unload",
    "fraud_status",
    "health",
    "pricing_action",
    "recommendations",
    "require_decision_service",
    "shadow_load",
    "shadow_status",
    "shadow_unload",
]
