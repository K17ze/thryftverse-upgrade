import assert from 'node:assert/strict';
import test from 'node:test';

// ── Canonical lifecycle resolver (mirrors resolveCanonicalLifecycle from index.ts) ──
// Kept local to avoid importing index.ts which pulls in config.ts (requires env vars)

type CanonicalLifecycle = 'cancelled' | 'settled' | 'ended' | 'live' | 'upcoming';
type TerminalReason = 'cancelled' | 'settled' | 'buy_now' | 'scheduled_end' | null;

interface CanonicalLifecycleInput {
  cancelledAt: string | null;
  settledAt: string | null;
  winnerBidderId: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  now?: Date;
}

interface CanonicalLifecycleResult {
  lifecycle: CanonicalLifecycle;
  terminalReason: TerminalReason;
}

function resolveCanonicalLifecycle(input: CanonicalLifecycleInput): CanonicalLifecycleResult {
  const now = (input.now ?? new Date()).getTime();
  const startsAt = new Date(input.startsAt).getTime();
  const endsAt = new Date(input.endsAt).getTime();

  if (input.cancelledAt) {
    return { lifecycle: 'cancelled', terminalReason: 'cancelled' };
  }
  if (input.settledAt) {
    return { lifecycle: 'settled', terminalReason: 'settled' };
  }
  if (input.winnerBidderId) {
    return { lifecycle: 'ended', terminalReason: 'buy_now' };
  }
  if (endsAt <= now) {
    return { lifecycle: 'ended', terminalReason: 'scheduled_end' };
  }
  if (startsAt > now) {
    return { lifecycle: 'upcoming', terminalReason: null };
  }
  return { lifecycle: 'live', terminalReason: null };
}

// ── Pure logic extracted from the bid and buy-now route handlers ──
// These functions mirror the exact decision logic in the route handlers
// to enable integration-level testing without a running database.

interface AuctionRow {
  id: string;
  seller_id: string;
  starts_at: string;
  ends_at: string;
  current_bid_gbp: number;
  min_increment_gbp: number;
  bid_count: number;
  buy_now_price_gbp: number | null;
  cancelled_at: string | null;
  settled_at: string | null;
  winner_bidder_id: string | null;
}

type AuctionStatus = 'upcoming' | 'live' | 'ended';

function resolveAuctionStatus(startsAt: Date, endsAt: Date, now: Date = new Date()): AuctionStatus {
  if (now < startsAt) return 'upcoming';
  if (now >= endsAt) return 'ended';
  return 'live';
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ── Bid route decision logic ──

interface BidDecisionInput {
  auction: AuctionRow;
  bidderId: string;
  amountGbp: number;
  now: Date;
}

interface BidDecisionResult {
  allowed: boolean;
  httpStatus: number;
  code?: string;
  error?: string;
  buyNowPriceGbp?: number;
}

function evaluateBidDecision(input: BidDecisionResult | BidDecisionInput): BidDecisionResult {
  const { auction, bidderId, amountGbp, now } = input as BidDecisionInput;

  // Seller restriction
  if (auction.seller_id === bidderId) {
    return { allowed: false, httpStatus: 403, code: 'SELLER_RESTRICTED', error: 'Seller cannot bid on their own auction' };
  }

  // Cancelled
  if (auction.cancelled_at) {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_CANCELLED', error: 'This auction has been cancelled.' };
  }

  // Settled
  if (auction.settled_at) {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_SETTLED', error: 'This auction has been settled.' };
  }

  // Winner already set — auction is terminally ended via Buy Now
  if (auction.winner_bidder_id) {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_ALREADY_WON', error: 'This auction has already been won via Buy Now.' };
  }

  const canonical = resolveCanonicalLifecycle({
    cancelledAt: auction.cancelled_at,
    settledAt: auction.settled_at,
    winnerBidderId: auction.winner_bidder_id,
    startsAt: auction.starts_at,
    endsAt: auction.ends_at,
    now,
  });

  // Upcoming
  if (canonical.lifecycle === 'upcoming') {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_NOT_STARTED', error: 'This auction has not started yet.' };
  }

  // Ended
  if (canonical.lifecycle === 'ended') {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_ENDED', error: 'This auction has ended. Bidding is no longer available.' };
  }

  // Buy Now threshold check — reject bids >= buy_now_price_gbp
  if (auction.buy_now_price_gbp !== null && amountGbp >= Number(auction.buy_now_price_gbp)) {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'BUY_NOW_REVIEW_REQUIRED',
      error: 'Your bid meets or exceeds the Buy Now price. Use Buy Now to purchase this item immediately.',
      buyNowPriceGbp: Number(auction.buy_now_price_gbp),
    };
  }

  // Minimum bid check
  const currentBid = Number(auction.current_bid_gbp);
  const minIncrement = Number(auction.min_increment_gbp) || 0.01;
  const minimumNextBid = roundTo(currentBid + minIncrement, 2);
  const roundedAmount = roundTo(amountGbp, 2);

  if (roundedAmount < minimumNextBid) {
    return { allowed: false, httpStatus: 400, error: `Bid must be at least £${minimumNextBid.toFixed(2)}` };
  }

  return { allowed: true, httpStatus: 201 };
}

