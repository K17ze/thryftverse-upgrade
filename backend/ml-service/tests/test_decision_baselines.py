import unittest

from fastapi import HTTPException

from app.main import (
    CandidateItem,
    ClassificationRequest,
    PriceForecastRequest,
    PricingActionRequest,
    RecommendationRequest,
    classify_image,
    forecast_price,
    health,
    pricing_action,
    recommendations,
)


class DecisionBaselineTests(unittest.TestCase):
    def test_health_is_truthful_about_capability_level(self) -> None:
        payload = health()
        self.assertEqual(payload["capability_level"], "heuristic_baseline")
        self.assertFalse(payload["trained_models"])

    def test_recommendations_are_labelled_as_heuristic(self) -> None:
        payload = recommendations(
            RecommendationRequest(
                user_id="user_1",
                candidates=[
                    CandidateItem(listing_id="listing_1", title="Vintage jacket", price_gbp=40),
                    CandidateItem(listing_id="listing_2", title="Leather bag", price_gbp=55),
                ],
                result_limit=2,
            )
        )
        self.assertGreater(len(payload["recommendations"]), 0)
        self.assertTrue(
            all(item.model in {"heuristic_two_stage_ranker", "novelty_exploration"}
                for item in payload["recommendations"])
        )

    def test_image_classifier_fails_closed_instead_of_fabricating_confidence(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            classify_image(ClassificationRequest(image_url="https://example.test/jacket.jpg"))
        self.assertEqual(raised.exception.status_code, 501)

    def test_forecast_and_pricing_policy_disclose_deterministic_methods(self) -> None:
        forecast = forecast_price(
            PriceForecastRequest(series=[10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
        )
        action = pricing_action(
            PricingActionRequest(inventory=30, demand_index=0.4, current_price=100)
        )
        self.assertFalse(forecast["trained_model"])
        self.assertEqual(forecast["model"], "moving_trend_baseline")
        self.assertFalse(action["trained_model"])
        self.assertEqual(action["policy"], "deterministic_inventory_policy")


if __name__ == "__main__":
    unittest.main()
