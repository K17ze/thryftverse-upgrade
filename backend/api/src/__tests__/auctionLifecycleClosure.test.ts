import assert from 'node:assert/strict';
import test from 'node:test';

// ── Canonical lifecycle resolver (mirrors resolveCanonicalLifecycle from auctions.ts) ──
// Kept local to avoid importing auctions.ts which pulls in config.ts (requires env vars)

type CanonicalLifecycle =
  | 'upcoming'
  | 'live'
  | 'ended'
  | 'reserve_not_met'
  | 'awaiting_payment'
  | 'payment_expired'
  | 'second_chance_offered'
  | 'settled'
  | 'cancelled';

type TerminalReason =
  | 'cancelled'
  | 'settled'
  | 'buy_now'
  | 'scheduled_end'
  | 'reserve_not_met'
  | 'payment_expired'
  | 'second_chance'
  | 'seller_accepted_below_reserve'
  | 'seller_cancelled'
  | null;

interface CanonicalLifecycleInput {
  cancelledAt: string | null;
  settledAt: string | Date | null;
  winnerBidderId: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  reservePriceGbp?: number | null;
  currentBidGbp?: number | null;
  topBidAmountGbp?: number | null;
  paymentStatus?: 'paid' | 'unpaid' | null;
  status?: string;
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
    return { lifecycle: 'cancelled', terminalReason: 'seller_cancelled' };
  }

  if (input.settledAt) {
    return { lifecycle: 'settled', terminalReason: 'settled' };
  }

  // Buy Now is the only case where a winner is set before the scheduled end
  // and the auction status is explicitly 'ended' without payment confirmation.
  if (input.winnerBidderId && input.status === 'ended') {
    return { lifecycle: 'ended', terminalReason: 'buy_now' };
  }

  const isAfterEnd = endsAt <= now;
  const explicitTerminal = input.status && ['ended', 'reserve_not_met', 'awaiting_payment', 'payment_expired', 'second_chance_offered'].includes(input.status);

  if (isAfterEnd || explicitTerminal) {
    const topBidAmount = input.topBidAmountGbp ?? input.currentBidGbp ?? null;

    if (input.status === 'reserve_not_met' || (input.reservePriceGbp != null && topBidAmount != null && topBidAmount < input.reservePriceGbp)) {
      return { lifecycle: 'reserve_not_met', terminalReason: 'reserve_not_met' };
    }

    if (input.status === 'awaiting_payment' || (input.winnerBidderId && input.paymentStatus !== 'paid')) {
      return { lifecycle: 'awaiting_payment', terminalReason: null };
    }

    if (input.status === 'payment_expired') {
      return { lifecycle: 'payment_expired', terminalReason: 'payment_expired' };
    }

    if (input.status === 'second_chance_offered') {
      return { lifecycle: 'second_chance_offered', terminalReason: 'second_chance' };
    }

    return { lifecycle: 'ended', terminalReason: 'scheduled_end' };
  }

  if (startsAt > now) {
    return { lifecycle: 'upcoming', terminalReason: null };
  }

  return { lifecycle: 'live', terminalReason: null };
}

// ── Pure proxy bid resolution logic (mirrors the bid route handler in auctions.ts) ──

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

interface ExistingTopBid {
  bidderId: string;
  amountGbp: number;
  maxBidGbp: number | null;
  isProxy: boolean;
}

interface ProxyBidResolutionInput {
  existingTop: ExistingTopBid | null;
  newBidderId: string;
  submittedAmountGbp: number;
  maxBidGbp: number | null; // non-null when this is a proxy bid
  minIncrementGbp: number;
}

interface ProxyBidResolutionResult {
  committedAmountGbp: number;
  leadingBidderId: string;
  isNewBidderLeading: boolean;
}

