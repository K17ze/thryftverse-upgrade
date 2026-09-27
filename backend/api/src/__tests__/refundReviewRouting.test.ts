import assert from 'node:assert/strict';
import test from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// Refund review routing — abuse signals that add to the amount threshold.
//
// Covers the pure helpers exported from routes/refunds.ts:
//   - evaluateRefundAbuseSignals: the small rules set that decides whether a
//     refund execution routes to maker-check on buyer velocity, account age,
//     dispute history or seller dispute rate.
//   - extractReviewSignals: reads the fired-signal list back out of the
//     execution row's provider_response.review JSONB block.
//
// Invariants under test:
//   - Every signal that fires returns a stable code + human-readable detail.
//   - Unverifiable buyer history (missing user row) fails conservative —
//     routes to review rather than silently allowing.
//   - Signals are additive: multiple rules may fire on one refund.
// ─────────────────────────────────────────────────────────────────────────────

import {
  REFUND_REVIEW_BUYER_MIN_RETURN_CASES,
  REFUND_REVIEW_NEW_ACCOUNT_DAYS,
  REFUND_REVIEW_SELLER_CASE_RATIO,
  REFUND_REVIEW_SELLER_MIN_CASES,
  REFUND_REVIEW_VELOCITY_MIN_REFUNDS,
  REFUND_REVIEW_VELOCITY_RATIO,
  REFUND_REVIEW_VELOCITY_RATIO_MIN_REFUNDS,
  REFUND_REVIEW_WINDOW_DAYS,
  evaluateRefundAbuseSignals,
  extractReviewSignals,
  type RefundAbuseFacts,
} from '../routes/refunds.js';

function cleanFacts(overrides: Partial<RefundAbuseFacts> = {}): RefundAbuseFacts {
  return {
    buyerAccountAgeDays: 400,
    buyerRefundsInWindow: 0,
    buyerOrdersInWindow: 10,
    buyerDisputeCount: 0,
    buyerReturnCaseCount: 0,
    orderCaseCount: 0,
    sellerCaseCount: 0,
    sellerOrderCount: 200,
    ...overrides,
  };
}

function codes(facts: RefundAbuseFacts): string[] {
  return evaluateRefundAbuseSignals(facts).map((s) => s.code);
}

test('clean history fires no signals', () => {
  assert.deepEqual(evaluateRefundAbuseSignals(cleanFacts()), []);
});

// ── Buyer refund velocity ──

test('velocity: absolute refund count in the window routes to review', () => {
  const signals = evaluateRefundAbuseSignals(
    cleanFacts({ buyerRefundsInWindow: REFUND_REVIEW_VELOCITY_MIN_REFUNDS, buyerOrdersInWindow: 20 })
  );
  assert.equal(signals.length, 1);
  assert.equal(signals[0].code, 'buyer_refund_velocity');
  assert.match(signals[0].detail, /30d/);
});

test('velocity: a high refund-to-order ratio fires below the absolute count', () => {
  const fired = codes(
    cleanFacts({
      buyerRefundsInWindow: REFUND_REVIEW_VELOCITY_RATIO_MIN_REFUNDS,
      buyerOrdersInWindow: Math.floor(
        REFUND_REVIEW_VELOCITY_RATIO_MIN_REFUNDS / REFUND_REVIEW_VELOCITY_RATIO
      ),
    })
  );
  assert.deepEqual(fired, ['buyer_refund_velocity']);
});

test('velocity: refunds with no recent orders fire (ratio is unbounded)', () => {
  const fired = codes(
    cleanFacts({ buyerRefundsInWindow: REFUND_REVIEW_VELOCITY_RATIO_MIN_REFUNDS, buyerOrdersInWindow: 0 })
  );
  assert.deepEqual(fired, ['buyer_refund_velocity']);
});

test('velocity: a low ratio under the minimum count does not fire', () => {
  // One refund against one order is a 1.0 ratio but below the minimum
  // refund count — a single return must not brand a buyer a repeat refunder.
  assert.deepEqual(codes(cleanFacts({ buyerRefundsInWindow: 1, buyerOrdersInWindow: 1 })), []);
  assert.deepEqual(codes(cleanFacts({ buyerRefundsInWindow: 2, buyerOrdersInWindow: 10 })), []);
});

// ── Account age / buyer history ──

test('account age: a buyer younger than the window routes to review', () => {
  assert.deepEqual(
    codes(cleanFacts({ buyerAccountAgeDays: REFUND_REVIEW_NEW_ACCOUNT_DAYS - 1 })),
    ['new_buyer_account']
  );
  assert.deepEqual(codes(cleanFacts({ buyerAccountAgeDays: 0 })), ['new_buyer_account']);
});

test('account age: at the boundary the account is no longer new', () => {
  assert.deepEqual(codes(cleanFacts({ buyerAccountAgeDays: REFUND_REVIEW_NEW_ACCOUNT_DAYS })), []);
});

test('account age: a missing user record fails conservative', () => {
  // Fail-open is not acceptable — unverifiable history routes to review.
  assert.deepEqual(codes(cleanFacts({ buyerAccountAgeDays: null })), ['buyer_history_unavailable']);
});

