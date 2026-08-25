from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, FiniteFloat


Action = Literal["view", "wishlist", "purchase"]


class CandidateItem(BaseModel):
    listing_id: str = Field(min_length=2, max_length=120)
    seller_id: str | None = Field(default=None, max_length=120)
    title: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=5_000)
    category: str = Field(default="", max_length=120)
    brand: str = Field(default="", max_length=120)
    size: str = Field(default="", max_length=80)
    condition: str = Field(default="", max_length=80)
    price_gbp: FiniteFloat = Field(default=0, ge=0)
    created_at: datetime | None = None
    quality_score: FiniteFloat = Field(default=0.5, ge=0, le=1)
    popularity_score: FiniteFloat = Field(default=0, ge=0, le=1)
    seller_trust_score: FiniteFloat = Field(default=0.5, ge=0, le=1)
    available: bool = True


class InteractionEvent(BaseModel):
    listing_id: str = Field(min_length=2, max_length=120)
    action: Action
    strength: FiniteFloat = Field(default=1.0, ge=0.05, le=20)
    created_at: datetime | None = None
    title: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=5_000)
    category: str = Field(default="", max_length=120)
    brand: str = Field(default="", max_length=120)
    size: str = Field(default="", max_length=80)
    condition: str = Field(default="", max_length=80)
    price_gbp: FiniteFloat | None = Field(default=None, ge=0)


class RecommendationRequest(BaseModel):
    user_id: str = Field(min_length=2)
    request_id: str | None = Field(default=None, min_length=8, max_length=120)
    as_of: datetime | None = None
    candidate_listing_ids: list[str] = Field(default_factory=list, max_length=2_000)
    candidates: list[CandidateItem] = Field(default_factory=list, max_length=2_000)
    recent_interactions: list[InteractionEvent] = Field(default_factory=list, max_length=500)
    exclude_listing_ids: list[str] = Field(default_factory=list, max_length=2_000)
    result_limit: int = Field(default=20, ge=1, le=100)
    exploration_rate: FiniteFloat = Field(default=0.18, ge=0, le=0.45)
    max_per_seller: int = Field(default=2, ge=1, le=20)
    max_per_category: int = Field(default=6, ge=1, le=50)


class RecommendationItem(BaseModel):
    listing_id: str
    score: float = Field(ge=0, le=1)
    model: Literal[
        "heuristic_ranker_v2",
        "novelty_exploration_v2",
        "lightgbm_lambdarank_v1",
        "lightgbm_xendcg_v1",
    ]
    policy: Literal["exploit", "explore"]
    position: int = Field(ge=1)
    reason_codes: list[str]
    component_scores: dict[str, float]


class ShadowScoreEntry(BaseModel):
    """Per-candidate comparison between champion and shadow challenger.

    Shadow scores never affect the user-facing ranking. They are emitted in
    diagnostics so champion and challenger can be compared offline.
    """

    listing_id: str
    champion_score: float = Field(ge=0, le=1)
    challenger_score: float
    score_delta: float
    champion_rank: int = Field(ge=1)
    challenger_rank: int = Field(ge=1)


class ShadowScoring(BaseModel):
    """Aggregate shadow-challenger telemetry attached to diagnostics."""

    shadow_model_id: str
    shadow_model_version: str
    shadow_objective: str
    scored_count: int = Field(ge=0)
    latency_ms: float = Field(ge=0)
    feature_missingness: float = Field(ge=0, le=1)
    rank_overlap_at_k: float = Field(ge=0, le=1)
    scores: list[ShadowScoreEntry] = Field(default_factory=list)


class RecommendationDiagnostics(BaseModel):
    duplicate_candidates_removed: int
    unavailable_candidates_removed: int
    explicitly_excluded_candidates: int
    purchased_candidates_removed: int
    constraints_relaxed: bool
    shadow_scoring: ShadowScoring | None = None


class RecommendationMetadata(BaseModel):
    request_id: str
    policy_version: str
    feature_schema_version: str
    capability_level: Literal["heuristic_baseline", "trained_model"]
    trained_model: bool
    generated_at: datetime
    candidate_count: int
    eligible_count: int
    result_count: int
    exploration_rate: float
    cold_start: bool
    diagnostics: RecommendationDiagnostics


class RecommendationResponse(BaseModel):
    decision: RecommendationMetadata
    recommendations: list[RecommendationItem]


class ClassificationRequest(BaseModel):
    image_url: str


class PriceForecastRequest(BaseModel):
    series: list[FiniteFloat] = Field(min_length=10)
    horizon_steps: int = Field(default=5, ge=1, le=90)


class PricingActionRequest(BaseModel):
    inventory: int = Field(ge=0)
    demand_index: FiniteFloat = Field(ge=0)
    current_price: FiniteFloat = Field(gt=0)
