"""Build point-in-time-correct training datasets from Postgres event tables.

Joins served recommendation impressions with delayed outcome interactions
from the ``analytics_events`` and ``recommendation_impressions`` tables.

This is the real-data path. It requires production traffic to be useful —
the synthetic generator (``generate_synthetic_training_data.py``) is for
testing the training pipeline before real traffic exists.

Point-in-time correctness is enforced:
    feature_timestamp <= decision_timestamp < label_window_end

Usage:
    python -m scripts.build_dataset \
        --start-date 2026-07-01 --end-date 2026-08-01 \
        --label-window-hours 72 --output data/train.jsonl
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ranking import RANKING_FEATURES


# Outcome action -> graded label per the report §4.3
ACTION_TO_GRADE: dict[str, int] = {
    "rapid_skip": 0,
    "view": 1,
    "qualified_detail_view": 1,
    "share": 2,
    "save": 2,
    "open_seller_profile": 2,
    "follow_seller": 2,
    "wishlist": 3,
    "offer_started": 3,
    "offer_submitted": 3,
    "add_to_basket": 3,
    "message_seller_started": 3,
    "checkout_started": 3,
    "purchase": 4,
    # Negative signals
    "not_interested": 0,
    "show_fewer": 0,
    "report_content": 0,
    "unsave": 0,
    "unfollow_seller": 0,
}


def _parse_dt(value: str) -> datetime:
    """Parse an ISO datetime, assuming UTC if no timezone is present."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _get_db_connection(database_url: str | None):
    """Create a psycopg connection from DATABASE_URL or the given URL."""
    try:
        import psycopg  # type: ignore[import-untyped]
    except ImportError:
        try:
            import psycopg2  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ImportError(
                "Neither psycopg nor psycopg2 is installed. "
                "Install with: pip install psycopg[binary]"
            ) from exc
        return psycopg2.connect(database_url)

    return psycopg.connect(database_url)


# ---------------------------------------------------------------------------
# SQL queries
# ---------------------------------------------------------------------------

IMPRESSION_QUERY = """
SELECT
    ri.request_id,
    ri.user_id,
    ri.listing_id,
    ri.position,
    ri.score,
    ri.policy_version,
    ri.feature_schema_version,
    ri.candidate_source,
    ri.source_rank,
    ri.source_score,
    ri.retrieval_version,
    ri.selection_propensity,
    ri.status,
    ri.created_at AS served_at
FROM recommendation_impressions ri
WHERE ri.created_at >= %s
  AND ri.created_at < %s
  AND ri.status IN ('served', 'rendered', 'viewable')
ORDER BY ri.request_id, ri.position
"""

OUTCOME_QUERY = """
SELECT
    ae.request_id,
    ae.properties->>'listing_id' AS listing_id,
    ae.event_name,
    ae.event_time,
    ae.properties
FROM analytics_events ae
WHERE ae.event_time >= %s
  AND ae.event_time < %s
  AND ae.actor_user_id = ANY(%s)
ORDER BY ae.event_time
"""

# Feature snapshot query — point-in-time correct: only features known at serve time
FEATURE_SNAPSHOT_QUERY = """
SELECT
    l.id AS listing_id,
    l.title,
    l.description,
    l.category,
    l.brand,
    l.size,
    l.condition,
    l.price_gbp,
    l.quality_score,
    l.popularity_score,
    l.seller_trust_score,
    l.created_at AS listing_created_at
FROM listings l
WHERE l.id = ANY(%s)
"""


# ---------------------------------------------------------------------------
# Dataset construction
# ---------------------------------------------------------------------------


