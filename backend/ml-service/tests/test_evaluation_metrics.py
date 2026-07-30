import unittest

from app.evaluation import (
    aggregate_quality,
    catalog_coverage,
    intra_list_diversity,
    ndcg_at_k,
    recall_at_k,
    reciprocal_rank,
    seller_concentration,
)


class RecommendationEvaluationMetricTests(unittest.TestCase):
    def test_relevance_metrics_reward_early_relevant_results(self) -> None:
        ranked = ["relevant", "other", "second"]
        relevant = {"relevant", "second"}
        self.assertGreater(ndcg_at_k(ranked, relevant, 3), 0.9)
        self.assertEqual(reciprocal_rank(ranked, relevant), 1.0)
        self.assertEqual(recall_at_k(ranked, relevant, 2), 0.5)

    def test_distribution_metrics_detect_concentration_and_coverage(self) -> None:
        self.assertEqual(
            catalog_coverage([["one", "two"], ["two", "three"]], {"one", "two", "three", "four"}),
            0.75,
        )
        self.assertGreater(
            seller_concentration(["seller_a", "seller_a", "seller_a", "seller_b"]),
            seller_concentration(["seller_a", "seller_b", "seller_c", "seller_d"]),
        )
        self.assertGreater(
            intra_list_diversity([{"outerwear"}, {"bags"}, {"shoes"}]),
            intra_list_diversity([{"outerwear"}, {"outerwear"}, {"outerwear"}]),
        )

    def test_aggregate_quality_handles_empty_input(self) -> None:
        self.assertEqual(
            aggregate_quality([], k=5),
            {"ndcg_at_k": 0.0, "mrr": 0.0, "recall_at_k": 0.0},
        )


if __name__ == "__main__":
    unittest.main()
