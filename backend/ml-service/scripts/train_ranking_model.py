"""LightGBM learning-to-rank training and evaluation CLI.

Trains both LambdaRank and XE-NDCG-MART models on JSONL training data, evaluates
them against the heuristic baseline using NDCG@K, MRR, and Recall@K, and saves
the winning model artifact with a manifest and model card.

The training data format is one JSON object per line:
    {"request_id": "...", "user_id": "...", "listing_id": "...",
     "features": {"affinity": 0.1, ...}, "label": 3, "group": "request_id"}

Usage:
    python -m scripts.train_ranking_model \
        --train-data data/train.jsonl \
        --eval-data data/eval.jsonl \
        --output artifacts/
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.evaluation import ndcg_at_k, reciprocal_rank, recall_at_k
from app.ranking import FEATURE_SCHEMA_VERSION, POLICY_VERSION, RANKING_FEATURES


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_jsonl(path: str) -> list[dict[str, Any]]:
    """Load a JSONL file into a list of records."""
    records: list[dict[str, Any]] = []
    with open(path, encoding="utf-8") as fh:
        for line_num, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSON at {path}:{line_num}: {exc}") from exc
    return records


def file_sha256(path: str) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            sha.update(chunk)
    return sha.hexdigest()


def data_hash(records: list[dict[str, Any]]) -> str:
    """Stable hash of the training data content."""
    content = json.dumps(records, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(content.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Dataset construction for LightGBM
# ---------------------------------------------------------------------------


def build_lgb_dataset(
    records: list[dict[str, Any]],
) -> tuple[list[list[float]], list[int], list[int]]:
    """Convert JSONL records into (features, labels, groups) for LightGBM.

    Groups are per-request_id, sorted so consecutive rows share a group.
    Returns feature matrix as list of lists, integer labels, and group sizes.
    """
    # Group records by request_id, preserving a stable order
    by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for rec in records:
        group = rec.get("group") or rec["request_id"]
        by_group[group].append(rec)

    features: list[list[float]] = []
    labels: list[int] = []
    groups: list[int] = []

    for group_id in sorted(by_group.keys()):
        group_records = by_group[group_id]
        groups.append(len(group_records))
        for rec in group_records:
            row = [float(rec["features"].get(name, 0.0)) for name in RANKING_FEATURES]
            features.append(row)
            labels.append(int(rec["label"]))

    return features, labels, groups


# ---------------------------------------------------------------------------
# Heuristic baseline scoring (for comparison)
# ---------------------------------------------------------------------------


def heuristic_rank(records: list[dict[str, Any]]) -> dict[str, list[str]]:
    """Produce the heuristic baseline ranking for each group.

    The heuristic uses the same linear weights as the ranker's cold-start /
    personalised utility. Returns {group_id: [listing_id, ...]} sorted by
    descending utility.
    """
    by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for rec in records:
        group = rec.get("group") or rec["request_id"]
        by_group[group].append(rec)

    rankings: dict[str, list[str]] = {}
    for group_id, group_records in by_group.items():
        # Compute heuristic utility (mirrors the cold-start weights when no
        # affinity signal exists, which is the case for synthetic data)
        scored = []
        for rec in group_records:
            f = rec["features"]
            utility = (
                0.34 * f.get("affinity", 0.0)
                + 0.18 * f.get("sequence", 0.0)
                + 0.14 * f.get("price_alignment", 0.0)
                + 0.12 * f.get("quality", 0.0)
                + 0.09 * f.get("popularity", 0.0)
                + 0.07 * f.get("freshness", 0.0)
                + 0.06 * f.get("seller_trust", 0.0)
            )
            scored.append((utility, rec["listing_id"]))
        scored.sort(key=lambda x: (-x[0], x[1]))
        rankings[group_id] = [lid for _, lid in scored]
    return rankings


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate_ranking(
    predictions_by_group: dict[str, list[tuple[str, float]]],
    records: list[dict[str, Any]],
    k: int = 10,
) -> dict[str, float]:
    """Evaluate predicted rankings against graded labels using NDCG@K, MRR, Recall@K.

    NDCG uses graded gains (2^label - 1) per the standard LTR formulation.
    MRR and Recall use a relevance threshold (label >= 2 is "relevant").
    """
    # Build label lookup: (group, listing_id) -> label
    label_map: dict[str, dict[str, int]] = defaultdict(dict)
    for rec in records:
        group = rec.get("group") or rec["request_id"]
        label_map[group][rec["listing_id"]] = int(rec["label"])

    ndcg_scores: list[float] = []
    mrr_scores: list[float] = []
    recall_scores: list[float] = []

    for group_id, ranked in predictions_by_group.items():
        labels = label_map.get(group_id, {})
        if not labels:
            continue
        ranked_ids = [lid for lid, _ in ranked]

        # Graded NDCG@K
        ndcg_scores.append(_graded_ndcg_at_k(ranked_ids, labels, k))

        # Binary relevance for MRR and Recall (label >= 2)
        relevant = {lid for lid, label in labels.items() if label >= 2}
        mrr_scores.append(reciprocal_rank(ranked_ids, relevant))
        recall_scores.append(recall_at_k(ranked_ids, relevant, k))

    n = max(1, len(ndcg_scores))
    return {
        "ndcg_at_k": sum(ndcg_scores) / n,
        "mrr": sum(mrr_scores) / n,
        "recall_at_k": sum(recall_scores) / n,
        "n_groups": len(ndcg_scores),
    }


def _graded_ndcg_at_k(ranked_ids: list[str], labels: dict[str, int], k: int) -> float:
    """NDCG@K with graded gains (2^label - 1)."""
    if not labels or k <= 0:
        return 0.0
    gains = [
        (2 ** labels.get(lid, 0) - 1) / math.log2(position + 2)
        for position, lid in enumerate(ranked_ids[:k])
    ]
    dcg = sum(gains)
    ideal_labels = sorted(labels.values(), reverse=True)[:k]
    idcg = sum((2 ** label - 1) / math.log2(pos + 2) for pos, label in enumerate(ideal_labels))
    return 0.0 if idcg == 0 else dcg / idcg


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def train_model(
    train_features: list[list[float]],
    train_labels: list[int],
    train_groups: list[int],
    eval_features: list[list[float]],
    eval_labels: list[int],
    eval_groups: list[int],
    objective: str,
    num_boost_round: int,
    learning_rate: float,
    num_leaves: int,
    seed: int,
) -> Any:
    """Train a LightGBM ranker with the given objective.

    objective: "lambdarank" or "rank_xendcg"
    """
    import lightgbm as lgb
    import numpy as np

    train_data = lgb.Dataset(
        np.array(train_features, dtype=np.float64),
        label=np.array(train_labels, dtype=np.int32),
        group=train_groups,
    )
    eval_data = lgb.Dataset(
        np.array(eval_features, dtype=np.float64),
        label=np.array(eval_labels, dtype=np.int32),
        group=eval_groups,
        reference=train_data,
    )

    params = {
        "objective": objective,
        "metric": "ndcg",
        "ndcg_eval_at": [10],
        "learning_rate": learning_rate,
        "num_leaves": num_leaves,
        "min_data_in_leaf": 10,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "lambda_l1": 0.1,
        "lambda_l2": 0.1,
        "verbose": -1,
        "seed": seed,
        "force_col_wise": True,
    }

    model = lgb.train(
        params,
        train_data,
        num_boost_round=num_boost_round,
        valid_sets=[eval_data],
        valid_names=["eval"],
        callbacks=[lgb.log_evaluation(period=50)],
    )
    return model


def predict_by_group(
    model: Any,
    features: list[list[float]],
    labels: list[int],
    groups: list[int],
    records: list[dict[str, Any]],
) -> dict[str, list[tuple[str, float]]]:
    """Score candidates and group predictions by request_id."""
    import numpy as np

    scores = model.predict(np.array(features, dtype=np.float64))
    # Walk groups to associate scores with listing_ids
    idx = 0
    predictions: dict[str, list[tuple[str, float]]] = {}
    rec_idx = 0
    for group_size in groups:
        group_records = records[rec_idx : rec_idx + group_size]
        group_preds: list[tuple[str, float]] = []
        for i in range(group_size):
            lid = group_records[i]["listing_id"]
            group_preds.append((lid, float(scores[idx + i])))
        group_id = group_records[0].get("group") or group_records[0]["request_id"]
        group_preds.sort(key=lambda x: (-x[1], x[0]))
        predictions[group_id] = group_preds
        idx += group_size
        rec_idx += group_size
    return predictions


# ---------------------------------------------------------------------------
# Artifact saving
# ---------------------------------------------------------------------------


def save_artifact(
    model: Any,
    objective: str,
    output_dir: Path,
    train_hash: str,
    eval_metrics: dict[str, float],
    feature_importance: dict[str, float],
) -> tuple[str, str, dict[str, Any]]:
    """Save the model and manifest. Returns (model_path, manifest_path, manifest_dict)."""
    import lightgbm as lgb

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model_id = f"lightgbm-{objective}"
    model_version = f"v1-{timestamp}"

    model_filename = f"{model_id}-{model_version}.txt"
    manifest_filename = f"{model_id}-{model_version}.manifest.json"

    model_path = output_dir / model_filename
    manifest_path = output_dir / manifest_filename

    model.save_model(str(model_path))
    artifact_hash = file_sha256(str(model_path))

    manifest = {
        "model_id": model_id,
        "model_version": model_version,
        "objective": objective,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "feature_names": list(RANKING_FEATURES),
        "artifact_sha256": artifact_hash,
        "training_data_hash": train_hash,
        "training_code_commit": os.environ.get("GIT_COMMIT"),
        "evaluation_metrics": eval_metrics,
        "created_at": timestamp,
    }

    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)

    return str(model_path), str(manifest_path), manifest


def save_model_card(
    output_dir: Path,
    manifest: dict[str, Any],
    all_metrics: dict[str, dict[str, float]],
    feature_importance: dict[str, float],
    train_hash: str,
    eval_hash: str,
) -> str:
    """Save a model card JSON with metrics, feature importance, and lineage."""
    card = {
        "model_id": manifest["model_id"],
        "model_version": manifest["model_version"],
        "objective": manifest["objective"],
        "feature_schema_version": manifest["feature_schema_version"],
        "policy_version_baseline": POLICY_VERSION,
        "artifact_sha256": manifest["artifact_sha256"],
        "training_data_hash": train_hash,
        "eval_data_hash": eval_hash,
        "training_code_commit": manifest.get("training_code_commit"),
        "created_at": manifest["created_at"],
        "evaluation": all_metrics,
        "feature_importance": feature_importance,
        "feature_names": list(RANKING_FEATURES),
        "lineage": {
            "baseline_policy": POLICY_VERSION,
            "feature_schema": FEATURE_SCHEMA_VERSION,
            "training_data_format": "jsonl",
            "label_definition": "graded_outcome_0_to_4",
            "label_grades": {
                "0": "viewable impression with rapid skip",
                "1": "qualified detail view/dwell",
                "2": "share, seller/profile exploration, board save",
                "3": "wishlist, offer, basket, meaningful seller message",
                "4": "completed purchase after attribution window",
            },
        },
        "safety": {
            "shadow_only": True,
            "affects_user_responses": False,
            "rollback_policy": "heuristic baseline remains champion",
        },
    }
    card_path = output_dir / f"{manifest['model_id']}-{manifest['model_version']}.card.json"
    with open(card_path, "w", encoding="utf-8") as fh:
        json.dump(card, fh, indent=2, sort_keys=True)
    return str(card_path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Train LightGBM LambdaRank and XE-NDCG-MART ranking models."
    )
    parser.add_argument("--train-data", type=str, required=True, help="Path to training JSONL")
    parser.add_argument("--eval-data", type=str, required=True, help="Path to evaluation JSONL")
    parser.add_argument("--output", type=str, default="artifacts/", help="Output directory for artifacts")
    parser.add_argument("--num-boost-round", type=int, default=200, help="Number of boosting rounds")
    parser.add_argument("--learning-rate", type=float, default=0.05, help="Learning rate")
    parser.add_argument("--num-leaves", type=int, default=31, help="Max leaves per tree")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--ndcg-k", type=int, default=10, help="K for NDCG@K evaluation")
    args = parser.parse_args()

    try:
        import lightgbm as lgb  # noqa: F401
    except ImportError:
        print(
            "ERROR: lightgbm is not installed. Install with:\n"
            "  pip install -r requirements-ml.txt\n"
            "  or: pip install lightgbm scikit-learn",
            file=sys.stderr,
        )
        return 2

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load data
    print(f"Loading training data from {args.train_data}...")
    train_records = load_jsonl(args.train_data)
    print(f"  {len(train_records)} training records")

    print(f"Loading evaluation data from {args.eval_data}...")
    eval_records = load_jsonl(args.eval_data)
    print(f"  {len(eval_records)} evaluation records")

    train_hash = data_hash(train_records)
    eval_hash = data_hash(eval_records)
    print(f"  train data hash: {train_hash[:16]}...")
    print(f"  eval data hash:  {eval_hash[:16]}...")

    # Build LightGBM datasets
    train_features, train_labels, train_groups = build_lgb_dataset(train_records)
    eval_features, eval_labels, eval_groups = build_lgb_dataset(eval_records)
    print(f"  train: {len(train_groups)} groups, {len(train_features)} rows")
    print(f"  eval:  {len(eval_groups)} groups, {len(eval_features)} rows")

    # Heuristic baseline evaluation
    print("\n--- Heuristic baseline ---")
    heuristic_rankings = heuristic_rank(eval_records)
    heuristic_preds = {g: [(lid, 0.0) for lid in lids] for g, lids in heuristic_rankings.items()}
    heuristic_metrics = evaluate_ranking(heuristic_preds, eval_records, k=args.ndcg_k)
    print(f"  NDCG@{args.ndcg_k}: {heuristic_metrics['ndcg_at_k']:.4f}")
    print(f"  MRR:       {heuristic_metrics['mrr']:.4f}")
    print(f"  Recall@{args.ndcg_k}: {heuristic_metrics['recall_at_k']:.4f}")

    all_metrics: dict[str, dict[str, float]] = {"heuristic_baseline": heuristic_metrics}

    # Train both objectives
    objectives = ["lambdarank", "rank_xendcg"]
    trained_models: dict[str, Any] = {}
    model_metrics: dict[str, dict[str, float]] = {}

    for objective in objectives:
        print(f"\n--- Training {objective} ---")
        model = train_model(
            train_features,
            train_labels,
            train_groups,
            eval_features,
            eval_labels,
            eval_groups,
            objective=objective,
            num_boost_round=args.num_boost_round,
            learning_rate=args.learning_rate,
            num_leaves=args.num_leaves,
            seed=args.seed,
        )
        trained_models[objective] = model

        # Evaluate
        # Re-sort eval records by group to match the dataset construction order
        eval_by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for rec in eval_records:
            group = rec.get("group") or rec["request_id"]
            eval_by_group[group].append(rec)
        sorted_eval_records: list[dict[str, Any]] = []
        for group_id in sorted(eval_by_group.keys()):
            sorted_eval_records.extend(eval_by_group[group_id])

        predictions = predict_by_group(
            model, eval_features, eval_labels, eval_groups, sorted_eval_records
        )
        metrics = evaluate_ranking(predictions, eval_records, k=args.ndcg_k)
        model_metrics[objective] = metrics
        all_metrics[objective] = metrics
        print(f"  NDCG@{args.ndcg_k}: {metrics['ndcg_at_k']:.4f}")
        print(f"  MRR:       {metrics['mrr']:.4f}")
        print(f"  Recall@{args.ndcg_k}: {metrics['recall_at_k']:.4f}")

    # Select winner: highest NDCG@K
    print("\n--- Model selection ---")
    best_objective = max(
        model_metrics,
        key=lambda obj: model_metrics[obj]["ndcg_at_k"],
    )
    best_metrics = model_metrics[best_objective]
    print(f"  Winner: {best_objective} (NDCG@{args.ndcg_k}={best_metrics['ndcg_at_k']:.4f})")

    # Compare against heuristic
    heuristic_ndcg = heuristic_metrics["ndcg_at_k"]
    challenger_ndcg = best_metrics["ndcg_at_k"]
    if challenger_ndcg > heuristic_ndcg:
        print(f"  Challenger beats heuristic: {challenger_ndcg:.4f} > {heuristic_ndcg:.4f}")
    else:
        print(f"  Heuristic remains champion: {heuristic_ndcg:.4f} >= {challenger_ndcg:.4f}")
        print("  (Saving challenger artifact for shadow comparison anyway)")

    # Feature importance
    best_model = trained_models[best_objective]
    importance = best_model.feature_importance(importance_type="gain")
    feature_importance = {
        name: float(imp) for name, imp in zip(RANKING_FEATURES, importance)
    }
    print("\n  Feature importance (gain):")
    for name, imp in sorted(feature_importance.items(), key=lambda x: -x[1]):
        print(f"    {name:20s} {imp:.2f}")

    # Save winning artifact
    model_path, manifest_path, manifest = save_artifact(
        best_model,
        best_objective,
        output_dir,
        train_hash,
        best_metrics,
        feature_importance,
    )
    print(f"\n  Model saved:     {model_path}")
    print(f"  Manifest saved:  {manifest_path}")

    # Save model card
    card_path = save_model_card(
        output_dir,
        manifest,
        all_metrics,
        feature_importance,
        train_hash,
        eval_hash,
    )
    print(f"  Model card saved: {card_path}")

    # Summary
    print("\n=== Training complete ===")
    print(f"  Champion (heuristic) NDCG@{args.ndcg_k}: {heuristic_ndcg:.4f}")
    for obj in objectives:
        print(f"  {obj} NDCG@{args.ndcg_k}: {model_metrics[obj]['ndcg_at_k']:.4f}")
    print(f"  Winner: {best_objective}")
    print(f"  Artifact: {model_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
