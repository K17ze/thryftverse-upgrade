import { describe, it, expect } from 'vitest';
import { resolveAuctionTiming, formatCountdown } from '../hooks/useServerClock';
import {
  isAttentionItem,
  resolvePriceLabel,
  resolvePriceText,
  resolveTimeLabel,
  resolveUrgency,
  resolveViewerStatePresentation,
  buildAuctionAccessibilityLabel,
  selectFirstServerTime,
  isAllRejected,
  fulfilledCount,
  makeSectionLoadState,
  createSearchState,
  IDLE_SEARCH_STATE,
  getSellerInitials,
  buildCanonicalMap,
  formatFinalMinutesCountdown,
} from '../utils/auctionHomeLogic';

interface AuctionTimingInput {
  startsAt: string;
  endsAt: string;
  cancelledAt?: string | null;
  settledAt?: string | null;
}

interface AuctionHomeItem {
  id: string;
  listingId: string;
  sellerId: string;
  sellerUsername: string;
  sellerDisplayName: string | null;
  sellerAvatarUrl: string | null;
  title: string;
  imageUrl: string;
  brand: string | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  bidCount: number;
  buyNowPriceGbp: number | null;
  reservePriceGbp: number | null;
  viewerState: 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller';
  isWatched: boolean;
  cancelledAt: string | null;
  settledAt: string | null;
  winnerBidderId: string | null;
  lifecycle: string;
  terminalReason: string | null;
}

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

function makeTiming(
  startsAtOffset: number,
  endsAtOffset: number,
  extra?: Partial<AuctionTimingInput>
): AuctionTimingInput {
  const startsAt = new Date(NOW + startsAtOffset).toISOString();
  const endsAt = new Date(NOW + endsAtOffset).toISOString();
  return { startsAt, endsAt, ...extra };
}

function makeItem(
  overrides: Partial<AuctionHomeItem> & { startsAt: string; endsAt: string }
): AuctionHomeItem {
  return {
    id: overrides.id ?? 'test-1',
    listingId: 'list-1',
    sellerId: 'seller-1',
    sellerUsername: 'seller',
    sellerDisplayName: null,
    sellerAvatarUrl: null,
    title: 'Test Item',
    imageUrl: '',
    brand: null,
    startingBidGbp: 10,
    currentBidGbp: 20,
    minimumNextBidGbp: 21,
    bidCount: 5,
    buyNowPriceGbp: null,
    reservePriceGbp: null,
    viewerState: 'not_participating',
    isWatched: false,
    cancelledAt: null,
    settledAt: null,
    winnerBidderId: null,
    lifecycle: 'live',
    terminalReason: null,
    ...overrides,
  };
}

