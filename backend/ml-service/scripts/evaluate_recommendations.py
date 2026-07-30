from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.evaluation import aggregate_quality, catalog_coverage, seller_concentration
from app.ranking import rank_recommendations
from app.schemas import CandidateItem, InteractionEvent, RecommendationRequest


def main() -> int:
    dataset_path = ROOT / "evaluation" / "recommendation_baseline_v2.json"
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    candidates = [CandidateItem.model_validate(item) for item in dataset["candidates"]]
    quality_cases: list[tuple[list[str], set[str]]] = []
    result_lists: list[list[str]] = []
    seller_concentrations: list[float] = []
    deterministic = True

    seller_by_listing = {item.listing_id: item.seller_id for item in candidates}
    for case in dataset["cases"]:
        request = RecommendationRequest(
            user_id=case["user_id"],
            request_id=f"evaluation-{case['name']}",
            as_of=dataset["as_of"],
            candidates=candidates,
            recent_interactions=[
                InteractionEvent.model_validate(item) for item in case["interactions"]
            ],
            result_limit=case["result_limit"],
        )
        first = rank_recommendations(request)
        second = rank_recommendations(request)
        ranked = [item.listing_id for item in first.recommendations]
        deterministic = deterministic and ranked == [
            item.listing_id for item in second.recommendations
        ]
        quality_cases.append((ranked, set(case["relevant_ids"])))
        result_lists.append(ranked)
        seller_concentrations.append(
            seller_concentration([seller_by_listing[listing_id] for listing_id in ranked])
        )

    metrics = aggregate_quality(quality_cases, k=4)
    metrics["catalog_coverage"] = catalog_coverage(
        result_lists, {candidate.listing_id for candidate in candidates}
    )
    metrics["maximum_seller_concentration"] = max(seller_concentrations, default=0)
    metrics["deterministic"] = deterministic
    print(json.dumps(metrics, indent=2, sort_keys=True))

    thresholds = dataset["thresholds"]
    failures = [
        f"{name}={metrics[name]:.4f} is below {minimum:.4f}"
        for name, minimum in thresholds.items()
        if name != "maximum_seller_concentration" and metrics[name] < minimum
    ]
    if metrics["maximum_seller_concentration"] > thresholds["maximum_seller_concentration"]:
        failures.append(
            "maximum_seller_concentration="
            f"{metrics['maximum_seller_concentration']:.4f} exceeds "
            f"{thresholds['maximum_seller_concentration']:.4f}"
        )
    if not deterministic:
        failures.append("identical requests produced different rankings")
    if failures:
        print("Evaluation gate failed: " + "; ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
