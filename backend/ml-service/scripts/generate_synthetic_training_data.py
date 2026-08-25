"""Generate synthetic learning-to-rank training data for the ranking pipeline.

The synthetic data uses the same seven interpretable features as the heuristic
ranker (affinity, sequence, price_alignment, freshness, quality, popularity,
seller_trust) and produces graded labels (0-4) following the report's outcome
table:

    0 — viewable impression with rapid skip
    1 — qualified detail view / dwell
    2 — share, seller/profile exploration, board save
    3 — wishlist, offer, basket, meaningful seller message
    4 — completed purchase after attribution window

Labels are generated from a noisy linear combination of the features plus
position bias, so the training pipeline can be exercised end-to-end before
real traffic data exists.

Usage:
    python -m scripts.generate_synthetic_training_data \
        --output data/ --n-requests 100 --n-candidates 20
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
import random
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ranking import RANKING_FEATURES


# Outcome grade mapping per the report §4.3
OUTCOME_GRADES = {
    "rapid_skip": 0,
    "qualified_detail_view": 1,
    "share": 2,
    "save": 2,
    "open_seller_profile": 2,
    "wishlist": 3,
    "offer_started": 3,
    "add_to_basket": 3,
    "message_seller_started": 3,
    "purchase": 4,
}

# Feature weights used to generate labels (the "true" model the LTR model tries to learn)
TRUE_WEIGHTS = {
    "affinity": 1.8,
    "sequence": 1.2,
    "price_alignment": 0.9,
    "freshness": 0.6,
    "quality": 1.5,
    "popularity": 1.1,
    "seller_trust": 0.8,
}

CATEGORIES = ["outerwear", "bags", "shoes", "dresses", "accessories", "knitwear", "denim"]
BRANDS = ["Acme", "Nova", "Atelier", "Muse", "Run", "Time", "Loom", "Forge"]
SIZES = ["XS", "S", "M", "L", "XL"]
CONDITIONS = ["new", "like_new", "good", "fair"]


def _hash_int(seed: str) -> int:
    return int(hashlib.md5(seed.encode()).hexdigest(), 16)


def _seeded_rng(request_index: int) -> random.Random:
    return random.Random(_hash_int(f"thryftverse-synthetic-{request_index}"))


def _generate_candidate(rng: random.Random, listing_index: int, as_of: datetime) -> dict:
    """Generate a single candidate listing with realistic attributes."""
    age_days = rng.uniform(0, 60)
    created_at = as_of - timedelta(days=age_days)
    category = rng.choice(CATEGORIES)
    brand = rng.choice(BRANDS)
    return {
        "listing_id": f"syn_listing_{listing_index}",
        "seller_id": f"seller_{rng.randint(1, 15)}",
        "title": f"{brand} {category} item {listing_index}",
        "description": f"A {rng.choice(CONDITIONS)} {brand} {category} for sale.",
        "category": category,
        "brand": brand,
        "size": rng.choice(SIZES),
        "condition": rng.choice(CONDITIONS),
        "price_gbp": round(rng.uniform(15, 150), 2),
        "created_at": created_at.isoformat(),
        "quality_score": round(rng.uniform(0.3, 0.98), 4),
        "popularity_score": round(rng.uniform(0.0, 0.95), 4),
        "seller_trust_score": round(rng.uniform(0.4, 0.95), 4),
        "available": True,
    }


def _generate_interactions(rng: random.Random, user_id: str, as_of: datetime) -> list[dict]:
    """Generate 0-6 recent interactions for a user."""
    n_interactions = rng.randint(0, 6)
    interactions: list[dict] = []
    for i in range(n_interactions):
        age_days = rng.uniform(0.5, 30)
        category = rng.choice(CATEGORIES)
        brand = rng.choice(BRANDS)
        interactions.append(
            {
                "listing_id": f"hist_{user_id}_{i}",
                "action": rng.choice(["view", "wishlist", "purchase"]),
                "strength": round(rng.uniform(0.5, 2.0), 2),
                "created_at": (as_of - timedelta(days=age_days)).isoformat(),
                "title": f"{brand} {category} history",
                "description": "",
                "category": category,
                "brand": brand,
                "size": rng.choice(SIZES),
                "condition": rng.choice(CONDITIONS),
                "price_gbp": round(rng.uniform(20, 120), 2),
            }
        )
    return interactions


def _compute_features(
    candidates: list[dict],
    interactions: list[dict],
    as_of: datetime,
) -> list[dict]:
    """Compute the seven ranking features for each candidate.

    This mirrors the heuristic ranker's feature computation but operates on
    raw dicts so the generator has no dependency on the full Pydantic request
    path.
    """
    token_pattern = re.compile(r"[a-z0-9]+")
    action_weights = {"view": 1.0, "wishlist": 2.8, "purchase": 4.5}
    action_half_life = {"view": 7.0, "wishlist": 21.0, "purchase": 60.0}

    def tokens_for(title: str, desc: str, category: str, brand: str, size: str, cond: str) -> set[str]:
        toks = set(token_pattern.findall(f"{title} {desc}".lower()))
        for prefix, value in (("category", category), ("brand", brand), ("size", size), ("condition", cond)):
            norm = "_".join(token_pattern.findall(value.lower()))
            if norm:
                toks.add(f"{prefix}:{norm}")
        return toks

    profile_w: Counter[str] = Counter()
    seq_w: Counter[str] = Counter()
    prices: list[float] = []

    ordered = sorted(interactions, key=lambda e: e["created_at"], reverse=True)
    for seq_idx, event in enumerate(ordered):
        age_days = max(0.0, (as_of - datetime.fromisoformat(event["created_at"].replace("Z", "+00:00"))).total_seconds() / 86400)
        decay = math.pow(0.5, age_days / action_half_life[event["action"]])
        weight = min(8.0, action_weights[event["action"]] * min(event["strength"], 3.0) * decay)
        toks = tokens_for(event["title"], event["description"], event["category"], event["brand"], event["size"], event["condition"])
        for t in toks:
            profile_w[t] += weight
            seq_w[t] += weight * math.exp(-seq_idx / 6.0)
        if event.get("price_gbp"):
            prices.append(event["price_gbp"])

    median_price = float(np.median(prices)) if prices else None
    meaningful = sum(
        min(8.0, action_weights[e["action"]] * min(e["strength"], 3.0) *
            math.pow(0.5, max(0.0, (as_of - datetime.fromisoformat(e["created_at"].replace("Z", "+00:00"))).total_seconds() / 86400) / action_half_life[e["action"]]))
        >= 0.15
        for e in ordered
    )
    cold_start = meaningful < 3 or not profile_w

    def normalize_affinity(raw: float) -> float:
        return 1.0 - math.exp(-max(0.0, raw) / 5.0)

    def price_alignment(price: float, med: float | None) -> float:
        if price <= 0 or med is None or med <= 0:
            return 0.5
        return math.exp(-1.25 * abs(math.log(max(price, 0.01) / med)))

    def freshness(created_iso: str) -> float:
        created = datetime.fromisoformat(created_iso.replace("Z", "+00:00"))
        age = max(0.0, (as_of - created).total_seconds() / 86400)
        return math.exp(-age / 28.0)

    rows: list[dict] = []
    for cand in candidates:
        toks = tokens_for(cand["title"], cand["description"], cand["category"], cand["brand"], cand["size"], cand["condition"])
        if not toks:
            toks = {f"listing:{cand['listing_id'].lower()}"}
        affinity = normalize_affinity(sum(profile_w[t] for t in toks) / math.sqrt(max(1, len(toks))))
        sequence = normalize_affinity(sum(seq_w[t] for t in toks) / math.sqrt(max(1, len(toks))))
        features = {
            "affinity": round(affinity, 6),
            "sequence": round(sequence, 6),
            "price_alignment": round(price_alignment(cand["price_gbp"], median_price), 6),
            "freshness": round(freshness(cand["created_at"]), 6),
            "quality": cand["quality_score"],
            "popularity": cand["popularity_score"],
            "seller_trust": cand["seller_trust_score"],
        }
        rows.append({"listing_id": cand["listing_id"], "features": features, "cold_start": cold_start})
    return rows


def _generate_label(rng: random.Random, features: dict[str, float], position: int, cold_start: bool) -> int:
    """Generate a graded label (0-4) from features plus position bias and noise.

    The label is a noisy function of the true feature weights, with a position
    bias that makes higher-ranked candidates more likely to receive higher
    grades (mirroring real-world position bias in implicit feedback).
    """
    utility = sum(TRUE_WEIGHTS.get(name, 0.0) * features.get(name, 0.0) for name in RANKING_FEATURES)
    # Position bias: top positions get a boost
    position_bias = 1.0 / math.log2(position + 2)
    # Cold-start candidates get slightly noisier labels
    noise_scale = 0.8 if cold_start else 0.5
    noise = rng.gauss(0, noise_scale)
    score = utility * 0.6 + position_bias * 1.5 + noise
    # Map to grade 0-4
    if score < 1.0:
        return 0
    elif score < 2.0:
        return 1
    elif score < 3.0:
        return 2
    elif score < 4.5:
        return 3
    else:
        return 4


def generate_dataset(
    n_requests: int,
    n_candidates: int,
    as_of: datetime | None = None,
    seed: int = 42,
) -> list[dict]:
    """Generate a full training dataset as a list of JSONL records.

    Each record: {request_id, user_id, listing_id, features, label, group}
    """
    if as_of is None:
        as_of = datetime(2026, 8, 24, 12, tzinfo=timezone.utc)

    records: list[dict] = []
    listing_counter = 0
    for req_idx in range(n_requests):
        rng = _seeded_rng(req_idx + seed)
        user_id = f"syn_user_{req_idx}"
        request_id = f"syn_req_{req_idx}"

        candidates = []
        for c_idx in range(n_candidates):
            listing_counter += 1
            candidates.append(_generate_candidate(rng, listing_counter, as_of))

        interactions = _generate_interactions(rng, user_id, as_of)
        feature_rows = _compute_features(candidates, interactions, as_of)

        # Sort by a heuristic-like utility to assign positions (position bias)
        for row in feature_rows:
            row["utility"] = sum(
                TRUE_WEIGHTS.get(name, 0.0) * row["features"].get(name, 0.0)
                for name in RANKING_FEATURES
            )
        feature_rows.sort(key=lambda r: (-r["utility"], r["listing_id"]))

        for position, row in enumerate(feature_rows, start=1):
            label = _generate_label(rng, row["features"], position, row["cold_start"])
            records.append(
                {
                    "request_id": request_id,
                    "user_id": user_id,
                    "listing_id": row["listing_id"],
                    "features": row["features"],
                    "label": label,
                    "group": request_id,
                    "position": position,
                    "cold_start": row["cold_start"],
                }
            )

    return records


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate synthetic LTR training data for the ranking pipeline."
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/",
        help="Output directory for train.jsonl and eval.jsonl",
    )
    parser.add_argument("--n-requests", type=int, default=100, help="Number of recommendation requests (groups)")
    parser.add_argument("--n-candidates", type=int, default=20, help="Candidates per request")
    parser.add_argument("--eval-ratio", type=float, default=0.2, help="Fraction of requests for evaluation")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    n_eval = max(1, int(args.n_requests * args.eval_ratio))
    n_train = args.n_requests - n_eval

    print(f"Generating {n_train} train + {n_eval} eval requests "
          f"({args.n_candidates} candidates each)...")

    train_records = generate_dataset(n_train, args.n_candidates, seed=args.seed)
    eval_records = generate_dataset(n_eval, args.n_candidates, seed=args.seed + 10_000)

    train_path = output_dir / "train.jsonl"
    eval_path = output_dir / "eval.jsonl"

    with open(train_path, "w", encoding="utf-8") as fh:
        for rec in train_records:
            fh.write(json.dumps(rec) + "\n")

    with open(eval_path, "w", encoding="utf-8") as fh:
        for rec in eval_records:
            fh.write(json.dumps(rec) + "\n")

    # Summary stats
    train_labels = [r["label"] for r in train_records]
    eval_labels = [r["label"] for r in eval_records]
    print(f"Wrote {len(train_records)} train records to {train_path}")
    print(f"Wrote {len(eval_records)} eval records to {eval_path}")
    print(f"Train label distribution: {dict(sorted(__count_labels(train_labels).items()))}")
    print(f"Eval label distribution:  {dict(sorted(__count_labels(eval_labels).items()))}")
    return 0


def __count_labels(labels: list[int]) -> dict[int, int]:
    counts: dict[int, int] = {}
    for label in labels:
        counts[label] = counts.get(label, 0) + 1
    return counts


if __name__ == "__main__":
    raise SystemExit(main())