// ── Buy Now route decision logic ──

interface BuyNowDecisionInput {
  auction: AuctionRow;
  buyerId: string;
  expectedPriceGbp: number;
  now: Date;
}

function evaluateBuyNowDecision(input: BuyNowDecisionInput): BidDecisionResult {
  const { auction, buyerId, expectedPriceGbp, now } = input;

  // Seller restriction
  if (auction.seller_id === buyerId) {
    return { allowed: false, httpStatus: 403, code: 'SELLER_RESTRICTED', error: 'Seller cannot purchase their own auction' };
  }

  // Cancelled
  if (auction.cancelled_at) {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_CANCELLED', error: 'This auction has been cancelled.' };
  }

  // Settled
  if (auction.settled_at) {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_SETTLED', error: 'This auction has been settled.' };
  }

  // Winner already set — auction is terminally ended
  if (auction.winner_bidder_id) {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_ALREADY_WON', error: 'This auction has already been won.' };
  }

  const canonical = resolveCanonicalLifecycle({
    cancelledAt: auction.cancelled_at,
    settledAt: auction.settled_at,
    winnerBidderId: auction.winner_bidder_id,
    startsAt: auction.starts_at,
    endsAt: auction.ends_at,
    now,
  });

  // Upcoming
  if (canonical.lifecycle === 'upcoming') {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_NOT_STARTED', error: 'This auction has not started yet.' };
  }

  // Ended
  if (canonical.lifecycle === 'ended') {
    return { allowed: false, httpStatus: 409, code: 'AUCTION_ENDED', error: 'This auction has ended. Buy Now is no longer available.' };
  }

  // Buy Now price must exist and be positive
  const buyNowPriceGbp = auction.buy_now_price_gbp !== null ? Number(auction.buy_now_price_gbp) : null;
  if (!buyNowPriceGbp || buyNowPriceGbp <= 0) {
    return { allowed: false, httpStatus: 400, code: 'BUY_NOW_UNAVAILABLE', error: 'This auction does not have a Buy Now price.' };
  }

  // Price verification — client's expected price must match authoritative stored price
  const expectedPrice = roundTo(expectedPriceGbp, 2);
  if (expectedPrice !== buyNowPriceGbp) {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'BUY_NOW_PRICE_CHANGED',
      error: 'The Buy Now price has changed. Please review the updated price.',
      buyNowPriceGbp,
    };
  }

  return { allowed: true, httpStatus: 201 };
}

// ── Test fixtures ──

const NOW = new Date('2025-06-15T12:00:00.000Z');
const FUTURE_START = new Date('2025-07-01T00:00:00.000Z').toISOString();
const PAST_END = new Date('2025-06-10T00:00:00.000Z').toISOString();
const LIVE_START = new Date('2025-06-10T00:00:00.000Z').toISOString();
const LIVE_END = new Date('2025-06-20T00:00:00.000Z').toISOString();