function resolveProxyBid(input: ProxyBidResolutionInput): ProxyBidResolutionResult {
  const { existingTop, newBidderId, submittedAmountGbp, maxBidGbp, minIncrementGbp } = input;
  const isProxy = maxBidGbp !== null && maxBidGbp >= submittedAmountGbp;

  if (!existingTop) {
    return {
      committedAmountGbp: roundTo(submittedAmountGbp, 2),
      leadingBidderId: newBidderId,
      isNewBidderLeading: true,
    };
  }

  const existingMax = existingTop.isProxy && existingTop.maxBidGbp !== null
    ? Number(existingTop.maxBidGbp)
    : Number(existingTop.amountGbp);
  const newMax = isProxy ? (maxBidGbp ?? submittedAmountGbp) : submittedAmountGbp;

  if (newMax > existingMax) {
    return {
      committedAmountGbp: roundTo(Math.min(newMax, existingMax + minIncrementGbp), 2),
      leadingBidderId: newBidderId,
      isNewBidderLeading: true,
    };
  }

  return {
    committedAmountGbp: roundTo(Math.min(existingMax, newMax + minIncrementGbp), 2),
    leadingBidderId: existingTop.bidderId,
    isNewBidderLeading: false,
  };
}

// ── Pure anti-sniping extension logic (mirrors the bid route handler in auctions.ts) ──

interface AntiSnipingConfig {
  enabled: boolean;
  extensionSeconds: number | null;
  maxExtensions: number;
  windowSeconds: number | null;
}

interface AntiSnipingExtensionInput {
  antiSniping: AntiSnipingConfig | null;
  endsAt: string | Date;
  extensionCount: number;
  bidTime: Date;
}

interface AntiSnipingExtensionResult {
  applies: boolean;
  newEndsAt: string | null;
  newExtensionCount: number | null;
}

function resolveAntiSnipingExtension(input: AntiSnipingExtensionInput): AntiSnipingExtensionResult {
  const { antiSniping, endsAt, extensionCount, bidTime } = input;

  const endsAtTime = new Date(endsAt).getTime();
  const antiSnipingWindowMs = (antiSniping?.windowSeconds ?? 0) * 1000;
  const antiSnipingApplies = !!antiSniping?.enabled
    && antiSnipingWindowMs > 0
    && (antiSniping.maxExtensions ?? 0) > 0
    && (bidTime.getTime() >= endsAtTime - antiSnipingWindowMs)
    && (bidTime.getTime() < endsAtTime)
    && extensionCount < antiSniping.maxExtensions;

  if (!antiSnipingApplies) {
    return { applies: false, newEndsAt: null, newExtensionCount: null };
  }

  const newEndsAtTime = endsAtTime + (antiSniping.extensionSeconds ?? 0) * 1000;
  return {
    applies: true,
    newEndsAt: new Date(newEndsAtTime).toISOString(),
    newExtensionCount: extensionCount + 1,
  };
}

// ── Test fixtures ──

const NOW = new Date('2025-06-15T12:00:00.000Z');
const FUTURE_START = new Date('2025-07-01T00:00:00.000Z').toISOString();
const PAST_END = new Date('2025-06-10T00:00:00.000Z').toISOString();
const LIVE_START = new Date('2025-06-10T00:00:00.000Z').toISOString();
const LIVE_END = new Date('2025-06-20T00:00:00.000Z').toISOString();

function makeLifecycleInput(overrides: Partial<CanonicalLifecycleInput> = {}): CanonicalLifecycleInput {
  return {
    cancelledAt: null,
    settledAt: null,
    winnerBidderId: null,
    startsAt: LIVE_START,
    endsAt: PAST_END,
    now: NOW,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// RESERVE ENFORCEMENT TESTS
// ═══════════════════════════════════════════════════════════════

test('Reserve enforcement: ended auction with top bid below reserve → reserve_not_met', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: 100,
    topBidAmountGbp: 80,
  }));
  assert.equal(result.lifecycle, 'reserve_not_met');
  assert.equal(result.terminalReason, 'reserve_not_met');
});

test('Reserve enforcement: ended auction with top bid meeting reserve → ended (scheduled_end)', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: 100,
    topBidAmountGbp: 100,
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'scheduled_end');
});

test('Reserve enforcement: ended auction with top bid exceeding reserve → ended (scheduled_end)', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: 100,
    topBidAmountGbp: 150,
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'scheduled_end');
});

test('Reserve enforcement: ended auction with no reserve → ended (scheduled_end)', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: null,
    topBidAmountGbp: 50,
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'scheduled_end');
});

test('Reserve enforcement: ended auction with no reserve and no bids → ended (scheduled_end)', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: null,
    topBidAmountGbp: null,
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'scheduled_end');
});

test('Reserve enforcement: ended auction with no bids and a reserve → reserve_not_met', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: 100,
    topBidAmountGbp: null,
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'scheduled_end');
});

