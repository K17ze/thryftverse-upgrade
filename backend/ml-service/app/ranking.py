from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import math
import re
import uuid

import numpy as np

from app.schemas import (
    CandidateItem,
    InteractionEvent,
    RecommendationDiagnostics,
    RecommendationItem,
    RecommendationMetadata,
    RecommendationRequest,
    RecommendationResponse,
)


POLICY_VERSION = "recommendation-heuristic-v2.0"
FEATURE_SCHEMA_VERSION = "recommendation-features-v2"
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
ACTION_WEIGHTS = {"view": 1.0, "wishlist": 2.8, "purchase": 4.5}
ACTION_HALF_LIFE_DAYS = {"view": 7.0, "wishlist": 21.0, "purchase": 60.0}

# Ordered feature names matching the component scores produced by the heuristic
# ranker.  The LightGBM challenger consumes exactly these features so that
# champion and shadow use the same interpretable feature space.
RANKING_FEATURES: tuple[str, ...] = (
    "affinity",
    "sequence",
    "price_alignment",
    "freshness",
    "quality",
    "popularity",
    "seller_trust",
)


def _utc(value: datetime | None, fallback: datetime) -> datetime:
    if value is None:
        return fallback
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _tokens(
    *,
    title: str,
    description: str,
    category: str,
    brand: str,
    size: str,
    condition: str,
) -> set[str]:
    tokens = set(TOKEN_PATTERN.findall(f"{title} {description}".lower()))
    for prefix, value in (
        ("category", category),
        ("brand", brand),
        ("size", size),
        ("condition", condition),
    ):
        normalized = "_".join(TOKEN_PATTERN.findall(value.lower()))
        if normalized:
            tokens.add(f"{prefix}:{normalized}")
    return tokens


def _candidate_tokens(candidate: CandidateItem) -> set[str]:
    tokens = _tokens(
        title=candidate.title,
        description=candidate.description,
        category=candidate.category,
        brand=candidate.brand,
        size=candidate.size,
        condition=candidate.condition,
    )
    return tokens or {f"listing:{candidate.listing_id.lower()}"}


def _interaction_tokens(event: InteractionEvent) -> set[str]:
    tokens = _tokens(
        title=event.title,
        description=event.description,
        category=event.category,
        brand=event.brand,
        size=event.size,
        condition=event.condition,
    )
    return tokens or {f"listing:{event.listing_id.lower()}"}


def _jaccard_distance(left: set[str], right: set[str]) -> float:
    union = left | right
    return 0.0 if not union else 1.0 - (len(left & right) / len(union))


def _freshness(candidate: CandidateItem, as_of: datetime) -> float:
    if candidate.created_at is None:
        return 0.45
    age_days = max(0.0, (as_of - _utc(candidate.created_at, as_of)).total_seconds() / 86_400)
    return math.exp(-age_days / 28.0)


def _event_weight(event: InteractionEvent, as_of: datetime) -> float:
    age_days = max(0.0, (as_of - _utc(event.created_at, as_of)).total_seconds() / 86_400)
    decay = math.pow(0.5, age_days / ACTION_HALF_LIFE_DAYS[event.action])
    # Cap each event so retries or abusive clients cannot dominate a profile.
    return min(8.0, ACTION_WEIGHTS[event.action] * min(event.strength, 3.0) * decay)


def _normalize_affinity(raw: float) -> float:
    return 1.0 - math.exp(-max(0.0, raw) / 5.0)


def _price_alignment(price: float, median_price: float | None) -> float:
    if price <= 0 or median_price is None or median_price <= 0:
        return 0.5
    log_delta = abs(math.log(max(price, 0.01) / median_price))
    return math.exp(-1.25 * log_delta)