// ── Prior disputes / cases ──

test('buyer disputes: any payment dispute on the buyer routes to review', () => {
  assert.deepEqual(codes(cleanFacts({ buyerDisputeCount: 1 })), ['buyer_prior_disputes']);
});

test('buyer disputes: repeated return cases route to review', () => {
  assert.deepEqual(
    codes(cleanFacts({ buyerReturnCaseCount: REFUND_REVIEW_BUYER_MIN_RETURN_CASES })),
    ['buyer_prior_disputes']
  );
  // Below the serial-returner count, return cases alone do not fire.
  assert.deepEqual(
    codes(cleanFacts({ buyerReturnCaseCount: REFUND_REVIEW_BUYER_MIN_RETURN_CASES - 1 })),
    []
  );
});

test('order cases: a prior dispute or unrelated return case on the order fires', () => {
  assert.deepEqual(codes(cleanFacts({ orderCaseCount: 1 })), ['order_prior_case']);
});

// ── Seller-side signal ──

test('seller dispute rate: enough cases at a high ratio routes to review', () => {
  const fired = codes(
    cleanFacts({
      sellerCaseCount: REFUND_REVIEW_SELLER_MIN_CASES,
      sellerOrderCount: Math.floor(REFUND_REVIEW_SELLER_MIN_CASES / REFUND_REVIEW_SELLER_CASE_RATIO),
    })
  );
  assert.deepEqual(fired, ['seller_dispute_rate']);
});

test('seller dispute rate: below the minimum case count or ratio does not fire', () => {
  // Too few cases — the rate is noise.
  assert.deepEqual(
    codes(cleanFacts({ sellerCaseCount: REFUND_REVIEW_SELLER_MIN_CASES - 1, sellerOrderCount: 2 })),
    []
  );
  // Enough cases but a healthy order volume dilutes the ratio.
  assert.deepEqual(
    codes(cleanFacts({ sellerCaseCount: REFUND_REVIEW_SELLER_MIN_CASES, sellerOrderCount: 1000 })),
    []
  );
  // A seller with zero orders and prior cases is maximally suspicious.
  assert.deepEqual(
    codes(cleanFacts({ sellerCaseCount: REFUND_REVIEW_SELLER_MIN_CASES, sellerOrderCount: 0 })),
    ['seller_dispute_rate']
  );
});

// ── Signals are additive and every fire carries a detail ──

test('multiple rules firing produce multiple signals in a stable order', () => {
  const signals = evaluateRefundAbuseSignals(
    cleanFacts({
      buyerAccountAgeDays: 5,
      buyerRefundsInWindow: 4,
      buyerOrdersInWindow: 4,
      buyerDisputeCount: 2,
      orderCaseCount: 1,
      sellerCaseCount: 5,
      sellerOrderCount: 20,
    })
  );
  assert.deepEqual(
    signals.map((s) => s.code),
    [
      'new_buyer_account',
      'buyer_refund_velocity',
      'buyer_prior_disputes',
      'order_prior_case',
      'seller_dispute_rate',
    ]
  );
  for (const signal of signals) {
    assert.ok(signal.detail.length > 0, `${signal.code} must carry a human-readable detail`);
  }
});

// ── Metadata persistence round-trip ──

test('extractReviewSignals: reads the review block written at routing time', () => {
  const signals = evaluateRefundAbuseSignals(cleanFacts({ buyerDisputeCount: 1 }));
  const providerResponse = {
    review: { signals, evaluatedAt: '2026-02-10T12:00:00.000Z' },
    source: 'gateway',
  };
  assert.deepEqual(extractReviewSignals(providerResponse), signals);
});

test('extractReviewSignals: malformed or absent review blocks yield an empty list', () => {
  assert.deepEqual(extractReviewSignals(null), []);
  assert.deepEqual(extractReviewSignals(undefined), []);
  assert.deepEqual(extractReviewSignals({}), []);
  assert.deepEqual(extractReviewSignals({ source: 'gateway' }), []);
  assert.deepEqual(extractReviewSignals({ review: { signals: 'nope' } }), []);
  assert.deepEqual(extractReviewSignals({ review: { signals: [{ code: 1 }] } }), []);
});

// ── Constants sanity ──

test('review constants stay inside sane bounds', () => {
  assert.ok(REFUND_REVIEW_WINDOW_DAYS > 0);
  assert.ok(REFUND_REVIEW_VELOCITY_MIN_REFUNDS > REFUND_REVIEW_VELOCITY_RATIO_MIN_REFUNDS);
  assert.ok(REFUND_REVIEW_VELOCITY_RATIO > 0 && REFUND_REVIEW_VELOCITY_RATIO <= 1);
  assert.ok(REFUND_REVIEW_NEW_ACCOUNT_DAYS > 0);
  assert.ok(REFUND_REVIEW_BUYER_MIN_RETURN_CASES > 1);
  assert.ok(REFUND_REVIEW_SELLER_MIN_CASES > 1);
  assert.ok(REFUND_REVIEW_SELLER_CASE_RATIO > 0 && REFUND_REVIEW_SELLER_CASE_RATIO <= 1);
});