describe('useServerClock — resolveAuctionTiming', () => {
  it('resolves upcoming when startsAt is in the future', () => {
    const input = makeTiming(ONE_HOUR, ONE_HOUR + 6 * ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('upcoming');
    expect(result.msToStart).toBe(ONE_HOUR);
    expect(result.msToEnd).toBe(7 * ONE_HOUR);
    expect(result.progress).toBe(0);
  });

  it('resolves live when now is between startsAt and endsAt', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('live');
    expect(result.msToStart).toBe(0);
    expect(result.msToEnd).toBe(ONE_HOUR);
    expect(result.progress).toBeCloseTo(0.5, 2);
  });

  it('resolves ended when endsAt has passed', () => {
    const input = makeTiming(-3 * ONE_HOUR, -ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('ended');
    expect(result.msToStart).toBe(0);
    expect(result.msToEnd).toBe(0);
    expect(result.progress).toBe(1);
  });

  it('cancelled takes precedence over live/ended', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR, {
      cancelledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('cancelled');
  });

  it('cancelled takes precedence over ended', () => {
    const input = makeTiming(-3 * ONE_HOUR, -ONE_HOUR, {
      cancelledAt: new Date(NOW - 2 * ONE_HOUR).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('cancelled');
  });

  it('settled takes precedence over live', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR, {
      settledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('settled');
  });

  it('settled takes precedence over ended', () => {
    const input = makeTiming(-3 * ONE_HOUR, -ONE_HOUR, {
      settledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('settled');
  });

  it('cancelled takes precedence over settled', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR, {
      cancelledAt: new Date(NOW - 10 * 60 * 1000).toISOString(),
      settledAt: new Date(NOW - 5 * 60 * 1000).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('cancelled');
  });

  it('upcoming transitions to live as time passes', () => {
    const input = makeTiming(ONE_HOUR, 7 * ONE_HOUR);
    const before = resolveAuctionTiming(input, NOW);
    expect(before.effectiveState).toBe('upcoming');

    const after = resolveAuctionTiming(input, NOW + 2 * ONE_HOUR);
    expect(after.effectiveState).toBe('live');
  });

  it('live transitions to ended as time passes', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR);
    const before = resolveAuctionTiming(input, NOW);
    expect(before.effectiveState).toBe('live');

    const after = resolveAuctionTiming(input, NOW + 2 * ONE_HOUR);
    expect(after.effectiveState).toBe('ended');
  });

  it('never produces a negative countdown', () => {
    const input = makeTiming(-3 * ONE_HOUR, -ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.msToStart).toBe(0);
    expect(result.msToEnd).toBe(0);
  });

  it('progress uses actual duration, not a hardcoded 6-hour denominator', () => {
    const input = makeTiming(-2 * ONE_HOUR, 2 * ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBeCloseTo(0.5, 2);
  });

  it('progress is 0 at start of a 24-hour auction', () => {
    const input = makeTiming(0, ONE_DAY);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBe(0);
  });

  it('progress is 0.5 at midpoint of a 24-hour auction', () => {
    const input = makeTiming(-12 * ONE_HOUR, 12 * ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBeCloseTo(0.5, 2);
  });

  it('progress is 1 at end of a 24-hour auction', () => {
    const input = makeTiming(-ONE_DAY, 0);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBe(1);
  });

  it('progress is clamped to [0, 1]', () => {
    const input = makeTiming(-2 * ONE_DAY, -ONE_DAY);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBe(1);
  });
});

describe('useServerClock — formatCountdown', () => {
  it('returns "Ended" for zero or negative', () => {
    expect(formatCountdown(0)).toBe('Ended');
    expect(formatCountdown(-1000)).toBe('Ended');
  });

  it('formats seconds correctly', () => {
    expect(formatCountdown(30_000)).toBe('00:00:30');
  });

  it('formats minutes correctly', () => {
    expect(formatCountdown(5 * 60 * 1000)).toBe('00:05:00');
  });

  it('formats hours correctly', () => {
    expect(formatCountdown(3 * ONE_HOUR + 30 * 60 * 1000)).toBe('03:30:00');
  });

  it('formats days correctly', () => {
    const ms = 2 * ONE_DAY + 3 * ONE_HOUR + 30 * 60 * 1000;
    expect(formatCountdown(ms)).toBe('2d 03h 30m');
  });
});

describe('isAttentionItem — exhaustive state table', () => {
  const baseStarts = new Date(NOW - ONE_HOUR).toISOString();
  const baseEnds = new Date(NOW + ONE_HOUR).toISOString();
  const pastStarts = new Date(NOW - 3 * ONE_HOUR).toISOString();
  const pastEnds = new Date(NOW - ONE_HOUR).toISOString();
  const futureStarts = new Date(NOW + ONE_HOUR).toISOString();
  const futureEnds = new Date(NOW + 7 * ONE_HOUR).toISOString();

  it('returns true for outbid while live', () => {
    const item = makeItem({
      startsAt: baseStarts,
      endsAt: baseEnds,
      viewerState: 'outbid',
    });
    expect(isAttentionItem(item, NOW)).toBe(true);
  });

  it('returns true for won after ended', () => {
    const item = makeItem({
      startsAt: pastStarts,
      endsAt: pastEnds,
      viewerState: 'won',
    });
    expect(isAttentionItem(item, NOW)).toBe(true);
  });

  it('returns false for leading while live', () => {
    const item = makeItem({
      startsAt: baseStarts,
      endsAt: baseEnds,
      viewerState: 'leading',
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for watching while live', () => {
    const item = makeItem({
      startsAt: baseStarts,
      endsAt: baseEnds,
      viewerState: 'watching',
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for not_participating while live', () => {
    const item = makeItem({
      startsAt: baseStarts,
      endsAt: baseEnds,
      viewerState: 'not_participating',
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for seller while live', () => {
    const item = makeItem({
      startsAt: baseStarts,
      endsAt: baseEnds,
      viewerState: 'seller',
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for seller after ended', () => {
    const item = makeItem({
      startsAt: pastStarts,
      endsAt: pastEnds,
      viewerState: 'seller',
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for seller with settledAt', () => {
    const item = makeItem({
      startsAt: pastStarts,
      endsAt: pastEnds,
      viewerState: 'seller',
      settledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for lost after ended', () => {
    const item = makeItem({
      startsAt: pastStarts,
      endsAt: pastEnds,
      viewerState: 'lost',
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for cancelled auctions', () => {
    const item = makeItem({
      startsAt: baseStarts,
      endsAt: baseEnds,
      viewerState: 'outbid',
      cancelledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for settled auctions', () => {
    const item = makeItem({
      startsAt: pastStarts,
      endsAt: pastEnds,
      viewerState: 'won',
      settledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for outbid while upcoming', () => {
    const item = makeItem({
      startsAt: futureStarts,
      endsAt: futureEnds,
      viewerState: 'outbid',
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });

  it('returns false for won while live (not yet ended)', () => {
    const item = makeItem({
      startsAt: baseStarts,
      endsAt: baseEnds,
      viewerState: 'won',
    });
    expect(isAttentionItem(item, NOW)).toBe(false);
  });
});

// ── PASS 3 unit tests ──

describe('PASS 3.2: Price label resolver', () => {
  function makePriceItem(overrides: Partial<AuctionHomeItem> & { startsAt: string; endsAt: string }): AuctionHomeItem {
    return {
      id: 'test-1',
      listingId: 'list-1',
      sellerId: 'seller-1',
      sellerUsername: 'seller',
      sellerDisplayName: null,
      sellerAvatarUrl: null,
      title: 'Test',
      imageUrl: '',
      brand: null,
      startingBidGbp: 10,
      currentBidGbp: 20,
      minimumNextBidGbp: 21,
      bidCount: 5,
      buyNowPriceGbp: null,
      reservePriceGbp: null,
      viewerState: 'not_participating',
      isWatched: false,
      cancelledAt: null,
      settledAt: null,
      winnerBidderId: null,
      lifecycle: 'live',
      terminalReason: null,
      ...overrides,
    };
  }

  it('shows "Starting bid" for upcoming with no bids', () => {
    const item = makePriceItem({
      startsAt: new Date(NOW + ONE_HOUR).toISOString(),
      endsAt: new Date(NOW + 7 * ONE_HOUR).toISOString(),
      bidCount: 0,
      currentBidGbp: 10,
    });
    const timing = resolveAuctionTiming(item, NOW);
    expect(resolvePriceLabel(item, timing)).toBe('Starting bid');
  });

  it('shows "Starting bid" for live with no bids', () => {
    const item = makePriceItem({
      startsAt: new Date(NOW - ONE_HOUR).toISOString(),
      endsAt: new Date(NOW + ONE_HOUR).toISOString(),
      bidCount: 0,
      currentBidGbp: 10,
    });
    const timing = resolveAuctionTiming(item, NOW);
    expect(resolvePriceLabel(item, timing)).toBe('Starting bid');
  });

  it('shows "Current bid" for live with bids', () => {
    const item = makePriceItem({
      startsAt: new Date(NOW - ONE_HOUR).toISOString(),
      endsAt: new Date(NOW + ONE_HOUR).toISOString(),
      bidCount: 3,
      currentBidGbp: 25,
    });
    const timing = resolveAuctionTiming(item, NOW);
    expect(resolvePriceLabel(item, timing)).toBe('Current bid');
  });

  it('shows "Final bid" for ended with bids', () => {
    const item = makePriceItem({
      startsAt: new Date(NOW - 3 * ONE_HOUR).toISOString(),
      endsAt: new Date(NOW - ONE_HOUR).toISOString(),
      bidCount: 5,
      currentBidGbp: 45,
    });
    const timing = resolveAuctionTiming(item, NOW);
    expect(resolvePriceLabel(item, timing)).toBe('Final bid');
  });

  it('shows "No bids" for ended without bids', () => {
    const item = makePriceItem({
      startsAt: new Date(NOW - 3 * ONE_HOUR).toISOString(),
      endsAt: new Date(NOW - ONE_HOUR).toISOString(),
      bidCount: 0,
      currentBidGbp: 10,
    });
    const timing = resolveAuctionTiming(item, NOW);
    expect(resolvePriceLabel(item, timing)).toBe('No bids');
  });
});

describe('PASS 3.4: Time label resolver', () => {
  it('upcoming shows "Starts in"', () => {
    const timing = resolveAuctionTiming(
      { startsAt: new Date(NOW + 2 * ONE_HOUR).toISOString(), endsAt: new Date(NOW + 8 * ONE_HOUR).toISOString() },
      NOW
    );
    const label = resolveTimeLabel(timing);
    expect(label).toContain('Starts in');
    expect(label).toContain('2h');
  });

  it('live shows time left', () => {
    const timing = resolveAuctionTiming(
      { startsAt: new Date(NOW - ONE_HOUR).toISOString(), endsAt: new Date(NOW + 3 * ONE_HOUR + 42 * 60000).toISOString() },
      NOW
    );
    const label = resolveTimeLabel(timing);
    expect(label).toContain('left');
    expect(label).toContain('3h');
  });

  it('ended shows "Ended"', () => {
    const timing = resolveAuctionTiming(
      { startsAt: new Date(NOW - 3 * ONE_HOUR).toISOString(), endsAt: new Date(NOW - ONE_HOUR).toISOString() },
      NOW
    );
    expect(resolveTimeLabel(timing)).toBe('Ended');
  });

  it('cancelled shows "Cancelled"', () => {
    const timing = resolveAuctionTiming(
      { startsAt: new Date(NOW - 3 * ONE_HOUR).toISOString(), endsAt: new Date(NOW - ONE_HOUR).toISOString(), cancelledAt: new Date(NOW - 2 * ONE_HOUR).toISOString() },
      NOW
    );
    expect(resolveTimeLabel(timing)).toBe('Cancelled');
  });

  it('settled shows "Settled"', () => {
    const timing = resolveAuctionTiming(
      { startsAt: new Date(NOW - 3 * ONE_HOUR).toISOString(), endsAt: new Date(NOW - ONE_HOUR).toISOString(), settledAt: new Date(NOW - 30 * 60000).toISOString() },
      NOW
    );
    expect(resolveTimeLabel(timing)).toBe('Settled');
  });
});

describe('PASS 3.4: Urgency thresholds', () => {
  it('returns "none" for non-live', () => {
    const timing = { effectiveState: 'upcoming' as const, msToEnd: 999999 };
    expect(resolveUrgency(timing)).toBe('none');
  });

  it('returns "none" for live with > 1 hour remaining', () => {
    const timing = { effectiveState: 'live' as const, msToEnd: 2 * ONE_HOUR };
    expect(resolveUrgency(timing)).toBe('none');
  });

  it('returns "endingSoon" for live with <= 1 hour remaining', () => {
    const timing = { effectiveState: 'live' as const, msToEnd: 30 * 60000 };
    expect(resolveUrgency(timing)).toBe('endingSoon');
  });

  it('returns "finalMinutes" for live with <= 5 minutes remaining', () => {
    const timing = { effectiveState: 'live' as const, msToEnd: 3 * 60000 };
    expect(resolveUrgency(timing)).toBe('finalMinutes');
  });

  it('formatFinalMinutesCountdown shows MM:SS', () => {
    expect(formatFinalMinutesCountdown(138000)).toBe('02:18');
  });

  it('formatFinalMinutesCountdown shows "Ended" for 0', () => {
    expect(formatFinalMinutesCountdown(0)).toBe('Ended');
  });
});

describe('PASS 3.3: Viewer state presentation', () => {
  it('outbid is action-oriented with danger color', () => {
    const p = resolveViewerStatePresentation('outbid');
    expect(p).toBeTruthy();
    expect(p!.colorKey).toBe('danger');
    expect(p!.priority).toBe(1);
  });

  it('leading is reassuring with success color', () => {
    const p = resolveViewerStatePresentation('leading');
    expect(p).toBeTruthy();
    expect(p!.colorKey).toBe('success');
    expect(p!.priority).toBe(2);
  });

  it('won is result-oriented with success color', () => {
    const p = resolveViewerStatePresentation('won');
    expect(p).toBeTruthy();
    expect(p!.colorKey).toBe('success');
    expect(p!.priority).toBe(3);
  });

  it('lost is restrained with textMuted color', () => {
    const p = resolveViewerStatePresentation('lost');
    expect(p).toBeTruthy();
    expect(p!.colorKey).toBe('textMuted');
    expect(p!.priority).toBeGreaterThan(3);
  });

  it('watching is low emphasis', () => {
    const p = resolveViewerStatePresentation('watching');
    expect(p).toBeTruthy();
    expect(p!.colorKey).toBe('textSecondary');
    expect(p!.priority).toBeGreaterThan(4);
  });

  it('seller has ownership context', () => {
    const p = resolveViewerStatePresentation('seller');
    expect(p).toBeTruthy();
    expect(p!.colorKey).toBe('brand');
  });

  it('not_participating returns null', () => {
    expect(resolveViewerStatePresentation('not_participating')).toBeNull();
  });

  it('outbid has higher priority than leading (action first)', () => {
    const outbid = resolveViewerStatePresentation('outbid')!;
    const leading = resolveViewerStatePresentation('leading')!;
    expect(outbid.priority).toBeLessThan(leading.priority);
  });
});

describe('PASS 3.0C: Attention deduplication via canonical map', () => {
  function makeDedupItem(id: string, viewerState: AuctionHomeItem['viewerState'] = 'outbid'): AuctionHomeItem {
    return {
      id,
      listingId: `list-${id}`,
      sellerId: 'seller-1',
      sellerUsername: 'seller',
      sellerDisplayName: null,
      sellerAvatarUrl: null,
      title: `Item ${id}`,
      imageUrl: '',
      brand: null,
      startsAt: new Date(NOW - ONE_HOUR).toISOString(),
      endsAt: new Date(NOW + ONE_HOUR).toISOString(),
      startingBidGbp: 10,
      currentBidGbp: 20,
      minimumNextBidGbp: 21,
      bidCount: 3,
      buyNowPriceGbp: null,
      reservePriceGbp: null,
      viewerState,
      isWatched: false,
      cancelledAt: null,
      settledAt: null,
      winnerBidderId: null,
      lifecycle: 'live',
      terminalReason: null,
    };
  }

  it('one outbid auction in three input collections appears exactly once in canonical map', () => {
    const item = makeDedupItem('auc-1', 'outbid');
    const live = [item];
    const seller = [makeDedupItem('auc-1', 'seller')];
    const watchlist = [makeDedupItem('auc-1', 'watching')];
    const ended: AuctionHomeItem[] = [];

    const map = buildCanonicalMap([live, seller, watchlist, ended]);
    expect(map.size).toBe(1);
    expect(map.has('auc-1')).toBe(true);
  });

  it('canonical map preserves first occurrence', () => {
    const item1 = makeDedupItem('auc-1', 'outbid');
    const item2 = makeDedupItem('auc-1', 'seller');
    const map = buildCanonicalMap([[item1], [item2]]);
    expect(map.get('auc-1')).toBe(item1);
  });

  it('attention items from canonical map are unique', () => {
    const item = makeDedupItem('auc-1', 'outbid');
    const map = buildCanonicalMap([[item], [item], [item]]);
    const attentionItems: AuctionHomeItem[] = [];
    for (const v of map.values()) {
      if (isAttentionItem(v, NOW)) attentionItems.push(v);
    }
    expect(attentionItems).toHaveLength(1);
  });
});

describe('PASS 3.7: Seller identity', () => {
  it('getSellerInitials provides fallback', () => {
    expect(getSellerInitials('John Doe', 'johndoe')).toBe('JD');
    expect(getSellerInitials(null, 'johndoe')).toBe('J');
    expect(getSellerInitials('', '')).toBe('?');
  });
});

// ── PASS 3.1 PURE UNIT TESTS ──

describe('PASS 3.1: Server-time fallback selection (pure unit)', () => {
  it('selects first valid serverNow from multiple sources', () => {
    const sources = [
      { serverNow: null },
      { serverNow: '2025-06-15T12:00:00Z' },
      { serverNow: '2025-06-15T12:01:00Z' },
    ];
    expect(selectFirstServerTime(sources)).toBe('2025-06-15T12:00:00Z');
  });

  it('returns null when all sources are null', () => {
    const sources = [
      { serverNow: null },
      { serverNow: null },
    ];
    expect(selectFirstServerTime(sources)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(selectFirstServerTime([])).toBeNull();
  });

  it('selects from upcoming when live is null', () => {
    const sources = [
      { serverNow: null },
      { serverNow: '2025-06-15T13:00:00Z' },
    ];
    expect(selectFirstServerTime(sources)).toBe('2025-06-15T13:00:00Z');
  });
});

describe('PASS 3.1: All-failed detection (pure unit)', () => {
  it('returns true when all results are rejected', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'rejected', reason: new Error('fail') },
      { status: 'rejected', reason: new Error('fail') },
    ];
    expect(isAllRejected(results)).toBe(true);
  });

  it('returns false when at least one is fulfilled', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: {} },
      { status: 'rejected', reason: new Error('fail') },
    ];
    expect(isAllRejected(results)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isAllRejected([])).toBe(false);
  });

  it('fulfilledCount counts only fulfilled', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: {} },
      { status: 'rejected', reason: new Error('fail') },
      { status: 'fulfilled', value: {} },
    ];
    expect(fulfilledCount(results)).toBe(2);
  });
});

describe('PASS 3.1: Partial success detection (pure unit)', () => {
  it('all rejected → isAllRejected=true, fulfilledCount=0', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'rejected', reason: new Error('a') },
      { status: 'rejected', reason: new Error('b') },
      { status: 'rejected', reason: new Error('c') },
    ];
    expect(isAllRejected(results)).toBe(true);
    expect(fulfilledCount(results)).toBe(0);
  });

  it('partial success → isAllRejected=false, fulfilledCount>0', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: { items: [] } },
      { status: 'rejected', reason: new Error('b') },
    ];
    expect(isAllRejected(results)).toBe(false);
    expect(fulfilledCount(results)).toBe(1);
  });
});

describe('PASS 3.1: Section load state (pure unit)', () => {
  it('error state when hasError=true', () => {
    const state = makeSectionLoadState([], true);
    expect(state.status).toBe('error');
    expect(state.items).toEqual([]);
  });

  it('empty state when no items and no error', () => {
    const state = makeSectionLoadState([], false);
    expect(state.status).toBe('empty');
    expect(state.items).toEqual([]);
  });

  it('ready state when items exist', () => {
    const items = [{ id: '1' } as any];
    const state = makeSectionLoadState(items, false);
    expect(state.status).toBe('ready');
    expect(state.items).toBe(items);
  });

  it('error takes precedence over items', () => {
    const items = [{ id: '1' } as any];
    const state = makeSectionLoadState(items, true);
    expect(state.status).toBe('error');
    expect(state.items).toEqual([]);
  });
});

describe('PASS 3.1: Search state transitions (pure unit)', () => {
  it('IDLE_SEARCH_STATE has idle status', () => {
    expect(IDLE_SEARCH_STATE.status).toBe('idle');
    expect(IDLE_SEARCH_STATE.items).toEqual([]);
    expect(IDLE_SEARCH_STATE.cursor).toBeNull();
  });

  it('A -> B: createSearchState for B replaces A', () => {
    const stateA = createSearchState('sneakers', 'ready', [{ id: '1' } as any], 'cursor1');
    const stateB = createSearchState('jacket', 'loading');
    expect(stateB.query).toBe('jacket');
    expect(stateB.status).toBe('loading');
    expect(stateB.items).toEqual([]);
    expect(stateB.cursor).toBeNull();
  });

  it('A -> clear: returns to idle', () => {
    const stateA = createSearchState('sneakers', 'ready', [{ id: '1' } as any], 'cursor1');
    expect(stateA.status).toBe('ready');
    const cleared = IDLE_SEARCH_STATE;
    expect(cleared.status).toBe('idle');
    expect(cleared.items).toEqual([]);
  });

  it('A -> B -> A: re-creating A produces correct query', () => {
    const stateA1 = createSearchState('sneakers', 'ready', [{ id: '1' } as any]);
    const stateB = createSearchState('jacket', 'loading');
    const stateA2 = createSearchState('sneakers', 'loading');
    expect(stateA1.query).toBe('sneakers');
    expect(stateB.query).toBe('jacket');
    expect(stateA2.query).toBe('sneakers');
    expect(stateA2.items).toEqual([]);
  });
});

describe('PASS 3.1: Price labels for settled/cancelled/no-bids (pure unit)', () => {
  const fmt = (amt: number) => `£${amt}`;

  it('settled with bids → Final bid', () => {
    const item = { bidCount: 3, currentBidGbp: 50, startingBidGbp: 10 } as any;
    const timing = { effectiveState: 'settled' } as any;
    expect(resolvePriceLabel(item, timing)).toBe('Final bid');
    expect(resolvePriceText(item, timing, 'Final bid', fmt)).toBe('£50');
  });

  it('settled without bids → No bids', () => {
    const item = { bidCount: 0, currentBidGbp: 10, startingBidGbp: 10 } as any;
    const timing = { effectiveState: 'settled' } as any;
    expect(resolvePriceLabel(item, timing)).toBe('No bids');
    expect(resolvePriceText(item, timing, 'No bids', fmt)).toBe('No bids');
  });

  it('cancelled with bids → Final bid', () => {
    const item = { bidCount: 2, currentBidGbp: 30, startingBidGbp: 10 } as any;
    const timing = { effectiveState: 'cancelled' } as any;
    expect(resolvePriceLabel(item, timing)).toBe('Final bid');
    expect(resolvePriceText(item, timing, 'Final bid', fmt)).toBe('£30');
  });

  it('cancelled without bids → No bids', () => {
    const item = { bidCount: 0, currentBidGbp: 10, startingBidGbp: 10 } as any;
    const timing = { effectiveState: 'cancelled' } as any;
    expect(resolvePriceLabel(item, timing)).toBe('No bids');
    expect(resolvePriceText(item, timing, 'No bids', fmt)).toBe('No bids');
  });

  it('live with bids → Current bid', () => {
    const item = { bidCount: 5, currentBidGbp: 100, startingBidGbp: 10 } as any;
    const timing = { effectiveState: 'live' } as any;
    expect(resolvePriceLabel(item, timing)).toBe('Current bid');
  });

  it('live without bids → Starting bid', () => {
    const item = { bidCount: 0, currentBidGbp: 10, startingBidGbp: 10 } as any;
    const timing = { effectiveState: 'live' } as any;
    expect(resolvePriceLabel(item, timing)).toBe('Starting bid');
  });

  it('upcoming → Starting bid', () => {
    const item = { bidCount: 0, currentBidGbp: 10, startingBidGbp: 10 } as any;
    const timing = { effectiveState: 'upcoming' } as any;
    expect(resolvePriceLabel(item, timing)).toBe('Starting bid');
  });
});

describe('PASS 3.1: No-bid presentation (pure unit)', () => {
  const fmt = (amt: number) => `£${amt}`;

  it('accessibility label says No bids once (not twice)', () => {
    const item = {
      title: 'Test Auction',
      bidCount: 0,
      viewerState: 'not_participating',
    } as any;
    const timing = { effectiveState: 'ended', msToStart: 0, msToEnd: -1000 } as any;
    const label = buildAuctionAccessibilityLabel(item, timing, 'No bids', 'No bids');
    const matchCount = (label.match(/No bids/g) || []).length;
    expect(matchCount).toBe(1);
  });

  it('accessibility label for settled with bids includes Final bid and bid count', () => {
    const item = {
      title: 'Test Auction',
      bidCount: 3,
      viewerState: 'won',
    } as any;
    const timing = { effectiveState: 'settled', msToStart: 0, msToEnd: -1000 } as any;
    const label = buildAuctionAccessibilityLabel(item, timing, 'Final bid', '£50');
    expect(label).toContain('Final bid £50');
    expect(label).toContain('3 bids');
    expect(label).toContain('Won');
  });

  it('cancelled auction does not show current bid label', () => {
    const item = { bidCount: 0, currentBidGbp: 10, startingBidGbp: 10 } as any;
    const timing = { effectiveState: 'cancelled' } as any;
    expect(resolvePriceLabel(item, timing)).not.toBe('Current bid');
  });
});

describe('PASS 3.1: Countdown update precision (pure unit)', () => {
  it('ended items have urgency none', () => {
    const timing = { effectiveState: 'ended' as const, msToEnd: -1000 };
    expect(resolveUrgency(timing)).toBe('none');
  });

  it('upcoming items have urgency none', () => {
    const timing = { effectiveState: 'upcoming' as const, msToEnd: 3600000 };
    expect(resolveUrgency(timing)).toBe('none');
  });

  it('live with >5min has urgency endingSoon or none', () => {
    const timing30min = { effectiveState: 'live' as const, msToEnd: 30 * 60 * 1000 };
    expect(resolveUrgency(timing30min)).toBe('endingSoon');
    const timing2hr = { effectiveState: 'live' as const, msToEnd: 2 * 60 * 60 * 1000 };
    expect(resolveUrgency(timing2hr)).toBe('none');
  });

  it('live with <=5min has urgency finalMinutes', () => {
    const timing = { effectiveState: 'live' as const, msToEnd: 3 * 60 * 1000 };
    expect(resolveUrgency(timing)).toBe('finalMinutes');
  });

  it('live with <=1min has urgency finalMinutes', () => {
    const timing = { effectiveState: 'live' as const, msToEnd: 30 * 1000 };
    expect(resolveUrgency(timing)).toBe('finalMinutes');
  });
});
