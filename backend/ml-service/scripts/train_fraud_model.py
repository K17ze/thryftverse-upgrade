"""LightGBM fraud classification training and evaluation CLI.

Trains a LightGBM binary classifier on data from the ``fraud_scoring_ledger``
table (migration 148), evaluates it against the rule-engine baseline using
precision, recall, F1, AUC-ROC, and calibration (Brier score), and saves the
winning model artifact with a manifest and model card.

The training data is read from Postgres via psycopg. Each row in
``fraud_scoring_ledger`` contains the rule-engine score, signals, and
shadow features. Labels come from a join with the fraud reports / manual
review outcomes table (or a synthetic label derived from the rule-engine
action when ground-truth labels are not yet available).

Usage:
    python -m scripts.train_fraud_model \\
        --dsn postgresql://user:pass@host/db \\
        --output artifacts/

When ground-truth labels are unavailable (early deployment), the script can
generate synthetic labels from the rule-engine action for end-to-end pipeline
validation:
    python -m scripts.train_fraud_model \\
        --dsn postgresql://user:pass@host/db \\
        --output artifacts/ \\
        --synthetic-labels
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.fraud_model_loader import (
    FRAUD_FEATURES,
    FRAUD_FEATURE_SCHEMA_VERSION,
    SHADOW_AUTO_APPROVE_THRESHOLD,
    SHADOW_AUTO_BLOCK_THRESHOLD,
)


# ---------------------------------------------------------------------------
# Data loading from Postgres
# ---------------------------------------------------------------------------


def load_ledger_data(
    dsn: str,
    limit: int,
    use_synthetic_labels: bool,
) -> list[dict[str, Any]]:
    """Load training data from the fraud_scoring_ledger table.

    Each row is converted to a feature vector + label. When
    ``use_synthetic_labels`` is True, the label is derived from the
    rule-engine action (block → 1, allow → 0, flag → 1 with probability 0.5).
    In production, labels should come from a join with the manual review
    outcomes or chargeback table.
    """
    try:
        import psycopg
    except ImportError:
        print(
            "ERROR: psycopg is not installed. Install with:\n"
            "  pip install psycopg[binary]",
            file=sys.stderr,
        )
        sys.exit(2)

    label_clause = (
        """
        CASE
          WHEN rule_engine_action = 'block' THEN 1
          WHEN rule_engine_action = 'allow' THEN 0
          WHEN rule_engine_action = 'flag' THEN
            CASE WHEN random() < 0.5 THEN 1 ELSE 0 END
          ELSE 0
        END AS label
        """
        if use_synthetic_labels
        else "NULL::int AS label"
    )

    query = f"""
        SELECT
          id,
          event_id,
          event_type,
          user_id,
          rule_engine_score,
          rule_engine_level,
          rule_engine_action,
          rule_engine_signals,
          shadow_features,
          {label_clause}
        FROM fraud_scoring_ledger
        WHERE rule_engine_score IS NOT NULL
        ORDER BY created_at DESC
        LIMIT %s
    """

    records: list[dict[str, Any]] = []
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(query, (limit,))
            columns = [desc[0] for desc in cur.description]
            for row in cur.fetchall():
                row_dict = dict(zip(columns, row))
                features = _extract_features_from_row(row_dict)
                label = row_dict.get("label")
                if label is None:
                    continue
                records.append(
                    {
                        "id": row_dict["id"],
                        "event_id": row_dict["event_id"],
                        "event_type": row_dict["event_type"],
                        "features": features,
                        "label": int(label),
                        "rule_engine_score": row_dict["rule_engine_score"],
                        "rule_engine_action": row_dict["rule_engine_action"],
                    }
                )

    return records


def _extract_features_from_row(row: dict[str, Any]) -> dict[str, float]:
    """Extract the fraud feature vector from a ledger row.

    Uses the ``shadow_features`` JSONB if available (it was computed by the
    ml-service at scoring time), otherwise reconstructs from the signals.
    """
    shadow_features = row.get("shadow_features")
    if isinstance(shadow_features, dict):
        return {
            name: float(shadow_features.get(name, 0.0))
            for name in FRAUD_FEATURES
        }

    # Fallback: reconstruct from rule_engine_signals
    signals = row.get("rule_engine_signals") or []
    signal_ids = {s.get("ruleId") for s in signals if isinstance(s, dict)}
    rule_score = float(row.get("rule_engine_score") or 0)
    return {
        "rule_engine_score": rule_score,
        "signal_count": float(len(signals)),
        "velocity_account_creation": float(
            next(
                (s.get("observedValue", 0) for s in signals
                 if isinstance(s, dict) and s.get("ruleId") == "velocity.account_creation"),
                0,
            )
        ),
        "velocity_listing_creation": float(
            next(
                (s.get("observedValue", 0) for s in signals
                 if isinstance(s, dict) and s.get("ruleId") == "velocity.listing_creation"),
                0,
            )
        ),
        "velocity_message": float(
            next(
                (s.get("observedValue", 0) for s in signals
                 if isinstance(s, dict) and s.get("ruleId") == "velocity.message"),
                0,
            )
        ),
        "velocity_login_attempt": float(
            next(
                (s.get("observedValue", 0) for s in signals
                 if isinstance(s, dict) and s.get("ruleId") == "velocity.login_attempt"),
                0,
            )
        ),
        "account_age_seconds": -1.0,
        "amount_gbp": 0.0,
        "ip_blacklisted": 1.0 if "ip.blacklist" in signal_ids else 0.0,
        "disposable_email": 1.0 if "email.disposable_domain" in signal_ids else 0.0,
        "new_account": 1.0 if "account.age.new" in signal_ids else 0.0,
        "missing_user_agent": 1.0 if "behavioral.missing_user_agent" in signal_ids else 0.0,
        "device_multiple_accounts": float(
            next(
                (s.get("observedValue", 0) for s in signals
                 if isinstance(s, dict) and s.get("ruleId") == "device.multiple_accounts"),
                0,
            )
        ),
        "high_value_new_account": 1.0 if "transaction.high_value_new_account" in signal_ids else 0.0,
    }


def load_jsonl(path: str) -> list[dict[str, Any]]:
    """Load a JSONL file into a list of records (alternative to Postgres)."""
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
# Dataset construction
# ---------------------------------------------------------------------------


def build_dataset(
    records: list[dict[str, Any]],
) -> tuple[list[list[float]], list[int]]:
    """Convert records into (features, labels) for LightGBM binary classification."""
    features: list[list[float]] = []
    labels: list[int] = []
    for rec in records:
        row = [float(rec["features"].get(name, 0.0)) for name in FRAUD_FEATURES]
        features.append(row)
        labels.append(int(rec["label"]))
    return features, labels


# ---------------------------------------------------------------------------
# Rule-engine baseline (for comparison)
# ---------------------------------------------------------------------------


def rule_engine_predictions(records: list[dict[str, Any]]) -> list[float]:
    """Produce the rule-engine baseline probabilities for comparison.

    Maps the rule-engine score (0-100) to a probability (0.0-1.0).
    """
    return [min(1.0, max(0.0, float(rec.get("rule_engine_score", 0)) / 100.0)) for rec in records]


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate_binary(
    y_true: list[int],
    y_pred_proba: list[float],
    threshold: float = 0.5,
) -> dict[str, float]:
    """Evaluate binary classification predictions.

    Returns precision, recall, F1, AUC-ROC, and Brier score (calibration).
    """
    from sklearn.metrics import (
        roc_auc_score,
        precision_score,
        recall_score,
        f1_score,
        brier_score_loss,
    )
    import numpy as np

    y_true_arr = np.array(y_true, dtype=np.int32)
    y_proba_arr = np.array(y_pred_proba, dtype=np.float64)
    y_pred_arr = (y_proba_arr >= threshold).astype(np.int32)

    metrics: dict[str, float] = {
        "precision": float(precision_score(y_true_arr, y_pred_arr, zero_division=0)),
        "recall": float(recall_score(y_true_arr, y_pred_arr, zero_division=0)),
        "f1": float(f1_score(y_true_arr, y_pred_arr, zero_division=0)),
        "brier_score": float(brier_score_loss(y_true_arr, y_proba_arr)),
    }

    # AUC-ROC requires both classes present
    if len(set(y_true)) > 1:
        metrics["auc_roc"] = float(roc_auc_score(y_true_arr, y_proba_arr))
    else:
        metrics["auc_roc"] = 0.0

    return metrics


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def train_model(
    train_features: list[list[float]],
    train_labels: list[int],
    eval_features: list[list[float]],
    eval_labels: list[int],
    num_boost_round: int,
    learning_rate: float,
    num_leaves: int,
    scale_pos_weight: float,
    seed: int,
) -> Any:
    """Train a LightGBM binary classifier."""
    import lightgbm as lgb
    import numpy as np

    train_data = lgb.Dataset(
        np.array(train_features, dtype=np.float64),
        label=np.array(train_labels, dtype=np.int32),
    )
    eval_data = lgb.Dataset(
        np.array(eval_features, dtype=np.float64),
        label=np.array(eval_labels, dtype=np.int32),
        reference=train_data,
    )

    params = {
        "objective": "binary",
        "metric": ["binary_logloss", "auc"],
        "learning_rate": learning_rate,
        "num_leaves": num_leaves,
        "min_data_in_leaf": 10,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "lambda_l1": 0.1,
        "lambda_l2": 0.1,
        "scale_pos_weight": scale_pos_weight,
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


def calibrate_predictions(
    model: Any,
    calib_features: list[list[float]],
    calib_labels: list[int],
) -> Any:
    """Fit isotonic regression calibration on a calibration split.

    Returns the calibration map (a callable that transforms raw probabilities
    into calibrated probabilities). If sklearn is unavailable or the
    calibration set is too small, returns an identity function.
    """
    import numpy as np

    try:
        from sklearn.isotonic import IsotonicRegression
    except ImportError:
        return lambda x: x

    if len(calib_labels) < 20 or len(set(calib_labels)) < 2:
        return lambda x: x

    raw_probs = model.predict(np.array(calib_features, dtype=np.float64))
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit(raw_probs, np.array(calib_labels, dtype=np.int32))
    return iso.predict


# ---------------------------------------------------------------------------
# Artifact saving
# ---------------------------------------------------------------------------


def save_artifact(
    model: Any,
    output_dir: Path,
    train_hash: str,
    eval_metrics: dict[str, float],
    feature_importance: dict[str, float],
    calibration_method: str | None,
    calibration_data_hash: str | None,
) -> tuple[str, str, dict[str, Any]]:
    """Save the model and manifest. Returns (model_path, manifest_path, manifest_dict)."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model_id = "lightgbm-fraud"
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
        "objective": "binary",
        "feature_schema_version": FRAUD_FEATURE_SCHEMA_VERSION,
        "feature_names": list(FRAUD_FEATURES),
        "artifact_sha256": artifact_hash,
        "training_data_hash": train_hash,
        "training_code_commit": os.environ.get("GIT_COMMIT"),
        "evaluation_metrics": eval_metrics,
        "created_at": timestamp,
        "calibration_method": calibration_method,
        "calibration_data_hash": calibration_data_hash,
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
        "artifact_sha256": manifest["artifact_sha256"],
        "training_data_hash": train_hash,
        "eval_data_hash": eval_hash,
        "training_code_commit": manifest.get("training_code_commit"),
        "created_at": manifest["created_at"],
        "evaluation": all_metrics,
        "feature_importance": feature_importance,
        "feature_names": list(FRAUD_FEATURES),
        "thresholds": {
            "auto_approve": SHADOW_AUTO_APPROVE_THRESHOLD,
            "auto_block": SHADOW_AUTO_BLOCK_THRESHOLD,
        },
        "lineage": {
            "feature_schema": FRAUD_FEATURE_SCHEMA_VERSION,
            "data_source": "fraud_scoring_ledger",
            "label_definition": "rule_engine_action_derived" if all_metrics.get("heuristic_baseline") else "ground_truth",
        },
        "safety": {
            "shadow_only": True,
            "affects_user_responses": False,
            "rollback_policy": "rule engine remains champion",
            "calibration": manifest.get("calibration_method"),
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
        description="Train a LightGBM fraud binary classification model."
    )
    parser.add_argument("--dsn", type=str, help="Postgres DSN for fraud_scoring_ledger")
    parser.add_argument("--train-data", type=str, help="Path to training JSONL (alternative to --dsn)")
    parser.add_argument("--eval-data", type=str, help="Path to evaluation JSONL (alternative to --dsn)")
    parser.add_argument("--output", type=str, default="artifacts/", help="Output directory")
    parser.add_argument("--limit", type=int, default=10000, help="Max rows from ledger")
    parser.add_argument("--synthetic-labels", action="store_true", help="Use synthetic labels from rule-engine action")
    parser.add_argument("--test-split", type=float, default=0.2, help="Fraction of data for evaluation")
    parser.add_argument("--calib-split", type=float, default=0.25, help="Fraction of training data for calibration")
    parser.add_argument("--num-boost-round", type=int, default=200, help="Number of boosting rounds")
    parser.add_argument("--learning-rate", type=float, default=0.05, help="Learning rate")
    parser.add_argument("--num-leaves", type=int, default=31, help="Max leaves per tree")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
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
    if args.dsn:
        print(f"Loading data from Postgres ({args.dsn})...")
        all_records = load_ledger_data(args.dsn, args.limit, args.synthetic_labels)
        print(f"  {len(all_records)} records loaded")

        if len(all_records) < 50:
            print("ERROR: Not enough records for training (minimum 50)", file=sys.stderr)
            return 1

        # Split into train/eval
        import numpy as np
        rng = np.random.RandomState(args.seed)
        indices = rng.permutation(len(all_records))
        eval_count = max(10, int(len(all_records) * args.test_split))
        eval_indices = indices[:eval_count]
        train_indices = indices[eval_count:]
        train_records = [all_records[i] for i in train_indices]
        eval_records = [all_records[i] for i in eval_indices]
    elif args.train_data and args.eval_data:
        print(f"Loading training data from {args.train_data}...")
        train_records = load_jsonl(args.train_data)
        print(f"  {len(train_records)} training records")
        print(f"Loading evaluation data from {args.eval_data}...")
        eval_records = load_jsonl(args.eval_data)
        print(f"  {len(eval_records)} evaluation records")
    else:
        print("ERROR: Provide either --dsn or --train-data + --eval-data", file=sys.stderr)
        return 1

    train_hash = data_hash(train_records)
    eval_hash = data_hash(eval_records)
    print(f"  train data hash: {train_hash[:16]}...")
    print(f"  eval data hash:  {eval_hash[:16]}...")

    # Build datasets
    train_features, train_labels = build_dataset(train_records)
    eval_features, eval_labels = build_dataset(eval_records)

    pos_count = sum(train_labels)
    neg_count = len(train_labels) - pos_count
    scale_pos_weight = neg_count / max(1, pos_count)
    print(f"  train: {len(train_features)} rows (pos={pos_count}, neg={neg_count}, scale_pos_weight={scale_pos_weight:.2f})")
    print(f"  eval:  {len(eval_features)} rows")

    # Rule-engine baseline evaluation
    print("\n--- Rule-engine baseline ---")
    rule_probs = rule_engine_predictions(eval_records)
    rule_metrics = evaluate_binary(eval_labels, rule_probs)
    print(f"  Precision: {rule_metrics['precision']:.4f}")
    print(f"  Recall:    {rule_metrics['recall']:.4f}")
    print(f"  F1:        {rule_metrics['f1']:.4f}")
    print(f"  AUC-ROC:   {rule_metrics['auc_roc']:.4f}")
    print(f"  Brier:     {rule_metrics['brier_score']:.4f}")

    all_metrics: dict[str, dict[str, float]] = {"rule_engine_baseline": rule_metrics}

    # Split training data for calibration
    import numpy as np
    rng = np.random.RandomState(args.seed)
    calib_count = int(len(train_features) * args.calib_split)
    calib_indices = rng.choice(len(train_features), calib_count, replace=False)
    train_only_indices = [i for i in range(len(train_features)) if i not in set(calib_indices)]

    train_only_features = [train_features[i] for i in train_only_indices]
    train_only_labels = [train_labels[i] for i in train_only_indices]
    calib_features = [train_features[i] for i in calib_indices]
    calib_labels = [train_labels[i] for i in calib_indices]

    # Train
    print("\n--- Training LightGBM binary classifier ---")
    model = train_model(
        train_only_features,
        train_only_labels,
        eval_features,
        eval_labels,
        num_boost_round=args.num_boost_round,
        learning_rate=args.learning_rate,
        num_leaves=args.num_leaves,
        scale_pos_weight=scale_pos_weight,
        seed=args.seed,
    )

    # Calibrate
    print("\n--- Calibrating (isotonic regression) ---")
    calib_map = calibrate_predictions(model, calib_features, calib_labels)
    calibration_method = "isotonic" if calib_map is not None else None
    calib_hash = data_hash(
        [{"features": f, "label": l} for f, l in zip(calib_features, calib_labels)]
    ) if calib_features else None

    # Evaluate with calibration
    raw_eval_probs = model.predict(np.array(eval_features, dtype=np.float64))
    if callable(calib_map):
        calibrated_probs = [float(calib_map(np.array([p]))) for p in raw_eval_probs]
    else:
        calibrated_probs = [float(p) for p in raw_eval_probs]

    model_metrics = evaluate_binary(eval_labels, calibrated_probs)
    all_metrics["lightgbm_fraud"] = model_metrics
    print(f"  Precision: {model_metrics['precision']:.4f}")
    print(f"  Recall:    {model_metrics['recall']:.4f}")
    print(f"  F1:        {model_metrics['f1']:.4f}")
    print(f"  AUC-ROC:   {model_metrics['auc_roc']:.4f}")
    print(f"  Brier:     {model_metrics['brier_score']:.4f}")

    # Compare against rule engine
    print("\n--- Comparison ---")
    rule_f1 = rule_metrics["f1"]
    model_f1 = model_metrics["f1"]
    if model_f1 > rule_f1:
        print(f"  Challenger beats rule engine: F1 {model_f1:.4f} > {rule_f1:.4f}")
    else:
        print(f"  Rule engine remains champion: F1 {rule_f1:.4f} >= {model_f1:.4f}")
        print("  (Saving challenger artifact for shadow comparison anyway)")

    # Feature importance
    importance = model.feature_importance(importance_type="gain")
    feature_importance = {
        name: float(imp) for name, imp in zip(FRAUD_FEATURES, importance)
    }
    print("\n  Feature importance (gain):")
    for name, imp in sorted(feature_importance.items(), key=lambda x: -x[1]):
        print(f"    {name:30s} {imp:.2f}")

    # Save artifact
    model_path, manifest_path, manifest = save_artifact(
        model,
        output_dir,
        train_hash,
        model_metrics,
        feature_importance,
        calibration_method,
        calib_hash,
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
    print(f"  Champion (rule engine) F1: {rule_f1:.4f}")
    print(f"  Challenger (LightGBM)  F1: {model_f1:.4f}")
    print(f"  Artifact: {model_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
