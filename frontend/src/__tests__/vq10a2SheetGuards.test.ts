import { describe, it, expect } from 'vitest';
import {
  shouldCloseSheetDueToLifecycle,
  isBuyNowValid,
  isSheetStateStale,
} from '../utils/transactionSheetLogic';
import {
  areBidControlsRemoved,
  isBuyNowAvailable,
} from '../utils/auctionDetailLogic';
import type { AuctionEffectiveState } from '../hooks/useServerClock';

describe('VQ-10A2: No overlapping sheets and terminal action removal', () => {
  describe('shouldCloseSheetDueToLifecycle', () => {
    it('returns true for ended state', () => {
      expect(shouldCloseSheetDueToLifecycle('ended')).toBe(true);
    });

    it('returns true for cancelled state', () => {
      expect(shouldCloseSheetDueToLifecycle('cancelled')).toBe(true);
    });

    it('returns true for settled state', () => {
      expect(shouldCloseSheetDueToLifecycle('settled')).toBe(true);
    });

    it('returns false for live state', () => {
      expect(shouldCloseSheetDueToLifecycle('live')).toBe(false);
    });

    it('returns false for upcoming state', () => {
      expect(shouldCloseSheetDueToLifecycle('upcoming')).toBe(false);
    });
  });

  describe('areBidControlsRemoved', () => {
    it('removes controls for ended', () => {
      expect(areBidControlsRemoved('ended' as AuctionEffectiveState)).toBe(true);
    });

    it('removes controls for cancelled', () => {
      expect(areBidControlsRemoved('cancelled' as AuctionEffectiveState)).toBe(true);
    });

    it('removes controls for settled', () => {
      expect(areBidControlsRemoved('settled' as AuctionEffectiveState)).toBe(true);
    });

    it('keeps controls for live', () => {
      expect(areBidControlsRemoved('live' as AuctionEffectiveState)).toBe(false);
    });

    it('keeps controls for upcoming', () => {
      expect(areBidControlsRemoved('upcoming' as AuctionEffectiveState)).toBe(false);
    });
  });

  describe('isBuyNowValid', () => {
    const baseCtx = {
      buyNowPriceGbp: 100,
      isSeller: false,
      effectiveState: 'live' as const,
      isSubmitting: false,
    };

    it('returns true for valid live auction with buy now price', () => {
      expect(isBuyNowValid(baseCtx)).toBe(true);
    });

    it('returns false when seller', () => {
      expect(isBuyNowValid({ ...baseCtx, isSeller: true })).toBe(false);
    });

    it('returns false when not live', () => {
      expect(isBuyNowValid({ ...baseCtx, effectiveState: 'upcoming' })).toBe(false);
      expect(isBuyNowValid({ ...baseCtx, effectiveState: 'ended' })).toBe(false);
    });

    it('returns false when no buy now price', () => {
      expect(isBuyNowValid({ ...baseCtx, buyNowPriceGbp: null })).toBe(false);
      expect(isBuyNowValid({ ...baseCtx, buyNowPriceGbp: 0 })).toBe(false);
    });

    it('returns false when submitting', () => {
      expect(isBuyNowValid({ ...baseCtx, isSubmitting: true })).toBe(false);
    });
  });

  describe('isBuyNowAvailable', () => {
    const baseAuction = {
      id: 'test',
      listingId: 'l1',
      sellerId: 's1',
      title: 'Test',
      imageUrl: null,
      brand: null,
      category: null,
      conditionLabel: null,
      description: null,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
      startingBidGbp: 10,
      currentBidGbp: 20,
      minimumNextBidGbp: 22,
      buyNowPriceGbp: 100,
      reservePriceGbp: null,
      bidCount: 5,
      viewerState: 'not_participating' as const,
      isWatched: false,
      cancelledAt: null,
      settledAt: null,
      winnerBidderId: null,
      lifecycle: 'live',
      terminalReason: null,
    };

    it('returns true for live non-seller with buy now price', () => {
      expect(isBuyNowAvailable(baseAuction, 'live')).toBe(true);
    });

    it('returns false for seller', () => {
      expect(isBuyNowAvailable({ ...baseAuction, viewerState: 'seller' }, 'live')).toBe(false);
    });

    it('returns false for non-live states', () => {
      expect(isBuyNowAvailable(baseAuction, 'upcoming')).toBe(false);
      expect(isBuyNowAvailable(baseAuction, 'ended')).toBe(false);
    });

    it('returns false when no buy now price', () => {
      expect(isBuyNowAvailable({ ...baseAuction, buyNowPriceGbp: null }, 'live')).toBe(false);
    });
  });

  describe('isSheetStateStale', () => {
    it('returns false for fresh state', () => {
      const now = Date.now();
      expect(isSheetStateStale(now, now)).toBe(false);
      expect(isSheetStateStale(now, now + 10000)).toBe(false);
    });

    it('returns true for stale state beyond 30s threshold', () => {
      const opened = Date.now();
      expect(isSheetStateStale(opened, opened + 31000)).toBe(true);
    });
  });
});