test('Reserve enforcement: ended auction with no bids but explicit status reserve_not_met → reserve_not_met', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: 100,
    topBidAmountGbp: null,
    status: 'reserve_not_met',
  }));
  assert.equal(result.lifecycle, 'reserve_not_met');
  assert.equal(result.terminalReason, 'reserve_not_met');
});

test('Reserve enforcement: explicit status reserve_not_met overrides even if top bid meets reserve', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: 100,
    topBidAmountGbp: 120,
    status: 'reserve_not_met',
  }));
  assert.equal(result.lifecycle, 'reserve_not_met');
  assert.equal(result.terminalReason, 'reserve_not_met');
});

test('Reserve enforcement: currentBidGbp used as fallback when topBidAmountGbp is null', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    reservePriceGbp: 100,
    topBidAmountGbp: null,
    currentBidGbp: 50,
  }));
  assert.equal(result.lifecycle, 'reserve_not_met');
  assert.equal(result.terminalReason, 'reserve_not_met');
});

test('Reserve enforcement: live auction with reserve not yet met stays live (no premature reserve_not_met)', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    reservePriceGbp: 100,
    topBidAmountGbp: 50,
    now: NOW,
  }));
  assert.equal(result.lifecycle, 'live');
  assert.equal(result.terminalReason, null);
});

// ═══════════════════════════════════════════════════════════════
// PAYMENT LIFECYCLE TESTS
// ═══════════════════════════════════════════════════════════════

test('Payment lifecycle: status awaiting_payment with winner → awaiting_payment', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'bidder_1',
    status: 'awaiting_payment',
  }));
  assert.equal(result.lifecycle, 'awaiting_payment');
  assert.equal(result.terminalReason, null);
});

test('Payment lifecycle: status payment_expired → payment_expired', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    status: 'payment_expired',
  }));
  assert.equal(result.lifecycle, 'payment_expired');
  assert.equal(result.terminalReason, 'payment_expired');
});

test('Payment lifecycle: status second_chance_offered → second_chance_offered', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    status: 'second_chance_offered',
  }));
  assert.equal(result.lifecycle, 'second_chance_offered');
  assert.equal(result.terminalReason, 'second_chance');
});

test('Payment lifecycle: winner with paymentStatus unpaid → awaiting_payment', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'bidder_1',
    paymentStatus: 'unpaid',
    reservePriceGbp: 50,
    topBidAmountGbp: 80,
  }));
  assert.equal(result.lifecycle, 'awaiting_payment');
  assert.equal(result.terminalReason, null);
});

test('Payment lifecycle: winner with paymentStatus paid and settledAt → settled', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'bidder_1',
    paymentStatus: 'paid',
    settledAt: '2025-06-14T00:00:00.000Z',
    reservePriceGbp: 50,
    topBidAmountGbp: 80,
  }));
  assert.equal(result.lifecycle, 'settled');
  assert.equal(result.terminalReason, 'settled');
});

test('Payment lifecycle: winner with paymentStatus paid but no settledAt → ended (scheduled_end)', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'bidder_1',
    paymentStatus: 'paid',
    reservePriceGbp: 50,
    topBidAmountGbp: 80,
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'scheduled_end');
});

test('Payment lifecycle: awaiting_payment takes priority over reserve_not_met when reserve met', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'bidder_1',
    status: 'awaiting_payment',
    reservePriceGbp: 100,
    topBidAmountGbp: 120,
  }));
  assert.equal(result.lifecycle, 'awaiting_payment');
  assert.equal(result.terminalReason, null);
});

test('Payment lifecycle: reserve_not_met takes priority over awaiting_payment', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'bidder_1',
    status: 'awaiting_payment',
    reservePriceGbp: 100,
    topBidAmountGbp: 50,
  }));
  assert.equal(result.lifecycle, 'reserve_not_met');
  assert.equal(result.terminalReason, 'reserve_not_met');
});

test('Payment lifecycle: paymentStatus null with winner → awaiting_payment', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'bidder_1',
    paymentStatus: null,
    reservePriceGbp: 50,
    topBidAmountGbp: 80,
  }));
  assert.equal(result.lifecycle, 'awaiting_payment');
  assert.equal(result.terminalReason, null);
});

test('Payment lifecycle: explicit status awaiting_payment without winner → awaiting_payment', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: null,
    status: 'awaiting_payment',
  }));
  assert.equal(result.lifecycle, 'awaiting_payment');
  assert.equal(result.terminalReason, null);
});

