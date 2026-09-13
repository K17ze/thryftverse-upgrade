import { describe, expect, it } from 'vitest';
import { resolveAuctionTiming } from '../hooks/useServerClock';
import { sellerAuctionBucket } from '../utils/sellerAuctionState';

describe('seller auction results', () => {
  it.each(['awaiting_payment', 'second_chance_offered', 'payment_expired', 'reserve_not_met'] as const)(
    'preserves server lifecycle %s when a winner exists', (lifecycle) => {
      const timing = resolveAuctionTiming({
        startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-02T00:00:00Z',
        winnerBidderId: 'winner', lifecycle,
      }, Date.parse('2026-09-03T00:00:00Z'));
      expect(timing.effectiveState).toBe(lifecycle);
      expect(sellerAuctionBucket(timing.effectiveState, 8)).not.toBe('sold');
    },
  );
  it('keeps unconfirmed bid results pending and counts only settlement as sold', () => {
    expect(sellerAuctionBucket('ended', 8)).toBe('pending');
    expect(sellerAuctionBucket('ended', 0)).toBe('unsold');
    expect(sellerAuctionBucket('settled', 8)).toBe('sold');
    expect(sellerAuctionBucket('reserve_not_met', 8)).toBe('unsold');
  });
});
