# ThryftVerse decision service

This service owns low-risk recommendation, price-forecast, and pricing-advice
decisions. It currently runs a versioned deterministic baseline. It does **not**
claim to run a trained model.

## Current production contract

- Recommendation policy: `recommendation-heuristic-v2.0`
- Feature schema: `recommendation-features-v2`
- Capability: `heuristic_baseline`
- Ranking: event-time-decayed affinity, sequence interest, logarithmic price
  alignment, listing quality, popularity, freshness, and seller trust
- Post-ranking: deterministic novelty exploration plus seller/category caps
- Safety: unavailable, explicitly excluded, duplicate, and purchased candidates
  are removed before ranking
- Explainability: every result includes reason codes and bounded component scores
- Reproducibility: callers provide `request_id` and `as_of`; equal inputs produce
  equal rankings
- Failure mode: the API owns a separately versioned quality/recency fallback and
  never represents it as a trained model

Image classification remains unavailable (`501`) until a real artifact,
evaluation dataset, monitoring, and rollback path exist.

## Evaluation and promotion

Run:

```bash
python -m unittest discover -s tests -v
python scripts/evaluate_recommendations.py
```

CI blocks changes that regress relevance, recall, catalog coverage, seller
concentration, or determinism against
`evaluation/recommendation_baseline_v2.json`.

A trained ranking policy must not replace the active baseline until all of these
are implemented and evidenced:

1. consented, point-in-time-correct training examples built from recorded serves,
   impressions, and attributed outcomes;
2. leakage checks separating event time, feature time, and label window;
3. a signed artifact digest with training code/data/schema versions;
4. offline comparison against the active policy, including cold-start,
   seller-concentration, catalog-coverage, and segment-level quality;
5. shadow serving with feature parity and latency/error budgets;
6. an exposure-limited experiment with guardrails and a deterministic holdout;
7. automatic rollback on fallback rate, latency, integrity, or marketplace
   concentration breaches.

## Department boundaries

- Recommendations and discovery may use learned ranking after the promotion
  gates above.
- Price forecasting remains advisory. The response includes uncertainty and
  cannot mutate a listing price.
- Pricing actions are suggestions only and explicitly require human review.
- Payments, KYC, AML, sanctions, account restrictions, auctions, and settlement
  remain authoritative rule/transaction systems. A model may add a review signal
  later, but must never silently replace those controls.
- Generated prompts, private messages, raw images, and secrets must not be placed
  in metric labels or decision metadata.

## Next model-development sequence

1. Add point-in-time feature materialization and delayed outcome labels.
2. Build larger time-split evaluation sets from consented production events.
3. Train a simple interpretable learning-to-rank challenger.
4. Add calibration, segment analysis, and marketplace concentration constraints.
5. Shadow the challenger; compare parity, quality, latency, and drift.
6. Promote only through a versioned experiment and retain the v2 baseline for
   immediate rollback.