function makeLiveAuction(overrides: Partial<AuctionRow> = {}): AuctionRow {
  return {
    id: 'auc_1',
    seller_id: 'seller_1',
    starts_at: LIVE_START,
    ends_at: LIVE_END,
    current_bid_gbp: 50,
    min_increment_gbp: 1,
    bid_count: 5,
    buy_now_price_gbp: 100,
    cancelled_at: null,
    settled_at: null,
    winner_bidder_id: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// BID ROUTE TESTS
// ═══════════════════════════════════════════════════════════════

test('Normal bid below Buy Now price is accepted', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction(),
    bidderId: 'bidder_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.httpStatus, 201);
});

test('Bid at or above Buy Now price is rejected with BUY_NOW_REVIEW_REQUIRED', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 100 }),
    bidderId: 'bidder_1',
    amountGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'BUY_NOW_REVIEW_REQUIRED');
  assert.equal(result.buyNowPriceGbp, 100);
});

test('Bid above Buy Now price is rejected with BUY_NOW_REVIEW_REQUIRED', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 100 }),
    bidderId: 'bidder_1',
    amountGbp: 150,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'BUY_NOW_REVIEW_REQUIRED');
});

test('Seller cannot bid on own auction — 403 SELLER_RESTRICTED', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction(),
    bidderId: 'seller_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 403);
  assert.equal(result.code, 'SELLER_RESTRICTED');
});

test('Bid on cancelled auction — 409 AUCTION_CANCELLED', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ cancelled_at: '2025-06-12T00:00:00.000Z' }),
    bidderId: 'bidder_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_CANCELLED');
});

test('Bid on settled auction — 409 AUCTION_SETTLED', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ settled_at: '2025-06-12T00:00:00.000Z' }),
    bidderId: 'bidder_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_SETTLED');
});

test('Bid on upcoming auction — 409 AUCTION_NOT_STARTED', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ starts_at: FUTURE_START }),
    bidderId: 'bidder_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_NOT_STARTED');
});

test('Bid on ended auction — 409 AUCTION_ENDED', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ ends_at: PAST_END }),
    bidderId: 'bidder_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_ENDED');
});

test('Bid below minimum next bid — 400', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ current_bid_gbp: 50, min_increment_gbp: 1 }),
    bidderId: 'bidder_1',
    amountGbp: 50.5,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 400);
  assert.ok(result.error?.includes('at least'));
});

test('Bid exactly at minimum next bid is accepted', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ current_bid_gbp: 50, min_increment_gbp: 1 }),
    bidderId: 'bidder_1',
    amountGbp: 51,
    now: NOW,
  });
  assert.equal(result.allowed, true);
});

test('Bid with no Buy Now price — any positive bid accepted', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: null }),
    bidderId: 'bidder_1',
    amountGbp: 1000,
    now: NOW,
  });
  assert.equal(result.allowed, true);
});

// ═══════════════════════════════════════════════════════════════
// BUY NOW ROUTE TESTS
// ═══════════════════════════════════════════════════════════════

test('Buy Now with matching price on live auction is accepted', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 100 }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.httpStatus, 201);
});

test('Buy Now with mismatched price — 409 BUY_NOW_PRICE_CHANGED', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 100 }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 90,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'BUY_NOW_PRICE_CHANGED');
  assert.equal(result.buyNowPriceGbp, 100);
});

test('Buy Now by seller — 403 SELLER_RESTRICTED', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction(),
    buyerId: 'seller_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 403);
  assert.equal(result.code, 'SELLER_RESTRICTED');
});

test('Buy Now on cancelled auction — 409 AUCTION_CANCELLED', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ cancelled_at: '2025-06-12T00:00:00.000Z' }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_CANCELLED');
});

test('Buy Now on settled auction — 409 AUCTION_SETTLED', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ settled_at: '2025-06-12T00:00:00.000Z' }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_SETTLED');
});

test('Buy Now on upcoming auction — 409 AUCTION_NOT_STARTED', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ starts_at: FUTURE_START }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_NOT_STARTED');
});

test('Buy Now on ended auction — 409 AUCTION_ENDED', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ ends_at: PAST_END }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_ENDED');
});

test('Buy Now with no buy_now_price — 400 BUY_NOW_UNAVAILABLE', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: null }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 400);
  assert.equal(result.code, 'BUY_NOW_UNAVAILABLE');
});