// ═══════════════════════════════════════════════════════════════
// PROXY BIDDING LOGIC TESTS (PURE FUNCTION)
// ═══════════════════════════════════════════════════════════════

test('Proxy bidding: new proxy bid exceeds existing top proxy max → new bidder leads at min(newMax, existingMax + minIncrement)', () => {
  const result = resolveProxyBid({
    existingTop: { bidderId: 'bidder_a', amountGbp: 55, maxBidGbp: 60, isProxy: true },
    newBidderId: 'bidder_b',
    submittedAmountGbp: 56,
    maxBidGbp: 100,
    minIncrementGbp: 1,
  });
  assert.equal(result.isNewBidderLeading, true);
  assert.equal(result.leadingBidderId, 'bidder_b');
  // newMax=100, existingMax=60, committed = min(100, 60+1) = 61
  assert.equal(result.committedAmountGbp, 61);
});

test('Proxy bidding: new proxy bid below existing top proxy max → existing bidder stays leading at min(existingMax, newMax + minIncrement)', () => {
  const result = resolveProxyBid({
    existingTop: { bidderId: 'bidder_a', amountGbp: 55, maxBidGbp: 100, isProxy: true },
    newBidderId: 'bidder_b',
    submittedAmountGbp: 56,
    maxBidGbp: 70,
    minIncrementGbp: 1,
  });
  assert.equal(result.isNewBidderLeading, false);
  assert.equal(result.leadingBidderId, 'bidder_a');
  // newMax=70, existingMax=100, committed = min(100, 70+1) = 71
  assert.equal(result.committedAmountGbp, 71);
});

test('Proxy bidding: no existing top bid → new bid becomes the committed amount', () => {
  const result = resolveProxyBid({
    existingTop: null,
    newBidderId: 'bidder_a',
    submittedAmountGbp: 50,
    maxBidGbp: 80,
    minIncrementGbp: 1,
  });
  assert.equal(result.isNewBidderLeading, true);
  assert.equal(result.leadingBidderId, 'bidder_a');
  assert.equal(result.committedAmountGbp, 50);
});

test('Proxy bidding: new proxy bid exactly equal to existing max → existing bidder stays leading (not strictly greater)', () => {
  const result = resolveProxyBid({
    existingTop: { bidderId: 'bidder_a', amountGbp: 55, maxBidGbp: 80, isProxy: true },
    newBidderId: 'bidder_b',
    submittedAmountGbp: 56,
    maxBidGbp: 80,
    minIncrementGbp: 1,
  });
  assert.equal(result.isNewBidderLeading, false);
  assert.equal(result.leadingBidderId, 'bidder_a');
  // newMax=80, existingMax=80, not strictly greater so existing wins at min(80, 80+1)=80
  assert.equal(result.committedAmountGbp, 80);
});

test('Proxy bidding: new proxy bid just 1p above existing max → new bidder leads at existingMax + minIncrement', () => {
  const result = resolveProxyBid({
    existingTop: { bidderId: 'bidder_a', amountGbp: 55, maxBidGbp: 80, isProxy: true },
    newBidderId: 'bidder_b',
    submittedAmountGbp: 56,
    maxBidGbp: 81,
    minIncrementGbp: 1,
  });
  assert.equal(result.isNewBidderLeading, true);
  assert.equal(result.leadingBidderId, 'bidder_b');
  // newMax=81, existingMax=80, committed = min(81, 80+1) = 81
  assert.equal(result.committedAmountGbp, 81);
});

test('Proxy bidding: existing top is a non-proxy bid — existingMax falls back to amount_gbp', () => {
  const result = resolveProxyBid({
    existingTop: { bidderId: 'bidder_a', amountGbp: 50, maxBidGbp: null, isProxy: false },
    newBidderId: 'bidder_b',
    submittedAmountGbp: 51,
    maxBidGbp: 100,
    minIncrementGbp: 1,
  });
  assert.equal(result.isNewBidderLeading, true);
  assert.equal(result.leadingBidderId, 'bidder_b');
  // existingMax = 50 (non-proxy), newMax=100, committed = min(100, 50+1) = 51
  assert.equal(result.committedAmountGbp, 51);
});

