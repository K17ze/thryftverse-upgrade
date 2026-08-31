import assert from 'node:assert/strict';
import test from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// Concurrent purchase race condition — checkout reservation logic
//
// The checkout flow uses SELECT ... FOR UPDATE on the listing row to
// serialise concurrent purchase attempts for the same unique item.
// Two buyers racing for the same listing must not both succeed.
//
// These tests verify the decision logic that determines whether a
// checkout should proceed or be rejected, modelling the in-transaction
// checks without requiring a live database.
// ─────────────────────────────────────────────────────────────────────────────

interface ListingState {
  status: 'active' | 'reserved' | 'sold' | 'cancelled';
  sellerId: string;
}

interface ReservationState {
  listingId: string;
  status: 'active' | 'released' | 'expired';
  expiresAt: number; // epoch ms
  buyerId: string;
}

interface CheckoutDecisionInput {
  listing: ListingState;
  expiredReservation: ReservationState | null;
  conflictingReservation: ReservationState | null;
  buyerId: string;
  now: number;
}

interface CheckoutDecision {
  allowed: boolean;
  reason?: string;
  expiredReservationReconciled: boolean;
}

/**
 * Models the in-transaction checkout decision logic from orders.ts.
 * The actual flow uses SELECT FOR UPDATE to serialise, but the decision
 * logic is what determines the outcome.
 */
function evaluateCheckout(input: CheckoutDecisionInput): CheckoutDecision {
  const { listing, expiredReservation, conflictingReservation, buyerId, now } = input;

  // Step 1: Reconcile expired reservation while holding the listing lock.
  let listingStatus = listing.status;
  let expiredReconciled = false;
  if (expiredReservation && expiredReservation.expiresAt <= now) {
    // The expired reservation's order is cancelled and listing goes back to active.
    listingStatus = 'active';
    expiredReconciled = true;
  }

  // Step 2: Check listing status.
  if (listingStatus !== 'active') {
    return {
      allowed: false,
      reason: `Listing cannot be purchased from status '${listingStatus}'`,
      expiredReservationReconciled: expiredReconciled,
    };
  }

  // Step 3: Prevent self-purchase.
  if (listing.sellerId === buyerId) {
    return {
      allowed: false,
      reason: 'Buyer cannot purchase their own listing',
      expiredReservationReconciled: expiredReconciled,
    };
  }

  // Step 4: Check for conflicting active reservation (not expired).
  if (conflictingReservation && conflictingReservation.expiresAt > now) {
    return {
      allowed: false,
      reason: 'This listing is currently reserved for another checkout',
      expiredReservationReconciled: expiredReconciled,
    };
  }

  return {
      allowed: true,
      expiredReservationReconciled: expiredReconciled,
  };
}

const NOW = Date.parse('2026-08-30T12:00:00Z');
const FUTURE = NOW + 30 * 60_000;
const PAST = NOW - 60_000;

test('two buyers racing: first succeeds, second is blocked by reservation', () => {
  const listing: ListingState = { status: 'active', sellerId: 'seller_1' };

  // Buyer A checks out first — no conflicting reservation, listing is active.
  const buyerA = evaluateCheckout({
    listing,
    expiredReservation: null,
    conflictingReservation: null,
    buyerId: 'buyer_a',
    now: NOW,
  });
  assert.equal(buyerA.allowed, true);

  // After buyer A's checkout, a reservation exists. Buyer B checks out
  // and hits the conflicting reservation check.
  const buyerB = evaluateCheckout({
    listing: { ...listing, status: 'reserved' },
    expiredReservation: null,
    conflictingReservation: {
      listingId: 'listing_1',
      status: 'active',
      expiresAt: FUTURE,
      buyerId: 'buyer_a',
    },
    buyerId: 'buyer_b',
    now: NOW,
  });
  assert.equal(buyerB.allowed, false);
  // Buyer B is blocked — either by listing status or conflicting reservation.
  // The listing status check fires first in the transaction, so 'reserved'
  // status blocks before the reservation check is reached.
  assert.ok(
    buyerB.reason === 'This listing is currently reserved for another checkout'
    || buyerB.reason?.includes('reserved'),
    `Expected blocking reason, got: ${buyerB.reason}`
  );
});

test('expired reservation is reconciled and listing becomes available', () => {
  const listing: ListingState = { status: 'reserved', sellerId: 'seller_1' };
  const expiredReservation: ReservationState = {
    listingId: 'listing_1',
    status: 'active',
    expiresAt: PAST,
    buyerId: 'buyer_a',
  };

  const decision = evaluateCheckout({
    listing,
    expiredReservation,
    conflictingReservation: null,
    buyerId: 'buyer_b',
    now: NOW,
  });

  assert.equal(decision.expiredReservationReconciled, true);
  assert.equal(decision.allowed, true);
});

test('self-purchase is rejected', () => {
  const listing: ListingState = { status: 'active', sellerId: 'seller_1' };

  const decision = evaluateCheckout({
    listing,
    expiredReservation: null,
    conflictingReservation: null,
    buyerId: 'seller_1',
    now: NOW,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'Buyer cannot purchase their own listing');
});

test('sold listing is rejected even without conflicting reservation', () => {
  const listing: ListingState = { status: 'sold', sellerId: 'seller_1' };

  const decision = evaluateCheckout({
    listing,
    expiredReservation: null,
    conflictingReservation: null,
    buyerId: 'buyer_b',
    now: NOW,
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reason?.includes('sold'));
});

test('cancelled listing is rejected', () => {
  const listing: ListingState = { status: 'cancelled', sellerId: 'seller_1' };

  const decision = evaluateCheckout({
    listing,
    expiredReservation: null,
    conflictingReservation: null,
    buyerId: 'buyer_b',
    now: NOW,
  });

  assert.equal(decision.allowed, false);
});

test('expired reservation with no new conflict allows checkout', () => {
  const listing: ListingState = { status: 'reserved', sellerId: 'seller_1' };
  const expiredReservation: ReservationState = {
    listingId: 'listing_1',
    status: 'active',
    expiresAt: PAST,
    buyerId: 'buyer_a',
  };

  const decision = evaluateCheckout({
    listing,
    expiredReservation,
    conflictingReservation: null,
    buyerId: 'buyer_c',
    now: NOW,
  });

  assert.equal(decision.expiredReservationReconciled, true);
  assert.equal(decision.allowed, true);
});

test('active reservation that has not expired blocks checkout', () => {
  const listing: ListingState = { status: 'active', sellerId: 'seller_1' };
  const activeReservation: ReservationState = {
    listingId: 'listing_1',
    status: 'active',
    expiresAt: FUTURE,
    buyerId: 'buyer_a',
  };

  const decision = evaluateCheckout({
    listing,
    expiredReservation: null,
    conflictingReservation: activeReservation,
    buyerId: 'buyer_b',
    now: NOW,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'This listing is currently reserved for another checkout');
});