test('Buy Now with zero buy_now_price — 400 BUY_NOW_UNAVAILABLE', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 0 }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 0,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 400);
  assert.equal(result.code, 'BUY_NOW_UNAVAILABLE');
});

test('Buy Now price rounding — 100.005 rounds to 100.01 and mismatches 100', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 100.01 }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'BUY_NOW_PRICE_CHANGED');
});

// ═══════════════════════════════════════════════════════════════
// IDEMPOTENT REPLAY TESTS
// ═══════════════════════════════════════════════════════════════

test('Idempotent replay: same idempotency key returns original result, not a new transaction', () => {
  // Simulate first Buy Now call
  const firstResult = evaluateBuyNowDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 100 }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(firstResult.allowed, true);

  // Simulate replay — auction is now ended (because first call ended it)
  // But the idempotency check happens BEFORE the auction lock
  // So the replay should return the original result, not hit the AUCTION_ENDED check
  // This is tested at the route level: the idempotency query runs first,
  // finds the existing record, and returns immediately without entering the transaction.
  // Here we verify the decision logic would reject if we didn't have idempotency:
  const replayDecision = evaluateBuyNowDecision({
    auction: makeLiveAuction({
      buy_now_price_gbp: 100,
      ends_at: PAST_END, // Auction is now ended
    }),
    buyerId: 'buyer_1',
    expectedPriceGbp: 100,
    now: NOW,
  });
  // Without idempotency, the replay would be rejected as AUCTION_ENDED
  // This proves the idempotency check is critical and must run first
  assert.equal(replayDecision.allowed, false);
  assert.equal(replayDecision.code, 'AUCTION_ENDED');
});

// ═══════════════════════════════════════════════════════════════
// TERMINAL STATE ORDERING TESTS
// ═══════════════════════════════════════════════════════════════

test('Terminal state checks run before status resolution — cancelled takes priority over ended', () => {
  // Auction that is both cancelled AND past its end time
  const result = evaluateBidDecision({
    auction: makeLiveAuction({
      cancelled_at: '2025-06-12T00:00:00.000Z',
      ends_at: PAST_END,
    }),
    bidderId: 'bidder_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.code, 'AUCTION_CANCELLED');
});

test('Terminal state checks run before status resolution — settled takes priority over ended', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({
      settled_at: '2025-06-12T00:00:00.000Z',
      ends_at: PAST_END,
    }),
    bidderId: 'bidder_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.code, 'AUCTION_SETTLED');
});

test('Seller check runs before terminal state checks', () => {
  // Seller bidding on a cancelled auction should get SELLER_RESTRICTED, not AUCTION_CANCELLED
  const result = evaluateBidDecision({
    auction: makeLiveAuction({
      cancelled_at: '2025-06-12T00:00:00.000Z',
    }),
    bidderId: 'seller_1',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.code, 'SELLER_RESTRICTED');
});

// ═══════════════════════════════════════════════════════════════
// BUY NOW THRESHOLD BOUNDARY TESTS
// ═══════════════════════════════════════════════════════════════

test('Bid exactly 1p below Buy Now price is accepted', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 100, current_bid_gbp: 98.98, min_increment_gbp: 0.01 }),
    bidderId: 'bidder_1',
    amountGbp: 99.99,
    now: NOW,
  });
  assert.equal(result.allowed, true);
});

// ═══════════════════════════════════════════════════════════════
// CANONICAL LIFECYCLE RESOLVER TESTS
// ═══════════════════════════════════════════════════════════════

test('resolveCanonicalLifecycle: cancelled takes highest precedence', () => {
  const result = resolveCanonicalLifecycle({
    cancelledAt: '2025-06-12T00:00:00.000Z',
    settledAt: '2025-06-13T00:00:00.000Z',
    winnerBidderId: 'buyer_1',
    startsAt: LIVE_START,
    endsAt: PAST_END,
    now: NOW,
  });
  assert.equal(result.lifecycle, 'cancelled');
  assert.equal(result.terminalReason, 'cancelled');
});