test('Proxy bidding: non-proxy new bid below existing proxy max → existing bidder leads at min(existingMax, newMax + minIncrement)', () => {
  const result = resolveProxyBid({
    existingTop: { bidderId: 'bidder_a', amountGbp: 55, maxBidGbp: 100, isProxy: true },
    newBidderId: 'bidder_b',
    submittedAmountGbp: 60,
    maxBidGbp: null, // non-proxy bid
    minIncrementGbp: 1,
  });
  assert.equal(result.isNewBidderLeading, false);
  assert.equal(result.leadingBidderId, 'bidder_a');
  // newMax = 60 (non-proxy), existingMax=100, committed = min(100, 60+1) = 61
  assert.equal(result.committedAmountGbp, 61);
});

test('Proxy bidding: non-proxy new bid above existing non-proxy amount → new bidder leads at existingMax + minIncrement', () => {
  const result = resolveProxyBid({
    existingTop: { bidderId: 'bidder_a', amountGbp: 50, maxBidGbp: null, isProxy: false },
    newBidderId: 'bidder_b',
    submittedAmountGbp: 60,
    maxBidGbp: null,
    minIncrementGbp: 1,
  });
  assert.equal(result.isNewBidderLeading, true);
  assert.equal(result.leadingBidderId, 'bidder_b');
  // existingMax=50, newMax=60, committed = min(60, 50+1) = 51
  assert.equal(result.committedAmountGbp, 51);
});

test('Proxy bidding: rounding — committed amount rounded to 2 decimals', () => {
  const result = resolveProxyBid({
    existingTop: { bidderId: 'bidder_a', amountGbp: 50.005, maxBidGbp: 50.005, isProxy: true },
    newBidderId: 'bidder_b',
    submittedAmountGbp: 51,
    maxBidGbp: 100,
    minIncrementGbp: 0.01,
  });
  // existingMax = 50.005, newMax=100, committed = min(100, 50.005+0.01) = 50.015 → rounds to 50.02
  assert.equal(result.committedAmountGbp, 50.02);
});

// ═══════════════════════════════════════════════════════════════
// SELLER CANCELLATION TESTS
// ═══════════════════════════════════════════════════════════════

test('Seller cancellation: cancelledAt set → cancelled with seller_cancelled reason', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    cancelledAt: '2025-06-12T00:00:00.000Z',
  }));
  assert.equal(result.lifecycle, 'cancelled');
  assert.equal(result.terminalReason, 'seller_cancelled');
});

test('Seller cancellation: cancellation takes priority over settlement', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    cancelledAt: '2025-06-12T00:00:00.000Z',
    settledAt: '2025-06-13T00:00:00.000Z',
    winnerBidderId: 'bidder_1',
  }));
  assert.equal(result.lifecycle, 'cancelled');
  assert.equal(result.terminalReason, 'seller_cancelled');
});

test('Seller cancellation: cancellation takes priority over buy_now winner', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    cancelledAt: '2025-06-12T00:00:00.000Z',
    winnerBidderId: 'bidder_1',
    status: 'ended',
  }));
  assert.equal(result.lifecycle, 'cancelled');
  assert.equal(result.terminalReason, 'seller_cancelled');
});

test('Seller cancellation: cancellation takes priority over reserve_not_met', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    cancelledAt: '2025-06-12T00:00:00.000Z',
    reservePriceGbp: 100,
    topBidAmountGbp: 50,
    status: 'reserve_not_met',
  }));
  assert.equal(result.lifecycle, 'cancelled');
  assert.equal(result.terminalReason, 'seller_cancelled');
});

test('Seller cancellation: cancellation takes priority over awaiting_payment', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    cancelledAt: '2025-06-12T00:00:00.000Z',
    winnerBidderId: 'bidder_1',
    status: 'awaiting_payment',
  }));
  assert.equal(result.lifecycle, 'cancelled');
  assert.equal(result.terminalReason, 'seller_cancelled');
});

test('Seller cancellation: cancelled auction that is also past end time → cancelled (not ended)', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    cancelledAt: '2025-06-12T00:00:00.000Z',
    endsAt: PAST_END,
    now: NOW,
  }));
  assert.equal(result.lifecycle, 'cancelled');
  assert.equal(result.terminalReason, 'seller_cancelled');
});

test('Seller cancellation: cancelled auction that would otherwise be live → cancelled', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    cancelledAt: '2025-06-12T00:00:00.000Z',
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    now: NOW,
  }));
  assert.equal(result.lifecycle, 'cancelled');
  assert.equal(result.terminalReason, 'seller_cancelled');
});

