import { describe, it, expect } from 'vitest';
import { resolveAuctionTiming, formatCountdown } from '../hooks/useServerClock';
import { isAttentionItem } from '../utils/auctionHomeLogic';

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
  viewerState: 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller';
  isWatched: boolean;
  cancelledAt: string | null;
  settledAt: string | null;
  winnerBidderId: string | null;
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
    title: 'Test Item',
    imageUrl: '',
    brand: null,
    startingBidGbp: 10,
    currentBidGbp: 20,
    minimumNextBidGbp: 21,
    bidCount: 5,
    buyNowPriceGbp: null,
    viewerState: 'not_participating',
    isWatched: false,
    cancelledAt: null,
    settledAt: null,
    winnerBidderId: null,
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

describe('useServerClock — foreground resync (needsResync signal)', () => {
  const src = require('fs').readFileSync(
    require('path').resolve(__dirname, '../hooks/useServerClock.ts'),
    'utf-8'
  );

  it('does not recompute offset from initialServerNow on foreground', () => {
    const appStateEffect = src.match(/const handleAppStateChange[\s\S]*?subscription\.remove\(\);[\s\S]*?\}\s*,\s*\[\]\s*\)/);
    expect(appStateEffect).toBeTruthy();
    const effectBody = appStateEffect![0];
    expect(effectBody).not.toContain('initialServerNow');
    expect(effectBody).not.toContain('computeOffset(initialServerNow)');
  });

  it('emits needsResync signal instead of recomputing', () => {
    expect(src).toContain('setNeedsResync(true)');
  });

  it('preserves last valid offset until fresh data arrives', () => {
    expect(src).toContain('offsetRef.current');
    expect(src).toContain('needsResync');
    expect(src).toContain('clearResync');
  });

  it('no backwards clock jump: offset is only updated via computeOffset with fresh serverNow', () => {
    const appStateEffect = src.match(/const handleAppStateChange[\s\S]*?subscription\.remove\(\);[\s\S]*?\}\s*,\s*\[\]\s*\)/);
    expect(appStateEffect).toBeTruthy();
    expect(appStateEffect![0]).not.toMatch(/computeOffset\(initialServerNow\)/);
    expect(src).toMatch(/computeOffset\(serverNow\)/);
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

describe('isAttentionItem — won CTA truth', () => {
  const src = require('fs').readFileSync(
    require('path').resolve(__dirname, '../screens/AuctionHomeScreen.tsx'),
    'utf-8'
  );

  it('uses "View result" for won auctions', () => {
    expect(src).toContain('View result');
  });

  it('does not use "Complete purchase"', () => {
    expect(src).not.toContain('Complete purchase');
  });
});

describe('Duplicate prevention — seller items included', () => {
  const src = require('fs').readFileSync(
    require('path').resolve(__dirname, '../screens/AuctionHomeScreen.tsx'),
    'utf-8'
  );

  it('seller section checks usedIds.has before adding', () => {
    const sellerMatch = src.match(/sellerItems[\s\S]*?usedIds\.has/);
    expect(sellerMatch).toBeTruthy();
  });

  it('seller items are added to usedIds after inclusion', () => {
    const sellerMatch = src.match(/sellerItems[\s\S]*?usedIds\.add/);
    expect(sellerMatch).toBeTruthy();
  });

  it('at least 7 sections check usedIds', () => {
    const matches = src.match(/usedIds\.has/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Section query contracts', () => {
  const src = require('fs').readFileSync(
    require('path').resolve(__dirname, '../screens/AuctionHomeScreen.tsx'),
    'utf-8'
  );

  it('live section uses status=live, sort=endingSoon', () => {
    expect(src).toContain("status: 'live'");
    expect(src).toContain("sort: 'endingSoon'");
  });

  it('upcoming section uses status=scheduled, sort=newest', () => {
    expect(src).toContain("status: 'scheduled'");
  });

  it('ended section uses status=ended, sort=newest', () => {
    expect(src).toContain("status: 'ended'");
  });

  it('seller section uses seller=me', () => {
    expect(src).toContain("seller: 'me'");
  });

  it('watchlist uses getWatchlist()', () => {
    expect(src).toContain('getWatchlist()');
  });

  it('does not use a single all-status fetch for all sections', () => {
    expect(src).not.toContain("status: 'all', sort: 'endingSoon', limit: 50");
  });
});

describe('Search query propagation', () => {
  const src = require('fs').readFileSync(
    require('path').resolve(__dirname, '../screens/AuctionHomeScreen.tsx'),
    'utf-8'
  );

  it('passes debouncedQuery to listAuctions', () => {
    expect(src).toContain('query: debouncedQuery');
  });

  it('resets cursor on new query', () => {
    expect(src).toContain('setSearchCursor(null)');
  });

  it('has stale request rejection', () => {
    expect(src).toContain('searchReqIdRef');
    expect(src).toMatch(/reqId\s*!==\s*searchReqIdRef\.current/);
  });

  it('clear search restores default sections', () => {
    expect(src).toContain('setSearchResults(null)');
    expect(src).toContain("setDebouncedQuery('')");
  });
});

describe('Cancelled/settled list mapping', () => {
  const src = require('fs').readFileSync(
    require('path').resolve(__dirname, '../screens/AuctionHomeScreen.tsx'),
    'utf-8'
  );

  it('toViewModel maps api.cancelledAt (not hardcoded null)', () => {
    expect(src).toContain('api.cancelledAt');
    expect(src).not.toMatch(/cancelledAt:\s*null\s*,/);
  });

  it('toViewModel maps api.settledAt (not hardcoded null)', () => {
    expect(src).toContain('api.settledAt');
    expect(src).not.toMatch(/settledAt:\s*null\s*,/);
  });

  it('toViewModel maps api.winnerBidderId', () => {
    expect(src).toContain('api.winnerBidderId');
  });
});