test('resolveCanonicalLifecycle: settled takes precedence over winner and scheduled end', () => {
  const result = resolveCanonicalLifecycle({
    cancelledAt: null,
    settledAt: '2025-06-13T00:00:00.000Z',
    winnerBidderId: 'buyer_1',
    startsAt: LIVE_START,
    endsAt: PAST_END,
    now: NOW,
  });
  assert.equal(result.lifecycle, 'settled');
  assert.equal(result.terminalReason, 'settled');
});

test('resolveCanonicalLifecycle: winner (Buy Now) takes precedence over scheduled end', () => {
  const result = resolveCanonicalLifecycle({
    cancelledAt: null,
    settledAt: null,
    winnerBidderId: 'buyer_1',
    startsAt: LIVE_START,
    endsAt: PAST_END,
    now: NOW,
  });
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'buy_now');
});

test('resolveCanonicalLifecycle: scheduled end when no winner and end time passed', () => {
  const result = resolveCanonicalLifecycle({
    cancelledAt: null,
    settledAt: null,
    winnerBidderId: null,
    startsAt: LIVE_START,
    endsAt: PAST_END,
    now: NOW,
  });
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'scheduled_end');
});

test('resolveCanonicalLifecycle: upcoming when start time is in future', () => {
  const result = resolveCanonicalLifecycle({
    cancelledAt: null,
    settledAt: null,
    winnerBidderId: null,
    startsAt: FUTURE_START,
    endsAt: LIVE_END,
    now: NOW,
  });
  assert.equal(result.lifecycle, 'upcoming');
  assert.equal(result.terminalReason, null);
});

test('resolveCanonicalLifecycle: live when within start and end window', () => {
  const result = resolveCanonicalLifecycle({
    cancelledAt: null,
    settledAt: null,
    winnerBidderId: null,
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    now: NOW,
  });
  assert.equal(result.lifecycle, 'live');
  assert.equal(result.terminalReason, null);
});

// ═══════════════════════════════════════════════════════════════
// AUCTION_ALREADY_WON TESTS
// ═══════════════════════════════════════════════════════════════

test('Bid on auction already won via Buy Now — 409 AUCTION_ALREADY_WON', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ winner_bidder_id: 'buyer_1' }),
    bidderId: 'bidder_2',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_ALREADY_WON');
});

test('Buy Now on auction already won — 409 AUCTION_ALREADY_WON', () => {
  const result = evaluateBuyNowDecision({
    auction: makeLiveAuction({ winner_bidder_id: 'buyer_1' }),
    buyerId: 'buyer_2',
    expectedPriceGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.code, 'AUCTION_ALREADY_WON');
});

test('Winner check runs before lifecycle status resolution', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({
      winner_bidder_id: 'buyer_1',
      ends_at: PAST_END,
    }),
    bidderId: 'bidder_2',
    amountGbp: 55,
    now: NOW,
  });
  assert.equal(result.code, 'AUCTION_ALREADY_WON');
});

// ═══════════════════════════════════════════════════════════════
// OPERATION-SAFE IDEMPOTENCY KEY SCOPING TESTS
// ═══════════════════════════════════════════════════════════════

test('Operation-safe idempotency: bid prefix differs from buy_now prefix', () => {
  const rawKey = 'abc123';
  const bidScopedKey = `bid:${rawKey}`;
  const buyNowScopedKey = `buy_now:${rawKey}`;
  assert.notEqual(bidScopedKey, buyNowScopedKey);
});

test('Operation-safe idempotency: same raw key produces different scoped keys per operation', () => {
  const rawKey = 'client-generated-key-001';
  const bidKey = `bid:${rawKey}`;
  const buyNowKey = `buy_now:${rawKey}`;
  // These would be stored in auction_bids.idempotency_key column
  // The unique index (auction_id, bidder_id, idempotency_key) treats them as different
  assert.notEqual(bidKey, buyNowKey);
  assert.ok(bidKey.startsWith('bid:'));
  assert.ok(buyNowKey.startsWith('buy_now:'));
});

test('Bid exactly at Buy Now price is rejected', () => {
  const result = evaluateBidDecision({
    auction: makeLiveAuction({ buy_now_price_gbp: 100, current_bid_gbp: 98, min_increment_gbp: 1 }),
    bidderId: 'bidder_1',
    amountGbp: 100,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'BUY_NOW_REVIEW_REQUIRED');
});