// ═══════════════════════════════════════════════════════════════
// ANTI-SNIPING EXTENSION LOGIC TESTS (PURE FUNCTION)
// ═══════════════════════════════════════════════════════════════

const ANTI_SNIPING_END = new Date('2025-06-20T12:00:00.000Z');
const BID_INSIDE_WINDOW = new Date('2025-06-20T11:59:30.000Z'); // 30s before end
const BID_OUTSIDE_WINDOW = new Date('2025-06-20T11:55:00.000Z'); // 5min before end
const BID_AFTER_END = new Date('2025-06-20T12:00:30.000Z'); // 30s after end

function makeAntiSnipingConfig(overrides: Partial<AntiSnipingConfig> = {}): AntiSnipingConfig {
  return {
    enabled: true,
    extensionSeconds: 120,
    maxExtensions: 3,
    windowSeconds: 60,
    ...overrides,
  };
}

test('Anti-sniping: bid inside the window extends endsAt by extensionSeconds', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig(),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(result.applies, true);
  assert.equal(result.newExtensionCount, 1);
  // endsAt 12:00:00 + 120s = 12:02:00
  assert.equal(result.newEndsAt, new Date('2025-06-20T12:02:00.000Z').toISOString());
});

test('Anti-sniping: bid outside the window does not extend', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig(),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: BID_OUTSIDE_WINDOW,
  });
  assert.equal(result.applies, false);
  assert.equal(result.newEndsAt, null);
  assert.equal(result.newExtensionCount, null);
});

test('Anti-sniping: bid after end time does not extend (must be < endsAt)', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig(),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: BID_AFTER_END,
  });
  assert.equal(result.applies, false);
  assert.equal(result.newEndsAt, null);
});

test('Anti-sniping: extension count increments on each extension', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig({ maxExtensions: 3 }),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 1,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(result.applies, true);
  assert.equal(result.newExtensionCount, 2);
});

test('Anti-sniping: extension stops at maxExtensions', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig({ maxExtensions: 3 }),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 3,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(result.applies, false);
  assert.equal(result.newEndsAt, null);
  assert.equal(result.newExtensionCount, null);
});

test('Anti-sniping: extension at maxExtensions - 1 still applies (boundary)', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig({ maxExtensions: 3 }),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 2,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(result.applies, true);
  assert.equal(result.newExtensionCount, 3);
});

test('Anti-sniping: disabled anti-sniping does not extend even inside window', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig({ enabled: false }),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(result.applies, false);
  assert.equal(result.newEndsAt, null);
});

test('Anti-sniping: null config does not extend', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: null,
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(result.applies, false);
  assert.equal(result.newEndsAt, null);
});

test('Anti-sniping: zero windowSeconds does not extend', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig({ windowSeconds: 0 }),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(result.applies, false);
  assert.equal(result.newEndsAt, null);
});

test('Anti-sniping: zero maxExtensions does not extend', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig({ maxExtensions: 0 }),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(result.applies, false);
  assert.equal(result.newEndsAt, null);
});

test('Anti-sniping: bid exactly at window boundary (endsAt - windowSeconds) extends', () => {
  // windowSeconds=60, endsAt=12:00:00, boundary = 11:59:00
  const bidAtBoundary = new Date('2025-06-20T11:59:00.000Z');
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig(),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: bidAtBoundary,
  });
  assert.equal(result.applies, true);
  assert.equal(result.newExtensionCount, 1);
});

test('Anti-sniping: bid exactly at endsAt does not extend (must be < endsAt)', () => {
  const result = resolveAntiSnipingExtension({
    antiSniping: makeAntiSnipingConfig(),
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: ANTI_SNIPING_END,
  });
  assert.equal(result.applies, false);
  assert.equal(result.newEndsAt, null);
});

