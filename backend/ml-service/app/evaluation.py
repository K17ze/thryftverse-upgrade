from __future__ import annotations

from collections import Counter
import math
from typing import Iterable


def ndcg_at_k(ranked_ids: list[str], relevant_ids: set[str], k: int) -> float:
    if not relevant_ids or k <= 0:
        return 0.0
    gains = [
        (1.0 / math.log2(position + 2)) if listing_id in relevant_ids else 0.0
        for position, listing_id in enumerate(ranked_ids[:k])
    ]
    ideal_hits = min(len(relevant_ids), k)
    ideal = sum(1.0 / math.log2(position + 2) for position in range(ideal_hits))
    return 0.0 if ideal == 0 else sum(gains) / ideal


def reciprocal_rank(ranked_ids: list[str], relevant_ids: set[str]) -> float:
    for position, listing_id in enumerate(ranked_ids, start=1):
        if listing_id in relevant_ids:
            return 1.0 / position
    return 0.0


def recall_at_k(ranked_ids: list[str], relevant_ids: set[str], k: int) -> float:
    if not relevant_ids:
        return 0.0
    return len(set(ranked_ids[:k]) & relevant_ids) / len(relevant_ids)


def catalog_coverage(result_lists: Iterable[list[str]], catalog_ids: set[str]) -> float:
    if not catalog_ids:
        return 0.0
    surfaced = {listing_id for result in result_lists for listing_id in result}
    return len(surfaced & catalog_ids) / len(catalog_ids)


def seller_concentration(seller_ids: list[str | None]) -> float:
    known = [seller_id for seller_id in seller_ids if seller_id]
    if not known:
        return 0.0
    counts = Counter(known)
    total = len(known)
    return sum((count / total) ** 2 for count in counts.values())


def intra_list_diversity(token_sets: list[set[str]]) -> float:
    if len(token_sets) < 2:
        return 1.0
    distances: list[float] = []
    for left_index, left in enumerate(token_sets):
        for right in token_sets[left_index + 1 :]:
            union = left | right
            distances.append(0.0 if not union else 1.0 - len(left & right) / len(union))
    return sum(distances) / len(distances)


def aggregate_quality(
    cases: list[tuple[list[str], set[str]]],
    *,
    k: int,
) -> dict[str, float]:
    if not cases:
        return {"ndcg_at_k": 0.0, "mrr": 0.0, "recall_at_k": 0.0}
    return {
        "ndcg_at_k": sum(ndcg_at_k(ranked, relevant, k) for ranked, relevant in cases)
        / len(cases),
        "mrr": sum(reciprocal_rank(ranked, relevant) for ranked, relevant in cases)
        / len(cases),
        "recall_at_k": sum(recall_at_k(ranked, relevant, k) for ranked, relevant in cases)
        / len(cases),
    }
