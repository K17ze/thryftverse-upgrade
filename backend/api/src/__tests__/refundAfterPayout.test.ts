import assert from 'node:assert/strict';
import test from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// Refund-after-payout recovery — Connect charge architecture
//
// Under the "separate charges and transfers" Stripe Connect flow:
//   1. Platform charges the buyer on the platform account.
//   2. After fulfilment, platform transfers funds to the seller's
//      connected account.
//   3. If a refund is issued AFTER the transfer, the platform balance
//      goes negative. The platform must recover funds from the seller.
//
// The ledger must:
//   - Post the buyer refund against escrow (escrow goes negative if
//     already released — this is the platform's liability).
//   - If the seller escrow was released, post a seller_payable debit
//     so the seller's balance goes negative (seller owes platform).
//   - Reverse platform fee and postage from platform_revenue (those
//     funds never left the platform balance).
//
// These tests verify the decision logic that determines whether a
// seller recovery entry should be posted, without requiring a live
// database. The actual ledger posting is integration-tested separately.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure function that models the refund-after-payout decision.
 * This mirrors the logic in postCommerceOrderRefundLedgerReversal.
 */
function computeRefundRecoveryPlan(input: {
  sellerEscrowReleased: boolean;
  sellerId: string | null;
  subtotalGbp: number;
  platformChargeGbp: number;
  postageFeeGbp: number;
  totalGbp: number;
}): {
  postBuyerRefund: boolean;
  postSellerRecovery: boolean;
  sellerRecoveryAmount: number;
  reversePlatformFee: boolean;
  reversePostage: boolean;
  escrowGoesNegative: boolean;
} {
  const { sellerEscrowReleased, sellerId, subtotalGbp, platformChargeGbp, postageFeeGbp, totalGbp } = input;

  return {
    postBuyerRefund: totalGbp > 0,
    postSellerRecovery: sellerEscrowReleased && sellerId !== null && subtotalGbp > 0,
    sellerRecoveryAmount: sellerEscrowReleased && sellerId !== null ? subtotalGbp : 0,
    reversePlatformFee: platformChargeGbp > 0,
    reversePostage: postageFeeGbp > 0,
    escrowGoesNegative: sellerEscrowReleased,
  };
}

test('refund-before-payout: no seller recovery needed', () => {
  const plan = computeRefundRecoveryPlan({
    sellerEscrowReleased: false,
    sellerId: 'seller_123',
    subtotalGbp: 50.00,
    platformChargeGbp: 3.20,
    postageFeeGbp: 3.50,
    totalGbp: 56.70,
  });

  assert.equal(plan.postBuyerRefund, true);
  assert.equal(plan.postSellerRecovery, false);
  assert.equal(plan.sellerRecoveryAmount, 0);
  assert.equal(plan.escrowGoesNegative, false);
});

test('refund-after-payout: seller recovery posted', () => {
  const plan = computeRefundRecoveryPlan({
    sellerEscrowReleased: true,
    sellerId: 'seller_123',
    subtotalGbp: 50.00,
    platformChargeGbp: 3.20,
    postageFeeGbp: 3.50,
    totalGbp: 56.70,
  });

  assert.equal(plan.postBuyerRefund, true);
  assert.equal(plan.postSellerRecovery, true);
  assert.equal(plan.sellerRecoveryAmount, 50.00);
  assert.equal(plan.escrowGoesNegative, true);
});

test('refund-after-payout: no seller recovery if sellerId is null', () => {
  const plan = computeRefundRecoveryPlan({
    sellerEscrowReleased: true,
    sellerId: null,
    subtotalGbp: 50.00,
    platformChargeGbp: 3.20,
    postageFeeGbp: 3.50,
    totalGbp: 56.70,
  });

  assert.equal(plan.postSellerRecovery, false);
  assert.equal(plan.sellerRecoveryAmount, 0);
});

test('refund-after-payout: no seller recovery if subtotal is zero', () => {
  const plan = computeRefundRecoveryPlan({
    sellerEscrowReleased: true,
    sellerId: 'seller_123',
    subtotalGbp: 0,
    platformChargeGbp: 0,
    postageFeeGbp: 0,
    totalGbp: 0,
  });

  assert.equal(plan.postBuyerRefund, false);
  assert.equal(plan.postSellerRecovery, false);
});

test('platform fee is always reversed when non-zero', () => {
  const beforePayout = computeRefundRecoveryPlan({
    sellerEscrowReleased: false,
    sellerId: 'seller_123',
    subtotalGbp: 50.00,
    platformChargeGbp: 3.20,
    postageFeeGbp: 3.50,
    totalGbp: 56.70,
  });
  const afterPayout = computeRefundRecoveryPlan({
    sellerEscrowReleased: true,
    sellerId: 'seller_123',
    subtotalGbp: 50.00,
    platformChargeGbp: 3.20,
    postageFeeGbp: 3.50,
    totalGbp: 56.70,
  });

  assert.equal(beforePayout.reversePlatformFee, true);
  assert.equal(afterPayout.reversePlatformFee, true);
  assert.equal(beforePayout.reversePostage, true);
  assert.equal(afterPayout.reversePostage, true);
});

test('seller recovery amount equals subtotal, not total', () => {
  // The seller only received the subtotal. The platform fee and postage
  // never left the platform balance, so they are reversed from
  // platform_revenue, not recovered from the seller.
  const plan = computeRefundRecoveryPlan({
    sellerEscrowReleased: true,
    sellerId: 'seller_123',
    subtotalGbp: 50.00,
    platformChargeGbp: 3.20,
    postageFeeGbp: 3.50,
    totalGbp: 56.70,
  });

  assert.equal(plan.sellerRecoveryAmount, 50.00);
  assert.notEqual(plan.sellerRecoveryAmount, 56.70);
});

test('zero refund amount is idempotent (no entries posted)', () => {
  const plan = computeRefundRecoveryPlan({
    sellerEscrowReleased: false,
    sellerId: 'seller_123',
    subtotalGbp: 0,
    platformChargeGbp: 0,
    postageFeeGbp: 0,
    totalGbp: 0,
  });

  assert.equal(plan.postBuyerRefund, false);
  assert.equal(plan.postSellerRecovery, false);
  assert.equal(plan.reversePlatformFee, false);
  assert.equal(plan.reversePostage, false);
});