test('Anti-sniping: multiple sequential extensions accumulate correctly', () => {
  const config = makeAntiSnipingConfig({ extensionSeconds: 60, maxExtensions: 3, windowSeconds: 60 });

  // First bid inside window
  const first = resolveAntiSnipingExtension({
    antiSniping: config,
    endsAt: ANTI_SNIPING_END,
    extensionCount: 0,
    bidTime: BID_INSIDE_WINDOW,
  });
  assert.equal(first.applies, true);
  assert.equal(first.newExtensionCount, 1);
  assert.equal(first.newEndsAt, new Date('2025-06-20T12:01:00.000Z').toISOString());

  // Second bid inside the new window (30s before new end 12:01:00 = 12:00:30)
  const secondBidTime = new Date('2025-06-20T12:00:30.000Z');
  const second = resolveAntiSnipingExtension({
    antiSniping: config,
    endsAt: first.newEndsAt!,
    extensionCount: first.newExtensionCount!,
    bidTime: secondBidTime,
  });
  assert.equal(second.applies, true);
  assert.equal(second.newExtensionCount, 2);
  assert.equal(second.newEndsAt, new Date('2025-06-20T12:02:00.000Z').toISOString());

  // Third bid inside the new window (30s before new end 12:02:00 = 12:01:30)
  const thirdBidTime = new Date('2025-06-20T12:01:30.000Z');
  const third = resolveAntiSnipingExtension({
    antiSniping: config,
    endsAt: second.newEndsAt!,
    extensionCount: second.newExtensionCount!,
    bidTime: thirdBidTime,
  });
  assert.equal(third.applies, true);
  assert.equal(third.newExtensionCount, 3);
  assert.equal(third.newEndsAt, new Date('2025-06-20T12:03:00.000Z').toISOString());

  // Fourth bid — maxExtensions reached, no more extensions
  const fourthBidTime = new Date('2025-06-20T12:02:30.000Z');
  const fourth = resolveAntiSnipingExtension({
    antiSniping: config,
    endsAt: third.newEndsAt!,
    extensionCount: third.newExtensionCount!,
    bidTime: fourthBidTime,
  });
  assert.equal(fourth.applies, false);
  assert.equal(fourth.newEndsAt, null);
});

// ═══════════════════════════════════════════════════════════════
// BUY NOW LIFECYCLE TESTS
// ═══════════════════════════════════════════════════════════════

test('Buy Now lifecycle: winner with status ended → ended with buy_now reason', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'buyer_1',
    status: 'ended',
    endsAt: LIVE_END,
    now: NOW,
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'buy_now');
});

test('Buy Now lifecycle: winner with status ended takes priority over scheduled_end', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'buyer_1',
    status: 'ended',
    endsAt: PAST_END,
    now: NOW,
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'buy_now');
});

test('Buy Now lifecycle: winner without status ended does NOT trigger buy_now (falls through to payment logic)', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    winnerBidderId: 'buyer_1',
    status: undefined,
    endsAt: PAST_END,
    now: NOW,
    reservePriceGbp: 50,
    topBidAmountGbp: 80,
  }));
  // Without status='ended', winner + no paymentStatus → awaiting_payment
  assert.equal(result.lifecycle, 'awaiting_payment');
  assert.equal(result.terminalReason, null);
});

// ═══════════════════════════════════════════════════════════════
// SETTLEMENT LIFECYCLE TESTS
// ═══════════════════════════════════════════════════════════════

test('Settlement: settledAt set → settled with settled reason', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    settledAt: '2025-06-14T00:00:00.000Z',
  }));
  assert.equal(result.lifecycle, 'settled');
  assert.equal(result.terminalReason, 'settled');
});

test('Settlement: settledAt takes priority over buy_now winner', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    settledAt: '2025-06-14T00:00:00.000Z',
    winnerBidderId: 'buyer_1',
    status: 'ended',
  }));
  assert.equal(result.lifecycle, 'settled');
  assert.equal(result.terminalReason, 'settled');
});

test('Settlement: settledAt takes priority over reserve_not_met', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    settledAt: '2025-06-14T00:00:00.000Z',
    reservePriceGbp: 100,
    topBidAmountGbp: 50,
    status: 'reserve_not_met',
  }));
  assert.equal(result.lifecycle, 'settled');
  assert.equal(result.terminalReason, 'settled');
});

test('Settlement: settledAt takes priority over awaiting_payment', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    settledAt: '2025-06-14T00:00:00.000Z',
    winnerBidderId: 'bidder_1',
    status: 'awaiting_payment',
  }));
  assert.equal(result.lifecycle, 'settled');
  assert.equal(result.terminalReason, 'settled');
});

// ═══════════════════════════════════════════════════════════════
// BASIC LIFECYCLE TESTS (upcoming / live)
// ═══════════════════════════════════════════════════════════════

