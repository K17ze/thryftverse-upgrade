import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_RECOMMENDATION_POLICY_VERSION,
  scoreProductRecommendation,
} from './productRecommendationPolicy.js';

const source = {
  category: 'outerwear',
  brand: 'Atelier',
  size: 'M',
  condition: 'Excellent',
  price_gbp: 80,
  seller_id: 'source_seller',
};

test('contextual product policy is versioned and deterministic', () => {
  const input = {
    candidate: {
      id: 'candidate_1',
      ...source,
      seller_id: 'other_seller',
      created_at: '2026-07-27T12:00:00Z',
    },
    source,
    asOf: '2026-07-28T12:00:00Z',
  };
  assert.equal(
    scoreProductRecommendation(input).score,
    scoreProductRecommendation(input).score,
  );
  assert.equal(
    PRODUCT_RECOMMENDATION_POLICY_VERSION,
    'product-contextual-recommendation-v2.0',
  );
});

test('matching product semantics outrank an unrelated candidate', () => {
  const matching = scoreProductRecommendation({
    candidate: {
      id: 'matching',
      ...source,
      seller_id: 'other_seller',
      created_at: '2026-07-20T12:00:00Z',
    },
    source,
    asOf: '2026-07-28T12:00:00Z',
  });
  const unrelated = scoreProductRecommendation({
    candidate: {
      id: 'unrelated',
      category: 'bags',
      brand: 'Different',
      size: 'One size',
      condition: 'Fair',
      price_gbp: 300,
      seller_id: 'third_seller',
      created_at: '2026-07-20T12:00:00Z',
    },
    source,
    asOf: '2026-07-28T12:00:00Z',
  });
  assert.ok(matching.score > unrelated.score);
  assert.ok(matching.reasonCodes.includes('same_category'));
});