def _reason_codes(components: dict[str, float], cold_start: bool) -> list[str]:
    if cold_start:
        ordered = ("quality", "popularity", "freshness", "seller_trust")
    else:
        ordered = ("affinity", "sequence", "price_alignment", "quality", "freshness")
    labels = {
        "affinity": "matches_recent_activity",
        "sequence": "matches_latest_interest",
        "price_alignment": "within_preferred_price_range",
        "quality": "listing_quality",
        "popularity": "market_interest",
        "freshness": "recent_listing",
        "seller_trust": "seller_trust",
    }
    return [labels[key] for key in sorted(ordered, key=components.get, reverse=True)[:2]]


def _dedupe_candidates(candidates: list[CandidateItem]) -> tuple[list[CandidateItem], int]:
    by_id: dict[str, CandidateItem] = {}
    for candidate in candidates:
        incumbent = by_id.get(candidate.listing_id)
        if incumbent is None:
            by_id[candidate.listing_id] = candidate
            continue
        incumbent_completeness = sum(
            bool(value)
            for value in (incumbent.title, incumbent.category, incumbent.brand, incumbent.seller_id)
        )
        candidate_completeness = sum(
            bool(value)
            for value in (candidate.title, candidate.category, candidate.brand, candidate.seller_id)
        )
        if candidate_completeness > incumbent_completeness:
            by_id[candidate.listing_id] = candidate
    return list(by_id.values()), len(candidates) - len(by_id)


def extract_candidate_features(
    payload: RecommendationRequest,
) -> list[dict[str, object]]:
    """Compute the interpretable component scores for every eligible candidate.

    Returns one row per eligible candidate with ``listing_id``, ``components``
    (the seven ranking features), ``utility``, and ``cold_start``.  This is the
    shared feature path used by both the heuristic champion and the LightGBM
    shadow challenger so that champion and challenger operate on identical
    features.
    """
    as_of = _utc(payload.as_of, datetime.now(timezone.utc))
    input_candidates = payload.candidates or [
        CandidateItem(listing_id=listing_id) for listing_id in payload.candidate_listing_ids
    ]
    candidates, _ = _dedupe_candidates(input_candidates)
    explicitly_excluded = set(payload.exclude_listing_ids)
    purchased = {
        event.listing_id for event in payload.recent_interactions if event.action == "purchase"
    }
    eligible = [
        item
        for item in candidates
        if item.available
        and item.listing_id not in explicitly_excluded
        and item.listing_id not in purchased
    ]

    profile_weights: Counter[str] = Counter()
    sequence_weights: Counter[str] = Counter()
    interacted_prices: list[float] = []
    ordered_events = sorted(
        payload.recent_interactions,
        key=lambda event: _utc(event.created_at, as_of),
        reverse=True,
    )
    for sequence_index, event in enumerate(ordered_events):
        weight = _event_weight(event, as_of)
        tokens = _interaction_tokens(event)
        for token in tokens:
            profile_weights[token] += weight
            sequence_weights[token] += weight * math.exp(-sequence_index / 6.0)
        if event.price_gbp and event.price_gbp > 0:
            interacted_prices.append(event.price_gbp)

    median_price = float(np.median(interacted_prices)) if interacted_prices else None
    meaningful_events = sum(_event_weight(event, as_of) >= 0.15 for event in ordered_events)
    cold_start = meaningful_events < 3 or not profile_weights

    rows: list[dict[str, object]] = []
    for candidate in eligible:
        tokens = _candidate_tokens(candidate)
        affinity = _normalize_affinity(
            sum(profile_weights[token] for token in tokens) / math.sqrt(max(1, len(tokens)))
        )
        sequence = _normalize_affinity(
            sum(sequence_weights[token] for token in tokens) / math.sqrt(max(1, len(tokens)))
        )
        components = {
            "affinity": affinity,
            "sequence": sequence,
            "price_alignment": _price_alignment(candidate.price_gbp, median_price),
            "freshness": _freshness(candidate, as_of),
            "quality": candidate.quality_score,
            "popularity": candidate.popularity_score,
            "seller_trust": candidate.seller_trust_score,
        }
        if cold_start:
            utility = (
                0.32 * components["quality"]
                + 0.27 * components["popularity"]
                + 0.23 * components["freshness"]
                + 0.18 * components["seller_trust"]
            )
        else:
            utility = (
                0.34 * components["affinity"]
                + 0.18 * components["sequence"]
                + 0.14 * components["price_alignment"]
                + 0.12 * components["quality"]
                + 0.09 * components["popularity"]
                + 0.07 * components["freshness"]
                + 0.06 * components["seller_trust"]
            )
        rows.append(
            {
                "listing_id": candidate.listing_id,
                "components": components,
                "utility": min(1.0, max(0.0, utility)),
                "cold_start": cold_start,
            }
        )
    return rows