test('Lifecycle: upcoming when start time is in future', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    startsAt: FUTURE_START,
    endsAt: LIVE_END,
    now: NOW,
  }));
  assert.equal(result.lifecycle, 'upcoming');
  assert.equal(result.terminalReason, null);
});

test('Lifecycle: live when within start and end window', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    now: NOW,
  }));
  assert.equal(result.lifecycle, 'live');
  assert.equal(result.terminalReason, null);
});

test('Lifecycle: live auction with reserve not yet met stays live', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    now: NOW,
    reservePriceGbp: 100,
    topBidAmountGbp: 50,
  }));
  assert.equal(result.lifecycle, 'live');
  assert.equal(result.terminalReason, null);
});

// ═══════════════════════════════════════════════════════════════
// EXPLICIT STATUS TERMINAL TESTS (without end time having passed)
// ═══════════════════════════════════════════════════════════════

test('Explicit terminal status: reserve_not_met applies even if end time has not passed', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    now: NOW,
    status: 'reserve_not_met',
    reservePriceGbp: 100,
    topBidAmountGbp: 50,
  }));
  assert.equal(result.lifecycle, 'reserve_not_met');
  assert.equal(result.terminalReason, 'reserve_not_met');
});

test('Explicit terminal status: payment_expired applies even if end time has not passed', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    now: NOW,
    status: 'payment_expired',
  }));
  assert.equal(result.lifecycle, 'payment_expired');
  assert.equal(result.terminalReason, 'payment_expired');
});

test('Explicit terminal status: second_chance_offered applies even if end time has not passed', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    now: NOW,
    status: 'second_chance_offered',
  }));
  assert.equal(result.lifecycle, 'second_chance_offered');
  assert.equal(result.terminalReason, 'second_chance');
});

test('Explicit terminal status: ended status without winner or reserve → ended scheduled_end', () => {
  const result = resolveCanonicalLifecycle(makeLifecycleInput({
    startsAt: LIVE_START,
    endsAt: LIVE_END,
    now: NOW,
    status: 'ended',
  }));
  assert.equal(result.lifecycle, 'ended');
  assert.equal(result.terminalReason, 'scheduled_end');
});

// ═══════════════════════════════════════════════════════════════
// PRECEDENCE ORDERING TESTS
// ═══════════════════════════════════════════════════════════════

test('Precedence: cancelled > settled > buy_now > reserve_not_met > awaiting_payment > payment_expired > second_chance > scheduled_end', () => {
  // cancelled beats everything
  assert.equal(
    resolveCanonicalLifecycle(makeLifecycleInput({
      cancelledAt: '2025-06-12T00:00:00.000Z',
      settledAt: '2025-06-13T00:00:00.000Z',
      winnerBidderId: 'buyer_1',
      status: 'ended',
      reservePriceGbp: 100,
      topBidAmountGbp: 50,
    })).lifecycle,
    'cancelled'
  );

  // settled beats buy_now
  assert.equal(
    resolveCanonicalLifecycle(makeLifecycleInput({
      cancelledAt: null,
      settledAt: '2025-06-13T00:00:00.000Z',
      winnerBidderId: 'buyer_1',
      status: 'ended',
    })).lifecycle,
    'settled'
  );

  // buy_now beats reserve_not_met (winner + status=ended is checked before terminal block)
  assert.equal(
    resolveCanonicalLifecycle(makeLifecycleInput({
      cancelledAt: null,
      settledAt: null,
      winnerBidderId: 'buyer_1',
      status: 'ended',
      reservePriceGbp: 100,
      topBidAmountGbp: 50,
    })).lifecycle,
    'ended'
  );

  // reserve_not_met beats awaiting_payment
  assert.equal(
    resolveCanonicalLifecycle(makeLifecycleInput({
      cancelledAt: null,
      settledAt: null,
      winnerBidderId: 'bidder_1',
      status: 'awaiting_payment',
      reservePriceGbp: 100,
      topBidAmountGbp: 50,
    })).lifecycle,
    'reserve_not_met'
  );

  // awaiting_payment beats payment_expired (status checked in order)
  assert.equal(
    resolveCanonicalLifecycle(makeLifecycleInput({
      cancelledAt: null,
      settledAt: null,
      winnerBidderId: 'bidder_1',
      status: 'awaiting_payment',
      reservePriceGbp: 50,
      topBidAmountGbp: 80,
    })).lifecycle,
    'awaiting_payment'
  );
});
