import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import (
    app,
    CandidateItem,
    ClassificationRequest,
    InteractionEvent,
    PriceForecastRequest,
    PricingActionRequest,
    RecommendationRequest,
    classify_image,
    forecast_price,
    health,
    pricing_action,
    recommendations,
    require_decision_service,
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
        self.assertGreater(len(payload.recommendations), 0)
        self.assertTrue(
            all(item.model in {"heuristic_ranker_v2", "novelty_exploration_v2"}
                for item in payload.recommendations)
        )
        self.assertFalse(payload.decision.trained_model)
        self.assertEqual(
            payload.decision.policy_version,
            "recommendation-heuristic-v2.0",
        )

    def test_ranking_is_reproducible_and_uses_historical_features(self) -> None:
        as_of = datetime(2026, 7, 28, 12, tzinfo=timezone.utc)
        request = RecommendationRequest(
            user_id="user_1",
            request_id="request-reproducible",
            as_of=as_of,
            candidates=[
                CandidateItem(
                    listing_id="jacket",
                    seller_id="seller_1",
                    title="Wool jacket",
                    category="outerwear",
                    price_gbp=80,
                ),
                CandidateItem(
                    listing_id="bag",
                    seller_id="seller_2",
                    title="Leather bag",
                    category="bags",
                    price_gbp=80,
                ),
            ],
            recent_interactions=[
                InteractionEvent(
                    listing_id="no-longer-active-history-item",
                    action="wishlist",
                    created_at=as_of - timedelta(days=1),
                    title="Tailored wool coat",
                    category="outerwear",
                    price_gbp=78,
                ),
                InteractionEvent(
                    listing_id="other-history-item",
                    action="view",
                    created_at=as_of - timedelta(days=2),
                    title="Vintage outerwear",
                    category="outerwear",
                    price_gbp=85,
                ),
                InteractionEvent(
                    listing_id="third-history-item",
                    action="view",
                    created_at=as_of - timedelta(days=3),
                    title="Winter jacket",
                    category="outerwear",
                    price_gbp=75,
                ),
            ],
            result_limit=2,
            exploration_rate=0,
        )
        first = recommendations(request)
        second = recommendations(request)
        self.assertEqual(
            [item.listing_id for item in first.recommendations],
            [item.listing_id for item in second.recommendations],
        )
        self.assertEqual(first.recommendations[0].listing_id, "jacket")

    def test_ranking_filters_unavailable_excluded_purchased_and_duplicate_items(self) -> None:
        payload = recommendations(
            RecommendationRequest(
                user_id="user_1",
                request_id="request-filtering",
                as_of=datetime(2026, 7, 28, tzinfo=timezone.utc),
                candidates=[
                    CandidateItem(listing_id="keep", seller_id="seller_1"),
                    CandidateItem(listing_id="keep", seller_id="seller_1", title="complete"),
                    CandidateItem(listing_id="unavailable", available=False),
                    CandidateItem(listing_id="excluded"),
                    CandidateItem(listing_id="purchased"),
                ],
                exclude_listing_ids=["excluded"],
                recent_interactions=[
                    InteractionEvent(listing_id="purchased", action="purchase"),
                ],
                result_limit=10,
            )
        )
        self.assertEqual(
            [item.listing_id for item in payload.recommendations],
            ["keep"],
        )
        diagnostics = payload.decision.diagnostics
        self.assertEqual(diagnostics.duplicate_candidates_removed, 1)
        self.assertEqual(diagnostics.unavailable_candidates_removed, 1)
        self.assertEqual(diagnostics.explicitly_excluded_candidates, 1)
        self.assertEqual(diagnostics.purchased_candidates_removed, 1)

    def test_image_classifier_fails_closed_instead_of_fabricating_confidence(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            classify_image(ClassificationRequest(image_url="https://example.test/jacket.jpg"))
        self.assertEqual(raised.exception.status_code, 501)

    def test_decision_endpoints_reject_invalid_service_credentials(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            require_decision_service("not-the-configured-token")
        self.assertEqual(raised.exception.status_code, 401)

    def test_http_contract_requires_service_credential_and_returns_version_metadata(self) -> None:
        client = TestClient(app)
        body = {
            "user_id": "http_user",
            "request_id": "http-request-20260728",
            "as_of": "2026-07-28T12:00:00Z",
            "result_limit": 1,
            "candidates": [
                {
                    "listing_id": "http_listing",
                    "title": "Wool jacket",
                    "category": "outerwear",
                    "price_gbp": 80,
                }
            ],
        }
        unauthorized = client.post("/recommendations", json=body)
        authorized = client.post(
            "/recommendations",
            json=body,
            headers={"x-decision-service-token": "local-decision-service-token"},
        )
        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(authorized.status_code, 200)
        response = authorized.json()
        self.assertEqual(
            response["decision"]["policy_version"],
            "recommendation-heuristic-v2.0",
        )
        self.assertFalse(response["decision"]["trained_model"])

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
        self.assertFalse(action["guardrails"]["automatic_price_change"])


if __name__ == "__main__":
    unittest.main()