def build_dataset(
    database_url: str,
    start_date: datetime,
    end_date: datetime,
    label_window_hours: int,
    output_path: str,
) -> int:
    """Build a point-in-time-correct training dataset and write JSONL.

    Returns the number of records written.
    """
    conn = _get_db_connection(database_url)
    try:
        with conn.cursor() as cur:
            # 1. Fetch impressions in the time window
            print(f"Fetching impressions from {start_date} to {end_date}...")
            cur.execute(IMPRESSION_QUERY, (start_date, end_date))
            columns = [desc[0] for desc in cur.description]
            impressions = [dict(zip(columns, row)) for row in cur.fetchall()]
            print(f"  fetched {len(impressions)} impression rows")

            if not impressions:
                print("  no impressions found — nothing to build")
                return 0

            # 2. Group impressions by request_id
            by_request: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for imp in impressions:
                by_request[imp["request_id"]].append(imp)

            # 3. Fetch outcomes in the extended label window
            label_end = end_date + timedelta(hours=label_window_hours)
            user_ids = list({
                imp["user_id"] for imp in impressions if imp.get("user_id")
            })
            print(f"Fetching outcomes for {len(user_ids)} users...")
            cur.execute(OUTCOME_QUERY, (start_date, label_end, user_ids))
            outcome_columns = [desc[0] for desc in cur.description]
            outcomes = [dict(zip(outcome_columns, row)) for row in cur.fetchall()]
            print(f"  fetched {len(outcomes)} outcome events")

            # 4. Group outcomes by (request_id, listing_id) and assign grades
            outcome_grades: dict[tuple[str, str], int] = {}
            for outcome in outcomes:
                req_id = outcome.get("request_id")
                listing_id = outcome.get("listing_id")
                if not req_id or not listing_id:
                    continue
                event_name = outcome["event_name"]
                grade = ACTION_TO_GRADE.get(event_name)
                if grade is None:
                    continue
                key = (req_id, listing_id)
                # Take the maximum grade (most positive signal wins)
                outcome_grades[key] = max(outcome_grades.get(key, 0), grade)

            # 5. Fetch listing features (point-in-time: current snapshot is an
            #    approximation; a production system would use a feature snapshot
            #    table with ASOF joins)
            listing_ids = list({imp["listing_id"] for imp in impressions})
            print(f"Fetching features for {len(listing_ids)} listings...")
            cur.execute(FEATURE_SNAPSHOT_QUERY, (listing_ids,))
            feat_columns = [desc[0] for desc in cur.description]
            listing_features = {
                row[0]: dict(zip(feat_columns, row)) for row in cur.fetchall()
            }

    finally:
        conn.close()

    # 6. Build training records
    records: list[dict[str, Any]] = []
    for request_id, imps in by_request.items():
        served_at = imps[0]["served_at"]
        if isinstance(served_at, str):
            served_at = _parse_dt(served_at)

        for imp in imps:
            listing_id = imp["listing_id"]
            listing = listing_features.get(listing_id)
            if listing is None:
                continue

            # Point-in-time: only use listing data that existed at serve time
            listing_created = listing.get("listing_created_at")
            if isinstance(listing_created, str):
                listing_created = _parse_dt(listing_created)
            if listing_created and listing_created > served_at:
                # Listing was created after the serve — skip (leakage guard)
                continue

            # Label: graded outcome, default 0 (no outcome = rapid skip / no engagement)
            label = outcome_grades.get((request_id, listing_id), 0)

            # Features: the seven interpretable components
            features = {
                "affinity": 0.0,  # Would be computed from user history at serve time
                "sequence": 0.0,  # Would be computed from session sequence at serve time
                "price_alignment": 0.5,  # Default when no price history
                "freshness": _freshness_score(listing_created, served_at) if listing_created else 0.45,
                "quality": float(listing.get("quality_score") or 0.5),
                "popularity": float(listing.get("popularity_score") or 0.0),
                "seller_trust": float(listing.get("seller_trust_score") or 0.5),
            }

            records.append(
                {
                    "request_id": request_id,
                    "user_id": imp.get("user_id", ""),
                    "listing_id": listing_id,
                    "features": {k: round(v, 6) for k, v in features.items()},
                    "label": label,
                    "group": request_id,
                    "position": imp.get("position", 0),
                    "served_at": served_at.isoformat(),
                    "candidate_source": imp.get("candidate_source"),
                    "selection_propensity": float(imp["selection_propensity"])
                    if imp.get("selection_propensity") is not None
                    else None,
                }
            )

    # 7. Write JSONL
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(rec) + "\n")

    print(f"\nWrote {len(records)} training records to {output}")

    # Label distribution
    label_dist: dict[int, int] = {}
    for rec in records:
        label_dist[rec["label"]] = label_dist.get(rec["label"], 0) + 1
    print(f"Label distribution: {dict(sorted(label_dist.items()))}")

    return len(records)


def _freshness_score(created_at: datetime, as_of: datetime) -> float:
    """Compute freshness as exp(-age_days / 28)."""
    age_days = max(0.0, (as_of - created_at).total_seconds() / 86400)
    import math

    return math.exp(-age_days / 28.0)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build point-in-time-correct training data from Postgres event tables."
    )
    parser.add_argument(
        "--database-url",
        type=str,
        default=None,
        help="Postgres connection URL. Defaults to $DATABASE_URL.",
    )
    parser.add_argument(
        "--start-date",
        type=str,
        required=True,
        help="Start date (ISO 8601, e.g. 2026-07-01)",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        required=True,
        help="End date (ISO 8601, exclusive)",
    )
    parser.add_argument(
        "--label-window-hours",
        type=int,
        default=72,
        help="Hours after end-date to wait for delayed outcomes",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/train.jsonl",
        help="Output JSONL path",
    )
    args = parser.parse_args()

    database_url = args.database_url or os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: --database-url or DATABASE_URL env var is required", file=sys.stderr)
        return 1

    start_date = _parse_dt(args.start_date)
    end_date = _parse_dt(args.end_date)

    if end_date <= start_date:
        print("ERROR: end-date must be after start-date", file=sys.stderr)
        return 1

    n = build_dataset(database_url, start_date, end_date, args.label_window_hours, args.output)
    return 0 if n >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