def rank_recommendations(payload: RecommendationRequest) -> RecommendationResponse:
    as_of = _utc(payload.as_of, datetime.now(timezone.utc))
    request_id = payload.request_id or str(uuid.uuid4())
    input_candidates = payload.candidates or [
        CandidateItem(listing_id=listing_id) for listing_id in payload.candidate_listing_ids
    ]
    candidates, duplicates_removed = _dedupe_candidates(input_candidates)

    explicitly_excluded = set(payload.exclude_listing_ids)
    purchased = {
        event.listing_id for event in payload.recent_interactions if event.action == "purchase"
    }
    unavailable_removed = sum(not item.available for item in candidates)
    explicit_removed = sum(
        item.available and item.listing_id in explicitly_excluded for item in candidates
    )
    purchased_removed = sum(
        item.available
        and item.listing_id not in explicitly_excluded
        and item.listing_id in purchased
        for item in candidates
    )
    eligible = [
        item
        for item in candidates
        if item.available
        and item.listing_id not in explicitly_excluded
        and item.listing_id not in purchased
    ]

    profile_weights: Counter[str] = Counter()
    sequence_weights: Counter[str] = Counter()
    interacted_prices: list[float] = []
    ordered_events = sorted(
        payload.recent_interactions,
        key=lambda event: _utc(event.created_at, as_of),
        reverse=True,
    )
    for sequence_index, event in enumerate(ordered_events):
        weight = _event_weight(event, as_of)
        tokens = _interaction_tokens(event)
        for token in tokens:
            profile_weights[token] += weight
            sequence_weights[token] += weight * math.exp(-sequence_index / 6.0)
        if event.price_gbp and event.price_gbp > 0:
            interacted_prices.append(event.price_gbp)

    median_price = float(np.median(interacted_prices)) if interacted_prices else None
    meaningful_events = sum(_event_weight(event, as_of) >= 0.15 for event in ordered_events)
    cold_start = meaningful_events < 3 or not profile_weights
    effective_exploration = max(payload.exploration_rate, 0.25) if cold_start else payload.exploration_rate

    ranked: list[dict[str, object]] = []
    for candidate in eligible:
        tokens = _candidate_tokens(candidate)
        affinity = _normalize_affinity(
            sum(profile_weights[token] for token in tokens) / math.sqrt(max(1, len(tokens)))
        )
        sequence = _normalize_affinity(
            sum(sequence_weights[token] for token in tokens) / math.sqrt(max(1, len(tokens)))
        )
        components = {
            "affinity": affinity,
            "sequence": sequence,
            "price_alignment": _price_alignment(candidate.price_gbp, median_price),
            "freshness": _freshness(candidate, as_of),
            "quality": candidate.quality_score,
            "popularity": candidate.popularity_score,
            "seller_trust": candidate.seller_trust_score,
        }
        if cold_start:
            utility = (
                0.32 * components["quality"]
                + 0.27 * components["popularity"]
                + 0.23 * components["freshness"]
                + 0.18 * components["seller_trust"]
            )
        else:
            utility = (
                0.34 * components["affinity"]
                + 0.18 * components["sequence"]
                + 0.14 * components["price_alignment"]
                + 0.12 * components["quality"]
                + 0.09 * components["popularity"]
                + 0.07 * components["freshness"]
                + 0.06 * components["seller_trust"]
            )
        ranked.append(
            {
                "candidate": candidate,
                "tokens": tokens,
                "components": components,
                "utility": min(1.0, max(0.0, utility)),
            }
        )

    # Stable sorting makes identical requests reproducible across processes.
    ranked.sort(key=lambda row: (-float(row["utility"]), str(row["candidate"].listing_id)))
    target = min(payload.result_limit, len(ranked))
    explore_target = min(target // 2, round(target * effective_exploration))
    explore_positions = {
        max(1, round((index + 1) * target / (explore_target + 1)))
        for index in range(explore_target)
    }

    selected: list[tuple[dict[str, object], str]] = []
    remaining = ranked.copy()
    seller_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    constraints_relaxed = False

    def choose(policy: str, enforce_constraints: bool) -> int | None:
        best_index: int | None = None
        best_value = -1.0
        selected_tokens = [row["tokens"] for row, _ in selected]
        for index, row in enumerate(remaining):
            candidate = row["candidate"]
            seller_key = candidate.seller_id or f"unknown:{candidate.listing_id}"
            category_key = candidate.category.strip().lower() or f"unknown:{candidate.listing_id}"
            if enforce_constraints and (
                seller_counts[seller_key] >= payload.max_per_seller
                or category_counts[category_key] >= payload.max_per_category
            ):
                continue
            utility = float(row["utility"])
            novelty = (
                1.0
                if not selected_tokens
                else min(_jaccard_distance(row["tokens"], tokens) for tokens in selected_tokens)
            )
            uncertainty = 1.0 - abs(utility - 0.5) * 2.0
            value = (
                0.58 * novelty + 0.24 * uncertainty + 0.18 * utility
                if policy == "explore"
                else 0.86 * utility + 0.14 * novelty
            )
            if value > best_value:
                best_value = value
                best_index = index
        return best_index

    while len(selected) < target and remaining:
        policy = "explore" if len(selected) + 1 in explore_positions else "exploit"
        chosen_index = choose(policy, enforce_constraints=True)
        if chosen_index is None:
            constraints_relaxed = True
            chosen_index = choose(policy, enforce_constraints=False)
        if chosen_index is None:
            break
        row = remaining.pop(chosen_index)
        candidate = row["candidate"]
        seller_counts[candidate.seller_id or f"unknown:{candidate.listing_id}"] += 1
        category_counts[candidate.category.strip().lower() or f"unknown:{candidate.listing_id}"] += 1
        selected.append((row, policy))

    items: list[RecommendationItem] = []
    for position, (row, policy) in enumerate(selected, start=1):
        components = {key: round(value, 6) for key, value in row["components"].items()}
        utility = float(row["utility"])
        score = utility if policy == "exploit" else min(1.0, 0.82 * utility + 0.08)
        items.append(
            RecommendationItem(
                listing_id=row["candidate"].listing_id,
                score=round(score, 6),
                model="heuristic_ranker_v2" if policy == "exploit" else "novelty_exploration_v2",
                policy=policy,
                position=position,
                reason_codes=_reason_codes(components, cold_start),
                component_scores=components,
            )
        )

    metadata = RecommendationMetadata(
        request_id=request_id,
        policy_version=POLICY_VERSION,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        capability_level="heuristic_baseline",
        trained_model=False,
        generated_at=as_of,
        candidate_count=len(input_candidates),
        eligible_count=len(eligible),
        result_count=len(items),
        exploration_rate=effective_exploration,
        cold_start=cold_start,
        diagnostics=RecommendationDiagnostics(
            duplicate_candidates_removed=duplicates_removed,
            unavailable_candidates_removed=unavailable_removed,
            explicitly_excluded_candidates=explicit_removed,
            purchased_candidates_removed=purchased_removed,
            constraints_relaxed=constraints_relaxed,
        ),
    )
    return RecommendationResponse(decision=metadata, recommendations=items)
