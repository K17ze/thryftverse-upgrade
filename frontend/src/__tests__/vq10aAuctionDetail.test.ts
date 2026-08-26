import { describe, it, expect } from 'vitest';
import {
  resolveStateAction,
  resolveDetailPriceLabel,
  resolveDetailPriceAmount,
  resolveDetailCountdown,
  resolveViewerContextMessage,
  isBuyNowAvailable,
  isSellerBlocked,
  areBidControlsRemoved,
  detectLifecycleTransition,
  buildDetailAccessibilityLabel,
  formatBidActivityRow,
  type AuctionDetailInput,
} from '../utils/auctionDetailLogic';
import type { AuctionViewerState } from '../utils/auctionHomeLogic';
import type { AuctionEffectiveState } from '../hooks/useServerClock';
import {
  validateBidEntry,
  applyQuickIncrement,
  mapApiErrorToTransactionError,
  isBuyNowValid,
  shouldCloseSheetDueToLifecycle,
  isSheetStateStale,
  formatGbpEquivalent,
  getSuggestedBid,
} from '../utils/transactionSheetLogic';
import { createStableId } from '../utils/createStableId';

function makeAuction(overrides: Partial<AuctionDetailInput> = {}): AuctionDetailInput {
  return {
    id: 'test-auction-1',
    listingId: 'listing-1',
    sellerId: 'seller-1',
    title: 'Test Auction',
    imageUrl: 'https://example.com/image.jpg',
    brand: 'Nike',
    category: 'Shoes',
    conditionLabel: 'Good',
    description: 'A test auction',
    startsAt: '2025-06-15T10:00:00Z',
    endsAt: '2025-06-15T12:00:00Z',
    startingBidGbp: 50,
    currentBidGbp: 100,
    minimumNextBidGbp: 105,
    buyNowPriceGbp: 200,
    reservePriceGbp: null,
    bidCount: 5,
    viewerState: 'not_participating',
    isWatched: false,
    cancelledAt: null,
    settledAt: null,
    paidAt: null,
    paymentDeadlineAt: null,
    secondChanceOfferedTo: null,
    cancelledBy: null,
    cancelledReason: null,
    antiSniping: null,
    winnerBidderId: null,
    lifecycle: 'live',
    terminalReason: null,
    ...overrides,
  };
}

const formatFromFiat = (amount: number) => `£${amount.toFixed(2)}`;

// ── State-action resolver ──

describe('PASS 4.1: State-action resolver', () => {
  describe('upcoming — not participating', () => {
    it('shows Watch auction as primary', () => {
      const auction = makeAuction({ viewerState: 'not_participating', isWatched: false });
      const result = resolveStateAction('upcoming', 'not_participating', auction);
      expect(result.primary.type).toBe('watchAuction');
      expect(result.primary.label).toBe('Watch auction');
    });

    it('forbids placeBid and buyNow', () => {
      const auction = makeAuction({ viewerState: 'not_participating' });
      const result = resolveStateAction('upcoming', 'not_participating', auction);
      expect(result.forbidden).toContain('placeBid');
      expect(result.forbidden).toContain('buyNow');
    });
  });

  describe('upcoming — watching', () => {
    it('shows Watching as primary label', () => {
      const auction = makeAuction({ viewerState: 'watching', isWatched: true });
      const result = resolveStateAction('upcoming', 'watching', auction);
      expect(result.primary.type).toBe('watchAuction');
      expect(result.primary.label).toBe('Watching');
    });

    it('has restrained treatment', () => {
      const auction = makeAuction({ viewerState: 'watching', isWatched: true });
      const result = resolveStateAction('upcoming', 'watching', auction);
      expect(result.viewerTreatment).toBe('restrained');
    });
  });

  describe('upcoming — seller', () => {
    it('shows View auction as primary', () => {
      const auction = makeAuction({ viewerState: 'seller' });
      const result = resolveStateAction('upcoming', 'seller', auction);
      expect(result.primary.type).toBe('viewPerformance');
      expect(result.forbidden).toContain('placeBid');
      expect(result.forbidden).toContain('buyNow');
    });
  });

  describe('live — not participating', () => {
    it('shows Place bid as primary', () => {
      const auction = makeAuction({ viewerState: 'not_participating' });
      const result = resolveStateAction('live', 'not_participating', auction);
      expect(result.primary.type).toBe('placeBid');
      expect(result.primary.label).toBe('Place bid');
    });

    it('shows Buy Now as secondary when available', () => {
      const auction = makeAuction({ viewerState: 'not_participating', buyNowPriceGbp: 200 });
      const result = resolveStateAction('live', 'not_participating', auction);
      expect(result.secondary.type).toBe('buyNow');
    });
  });

  describe('live — watching', () => {
    it('shows Place bid as primary', () => {
      const auction = makeAuction({ viewerState: 'watching' });
      const result = resolveStateAction('live', 'watching', auction);
      expect(result.primary.type).toBe('placeBid');
      expect(result.viewerTreatment).toBe('restrained');
    });
  });

  describe('live — leading', () => {
    it('shows Increase bid as primary', () => {
      const auction = makeAuction({ viewerState: 'leading' });
      const result = resolveStateAction('live', 'leading', auction);
      expect(result.primary.type).toBe('increaseBid');
      expect(result.primary.label).toBe('Increase bid');
      expect(result.viewerTreatment).toBe('calm');
    });

    it('does not say Increase maximum', () => {
      const auction = makeAuction({ viewerState: 'leading' });
      const result = resolveStateAction('live', 'leading', auction);
      expect(result.primary.label).not.toContain('maximum');
    });
  });

  describe('live — outbid', () => {
    it('shows Bid again as primary', () => {
      const auction = makeAuction({ viewerState: 'outbid' });
      const result = resolveStateAction('live', 'outbid', auction);
      expect(result.primary.type).toBe('bidAgain');
      expect(result.primary.label).toBe('Bid again');
      expect(result.viewerTreatment).toBe('warning');
    });
  });

  describe('live — seller', () => {
    it('shows View performance as primary', () => {
      const auction = makeAuction({ viewerState: 'seller' });
      const result = resolveStateAction('live', 'seller', auction);
      expect(result.primary.type).toBe('viewPerformance');
      expect(result.forbidden).toContain('placeBid');
      expect(result.forbidden).toContain('buyNow');
    });
  });

  describe('ended — won', () => {
    it('shows View result as primary', () => {
      const auction = makeAuction({ viewerState: 'won', winnerBidderId: 'viewer-1' });
      const result = resolveStateAction('ended', 'won', auction);
      expect(result.primary.type).toBe('viewResult');
      expect(result.forbidden).toContain('placeBid');
      expect(result.forbidden).toContain('buyNow');
    });
  });

  describe('ended — lost', () => {
    it('shows View similar items as primary', () => {
      const auction = makeAuction({ viewerState: 'lost' });
      const result = resolveStateAction('ended', 'lost', auction);
      expect(result.primary.type).toBe('viewSimilar');
    });
  });

  describe('ended — seller sold (valid winner, unpaid)', () => {
    it('shows View outcome as primary', () => {
      const auction = makeAuction({ viewerState: 'seller', bidCount: 5, winnerBidderId: 'winner-1' });
      const result = resolveStateAction('ended', 'seller', auction);
      expect(result.primary.type).toBe('viewOutcome');
      expect(result.viewerMessage).toBe('Your auction has ended · awaiting buyer payment');
    });
  });

  describe('ended — seller sold (paid, unsettled)', () => {
    it('shows settlement pending message', () => {
      const auction = makeAuction({
        viewerState: 'seller',
        bidCount: 5,
        winnerBidderId: 'winner-1',
        fulfilment: { orderId: 'order-1', paymentStatus: 'paid', fulfilmentStatus: 'awaiting_seller', buyerNextAction: null, sellerNextAction: null },
      });
      const result = resolveStateAction('ended', 'seller', auction);
      expect(result.viewerMessage).toBe('Payment confirmed · settlement pending');
    });
  });

  describe('ended — seller no valid winner', () => {
    it('shows no bids received message when no bids', () => {
      const auction = makeAuction({ viewerState: 'seller', bidCount: 0 });
      const result = resolveStateAction('ended', 'seller', auction);
      expect(result.viewerMessage).toBe('No bids were received');
    });

    it('shows no bids received message when bids exist but no winner', () => {
      const auction = makeAuction({ viewerState: 'seller', bidCount: 5, winnerBidderId: null });
      const result = resolveStateAction('ended', 'seller', auction);
      expect(result.viewerMessage).toBe('No bids were received');
    });
  });

  describe('cancelled', () => {
    it('has no primary action', () => {
      const auction = makeAuction();
      const result = resolveStateAction('cancelled', 'not_participating', auction);
      expect(result.primary.type).toBe('none');
      expect(result.forbidden).toContain('placeBid');
      expect(result.forbidden).toContain('buyNow');
    });

    it('shows cancelled message', () => {
      const auction = makeAuction();
      const result = resolveStateAction('cancelled', 'not_participating', auction);
      expect(result.viewerMessage).toBe('This auction has been cancelled');
    });
  });

  describe('settled — won', () => {
    it('shows View result', () => {
      const auction = makeAuction({ viewerState: 'won' });
      const result = resolveStateAction('settled', 'won', auction);
      expect(result.primary.type).toBe('viewResult');
      expect(result.forbidden).toContain('placeBid');
    });
  });

  describe('settled — seller', () => {
    it('shows View outcome', () => {
      const auction = makeAuction({ viewerState: 'seller' });
      const result = resolveStateAction('settled', 'seller', auction);
      expect(result.primary.type).toBe('viewOutcome');
    });
  });
});

// ── Buy Now availability ──

describe('PASS 4.2: Buy Now availability', () => {
  it('available when live and price exists', () => {
    const auction = makeAuction({ buyNowPriceGbp: 200 });
    expect(isBuyNowAvailable(auction, 'live')).toBe(true);
  });

  it('not available when upcoming', () => {
    const auction = makeAuction({ buyNowPriceGbp: 200 });
    expect(isBuyNowAvailable(auction, 'upcoming')).toBe(false);
  });

  it('not available when ended', () => {
    const auction = makeAuction({ buyNowPriceGbp: 200 });
    expect(isBuyNowAvailable(auction, 'ended')).toBe(false);
  });

  it('not available when cancelled', () => {
    const auction = makeAuction({ buyNowPriceGbp: 200 });
    expect(isBuyNowAvailable(auction, 'cancelled')).toBe(false);
  });

  it('not available when settled', () => {
    const auction = makeAuction({ buyNowPriceGbp: 200 });
    expect(isBuyNowAvailable(auction, 'settled')).toBe(false);
  });

  it('not available when seller', () => {
    const auction = makeAuction({ buyNowPriceGbp: 200, viewerState: 'seller' });
    expect(isBuyNowAvailable(auction, 'live')).toBe(false);
  });

  it('not available when no buy now price', () => {
    const auction = makeAuction({ buyNowPriceGbp: null });
    expect(isBuyNowAvailable(auction, 'live')).toBe(false);
  });

  it('not available when price is zero', () => {
    const auction = makeAuction({ buyNowPriceGbp: 0 });
    expect(isBuyNowAvailable(auction, 'live')).toBe(false);
  });
});

// ── Seller cannot bid ──

describe('PASS 4.3: Seller cannot bid', () => {
  it('isSellerBlocked returns true for seller', () => {
    expect(isSellerBlocked('seller')).toBe(true);
  });

  it('isSellerBlocked returns false for buyer', () => {
    expect(isSellerBlocked('not_participating')).toBe(false);
    expect(isSellerBlocked('leading')).toBe(false);
    expect(isSellerBlocked('outbid')).toBe(false);
  });
});

// ── Action removal for terminal states ──

describe('PASS 4.4: Ended/cancelled/settled action removal', () => {
  it('areBidControlsRemoved returns true for ended', () => {
    expect(areBidControlsRemoved('ended')).toBe(true);
  });

  it('areBidControlsRemoved returns true for cancelled', () => {
    expect(areBidControlsRemoved('cancelled')).toBe(true);
  });

  it('areBidControlsRemoved returns true for settled', () => {
    expect(areBidControlsRemoved('settled')).toBe(true);
  });

  it('areBidControlsRemoved returns false for live', () => {
    expect(areBidControlsRemoved('live')).toBe(false);
  });

  it('areBidControlsRemoved returns false for upcoming', () => {
    expect(areBidControlsRemoved('upcoming')).toBe(false);
  });
});

// ── Lifecycle transition ──

describe('PASS 4.5: Lifecycle transition detection', () => {
  it('detects transition from upcoming to live', () => {
    expect(detectLifecycleTransition('upcoming', 'live')).toBe(true);
  });

  it('detects transition from live to ended', () => {
    expect(detectLifecycleTransition('live', 'ended')).toBe(true);
  });

  it('returns false when state unchanged', () => {
    expect(detectLifecycleTransition('live', 'live')).toBe(false);
  });

  it('detects transition to cancelled', () => {
    expect(detectLifecycleTransition('live', 'cancelled')).toBe(true);
  });

  it('detects transition to settled', () => {
    expect(detectLifecycleTransition('ended', 'settled')).toBe(true);
  });
});

// ── Price label resolution ──

describe('PASS 4.6: Price label resolution', () => {
  it('returns Starting bid for upcoming', () => {
    const auction = makeAuction();
    expect(resolveDetailPriceLabel(auction, 'upcoming')).toBe('Starting bid');
  });

  it('returns Current bid for live with bids', () => {
    const auction = makeAuction({ bidCount: 5 });
    expect(resolveDetailPriceLabel(auction, 'live')).toBe('Current bid');
  });

  it('returns Starting bid for live with no bids', () => {
    const auction = makeAuction({ bidCount: 0 });
    expect(resolveDetailPriceLabel(auction, 'live')).toBe('Starting bid');
  });

  it('returns Final bid for ended with bids', () => {
    const auction = makeAuction({ bidCount: 5 });
    expect(resolveDetailPriceLabel(auction, 'ended')).toBe('Final bid');
  });

  it('returns No bids for ended with no bids', () => {
    const auction = makeAuction({ bidCount: 0 });
    expect(resolveDetailPriceLabel(auction, 'ended')).toBe('No bids');
  });

  it('returns Final bid for cancelled with bids', () => {
    const auction = makeAuction({ bidCount: 3 });
    expect(resolveDetailPriceLabel(auction, 'cancelled')).toBe('Final bid');
  });

  it('returns No bids for cancelled with no bids', () => {
    const auction = makeAuction({ bidCount: 0 });
    expect(resolveDetailPriceLabel(auction, 'cancelled')).toBe('No bids');
  });

  it('returns Final bid for settled with bids', () => {
    const auction = makeAuction({ bidCount: 5 });
    expect(resolveDetailPriceLabel(auction, 'settled')).toBe('Final bid');
  });
});

// ── Price amount resolution ──

describe('PASS 4.7: Price amount resolution', () => {
  it('returns currentBid when bidCount > 0', () => {
    const auction = makeAuction({ currentBidGbp: 145, bidCount: 5 });
    expect(resolveDetailPriceAmount(auction)).toBe(145);
  });

  it('returns startingBid when bidCount === 0', () => {
    const auction = makeAuction({ startingBidGbp: 50, bidCount: 0 });
    expect(resolveDetailPriceAmount(auction)).toBe(50);
  });
});

// ── Countdown resolution ──

describe('PASS 4.8: Countdown resolution', () => {
  const timing = (effectiveState: AuctionEffectiveState, msToStart = 0, msToEnd = 0) => ({
    effectiveState, msToStart, msToEnd,
  });

  it('returns Cancelled for cancelled state', () => {
    const result = resolveDetailCountdown(timing('cancelled'), 0, 0);
    expect(result.text).toBe('Cancelled');
    expect(result.isFinalMinutes).toBe(false);
  });

  it('returns Settled for settled state', () => {
    const result = resolveDetailCountdown(timing('settled'), 0, 0);
    expect(result.text).toBe('Settled');
  });

  it('returns Ended for ended state', () => {
    const result = resolveDetailCountdown(timing('ended'), 0, 0);
    expect(result.text).toBe('Ended');
  });

  it('returns Starts in for upcoming', () => {
    const result = resolveDetailCountdown(timing('upcoming', 3600000, 0), 0, 0);
    expect(result.text).toContain('Starts in');
  });

  it('returns mm:ss for final minutes', () => {
    const result = resolveDetailCountdown(timing('live', 0, 180000), 180000, 180000);
    expect(result.isFinalMinutes).toBe(true);
    expect(result.text).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns H:MM:SS for non-final live', () => {
    const result = resolveDetailCountdown(timing('live', 0, 3600000), 3600000, 3600000);
    expect(result.isFinalMinutes).toBe(false);
  });
});

// ── Viewer context message ──

describe('PASS 4.9: Viewer context messages', () => {
  it('returns null for not_participating', () => {
    const auction = makeAuction({ viewerState: 'not_participating' });
    expect(resolveViewerContextMessage('live', 'not_participating', auction, formatFromFiat)).toBeNull();
  });

  it('returns seller message for seller', () => {
    const auction = makeAuction({ viewerState: 'seller', bidCount: 3 });
    const result = resolveViewerContextMessage('live', 'seller', auction, formatFromFiat);
    expect(result?.title).toBe('This is your auction');
    expect(result?.subtitle).toBe('3 bids so far');
    expect(result?.treatment).toBe('seller');
  });

  it('returns leading message for leading', () => {
    const auction = makeAuction({ viewerState: 'leading' });
    const result = resolveViewerContextMessage('live', 'leading', auction, formatFromFiat);
    expect(result?.title).toBe('You are currently the highest bidder');
    expect(result?.treatment).toBe('calm');
  });

  it('returns outbid message with minimum next bid', () => {
    const auction = makeAuction({ viewerState: 'outbid', minimumNextBidGbp: 105 });
    const result = resolveViewerContextMessage('live', 'outbid', auction, formatFromFiat);
    expect(result?.title).toBe('You have been outbid');
    expect(result?.subtitle).toContain('105');
    expect(result?.treatment).toBe('warning');
  });

  it('returns won message', () => {
    const auction = makeAuction({ viewerState: 'won' });
    const result = resolveViewerContextMessage('ended', 'won', auction, formatFromFiat);
    expect(result?.title).toBe('You won this auction');
    expect(result?.treatment).toBe('result');
  });

  it('returns lost message', () => {
    const auction = makeAuction({ viewerState: 'lost' });
    const result = resolveViewerContextMessage('ended', 'lost', auction, formatFromFiat);
    expect(result?.title).toBe('You did not win this auction');
    expect(result?.treatment).toBe('subdued');
  });

  it('returns watching message for upcoming', () => {
    const auction = makeAuction({ viewerState: 'watching' });
    const result = resolveViewerContextMessage('upcoming', 'watching', auction, formatFromFiat);
    expect(result?.title).toBe('You are watching this auction');
    expect(result?.treatment).toBe('restrained');
  });
});

// ── Bid activity formatting ──

describe('PASS 4.10: Bid activity formatting', () => {
  it('formats viewer bid with YOU badge', () => {
    const bid = {
      id: 1,
      bidderUsername: 'testuser',
      amountGbp: 100,
      createdAt: '2025-06-15T11:00:00Z',
      isViewer: true,
    };
    const row = formatBidActivityRow(bid, 0, formatFromFiat);
    expect(row.isViewer).toBe(true);
    expect(row.bidderLabel).toBe('You');
    expect(row.isTopBid).toBe(true);
  });

  it('formats non-viewer bid with masked identity', () => {
    const bid = {
      id: 2,
      bidderUsername: 'otheruser',
      amountGbp: 90,
      createdAt: '2025-06-15T10:30:00Z',
      isViewer: false,
    };
    const row = formatBidActivityRow(bid, 1, formatFromFiat);
    expect(row.isViewer).toBe(false);
    expect(row.bidderLabel).not.toBe('Bidder');
    expect(row.bidderLabel).not.toContain('otheruser');
    expect(row.bidderLabel).toContain('•••');
    expect(row.isTopBid).toBe(false);
  });
});

// ── Accessibility label ──

describe('PASS 4.11: Accessibility label', () => {
  it('includes title, price label, price text, countdown, bid count, viewer state', () => {
    const auction = makeAuction({ title: 'Nike Air Max', bidCount: 5, viewerState: 'leading' });
    const timing = { effectiveState: 'live' as const, msToStart: 0, msToEnd: 1800000 };
    const label = buildDetailAccessibilityLabel(auction, timing, 'Current bid', '£100.00', '30m left', 'leading');
    expect(label).toContain('Nike Air Max');
    expect(label).toContain('Current bid');
    expect(label).toContain('£100.00');
    expect(label).toContain('30m left');
    expect(label).toContain('5 bids');
    expect(label).toContain('leading');
  });

  it('does not include bid count when zero', () => {
    const auction = makeAuction({ bidCount: 0 });
    const timing = { effectiveState: 'upcoming' as const, msToStart: 3600000, msToEnd: 0 };
    const label = buildDetailAccessibilityLabel(auction, timing, 'Starting bid', '£50.00', 'Starts in 1h', 'not_participating');
    expect(label).not.toContain('bids');
  });
});

// ── PASS 5: Transaction sheet logic ──

describe('PASS 5: transactionSheetLogic — validateBidEntry', () => {
  const gbpRates = { GBP: 1, IZE: 10, USD: 1.25 };

  it('rejects empty/invalid input', () => {
    const result = validateBidEntry('', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe('invalid_amount');
  });

  it('rejects zero input', () => {
    const result = validateBidEntry('0', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe('invalid_amount');
  });

  it('rejects below minimum', () => {
    const result = validateBidEntry('5', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe('below_minimum');
  });

  it('accepts at minimum', () => {
    const result = validateBidEntry('10', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: false,
    });
    expect(result.valid).toBe(true);
    expect(result.gbpAmount).toBe(10);
  });

  it('accepts above minimum', () => {
    const result = validateBidEntry('15', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: false,
    });
    expect(result.valid).toBe(true);
    expect(result.gbpAmount).toBe(15);
  });

  it('rejects when seller', () => {
    const result = validateBidEntry('20', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: true,
      effectiveState: 'live',
      isSubmitting: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe('seller_restricted');
    expect(result.error?.transactionPossible).toBe(false);
  });

  it('rejects when auction ended', () => {
    const result = validateBidEntry('20', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'ended',
      isSubmitting: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe('auction_ended');
  });

  it('rejects when auction cancelled', () => {
    const result = validateBidEntry('20', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'cancelled',
      isSubmitting: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe('auction_cancelled');
  });

  it('rejects when auction settled', () => {
    const result = validateBidEntry('20', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'settled',
      isSubmitting: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe('auction_settled');
  });

  it('rejects when auction upcoming', () => {
    const result = validateBidEntry('20', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'upcoming',
      isSubmitting: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe('auction_not_started');
  });

  it('rejects when already submitting', () => {
    const result = validateBidEntry('20', 'GBP', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: true,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeNull();
  });

  it('converts non-GBP currency correctly', () => {
    const result = validateBidEntry('12.50', 'USD', gbpRates, {
      minimumNextBidGbp: 10,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: false,
    });
    expect(result.valid).toBe(true);
    expect(result.gbpAmount).toBe(10);
  });
});

describe('PASS 5: transactionSheetLogic — applyQuickIncrement', () => {
  it('increments by 1%', () => {
    const result = applyQuickIncrement('100', 0.01, 50);
    expect(result).toBe('101.00');
  });

  it('increments by 3%', () => {
    const result = applyQuickIncrement('100', 0.03, 50);
    expect(result).toBe('103.00');
  });

  it('increments by 5%', () => {
    const result = applyQuickIncrement('100', 0.05, 50);
    expect(result).toBe('105.00');
  });

  it('falls back to currentBidGbp when input is empty (currency-correct)', () => {
    const result = applyQuickIncrement('', 0.03, 50, 'GBP', { GBP: 1 });
    expect(result).toBe('51.50');
  });

  it('falls back to currentBidGbp when input is invalid (currency-correct)', () => {
    const result = applyQuickIncrement('abc', 0.05, 50, 'GBP', { GBP: 1 });
    expect(result).toBe('52.50');
  });
});

describe('PASS 5: transactionSheetLogic — mapApiErrorToTransactionError', () => {
  it('maps network error as ambiguous', () => {
    const result = mapApiErrorToTransactionError(
      new Error('network'),
      'fallback',
      null,
      undefined,
      'network',
      true,
    );
    expect(result.kind).toBe('network_failure');
    expect(result.canRetry).toBe(true);
    expect(result.isAmbiguous).toBe(true);
  });

  it('maps 401 to auth_required with session expired copy', () => {
    const result = mapApiErrorToTransactionError(
      new Error('unauthorized'),
      'fallback',
      null,
      401,
      'Unauthorized',
      false,
    );
    expect(result.kind).toBe('auth_required');
    expect(result.transactionPossible).toBe(false);
    expect(result.isAmbiguous).toBe(false);
    expect(result.message.toLowerCase()).toContain('session expired');
  });

  it('maps AML_BLOCKED code as definitive', () => {
    const result = mapApiErrorToTransactionError(
      new Error('aml'),
      'fallback',
      'AML_BLOCKED',
      403,
      'AML blocked',
      false,
    );
    expect(result.kind).toBe('aml_blocked');
    expect(result.transactionPossible).toBe(false);
    expect(result.isAmbiguous).toBe(false);
  });

  it('maps 403 (non-AML) to eligibility_blocked', () => {
    const result = mapApiErrorToTransactionError(
      new Error('eligibility'),
      'fallback',
      null,
      403,
      'Not eligible',
      false,
    );
    expect(result.kind).toBe('eligibility_blocked');
    expect(result.isAmbiguous).toBe(false);
  });

  it('maps 400 with minimum message to minimum_changed', () => {
    const result = mapApiErrorToTransactionError(
      new Error('min'),
      'fallback',
      null,
      400,
      'Bid must be at least 15.00 GBP',
      false,
    );
    expect(result.kind).toBe('minimum_changed');
    expect(result.updatedMinimumGbp).toBe(15);
    expect(result.canRetry).toBe(true);
    expect(result.isAmbiguous).toBe(false);
  });

  it('maps 400 with seller message to seller_restricted', () => {
    const result = mapApiErrorToTransactionError(
      new Error('seller'),
      'fallback',
      null,
      400,
      'Seller cannot bid on their own auction',
      false,
    );
    expect(result.kind).toBe('seller_restricted');
  });

  it('maps BUY_NOW_REVIEW_REQUIRED code as 409 with canRetry and transactionPossible', () => {
    const result = mapApiErrorToTransactionError(
      new Error('buy now'),
      'fallback',
      'BUY_NOW_REVIEW_REQUIRED',
      409,
      'Your bid meets or exceeds the Buy Now price (100.00). Use Buy Now to purchase this item immediately.',
      false,
    );
    expect(result.kind).toBe('buy_now_review_required');
    expect(result.isAmbiguous).toBe(false);
    expect(result.canRetry).toBe(true);
    expect(result.transactionPossible).toBe(true);
    expect(result.buyNowPriceGbp).toBe(100);
  });

  it('maps 400 with ended message to auction_ended', () => {
    const result = mapApiErrorToTransactionError(
      new Error('ended'),
      'fallback',
      null,
      400,
      'Auction is ended; bidding is closed',
      false,
    );
    expect(result.kind).toBe('auction_ended');
  });

  it('maps 409 with AUCTION_CANCELLED code', () => {
    const result = mapApiErrorToTransactionError(
      new Error('cancelled'),
      'fallback',
      'AUCTION_CANCELLED',
      409,
      'Auction is cancelled',
      false,
    );
    expect(result.kind).toBe('auction_cancelled');
    expect(result.isAmbiguous).toBe(false);
  });

  it('maps 409 with AUCTION_SETTLED code', () => {
    const result = mapApiErrorToTransactionError(
      new Error('settled'),
      'fallback',
      'AUCTION_SETTLED',
      409,
      'Auction is settled',
      false,
    );
    expect(result.kind).toBe('auction_settled');
  });

  it('maps 409 with BUY_NOW_PRICE_CHANGED code', () => {
    const result = mapApiErrorToTransactionError(
      new Error('price changed'),
      'fallback',
      'BUY_NOW_PRICE_CHANGED',
      409,
      'Buy Now price has changed to 120.00',
      false,
    );
    expect(result.kind).toBe('buy_now_price_changed');
    expect(result.currentBuyNowPriceGbp).toBe(120);
    expect(result.canRetry).toBe(true);
  });

  it('maps 409 to auction_ended', () => {
    const result = mapApiErrorToTransactionError(
      new Error('conflict'),
      'fallback',
      null,
      409,
      'Auction is ended; bidding is closed',
      false,
    );
    expect(result.kind).toBe('auction_ended');
  });

  it('maps 5xx as ambiguous (commit status uncertain)', () => {
    const result = mapApiErrorToTransactionError(
      new Error('unknown'),
      'fallback',
      null,
      500,
      'Server error',
      false,
    );
    expect(result.kind).toBe('unknown_backend');
    expect(result.canRetry).toBe(true);
    expect(result.isAmbiguous).toBe(true);
  });
});

describe('PASS 5: transactionSheetLogic — isBuyNowValid', () => {
  it('valid when live, not seller, has price', () => {
    expect(isBuyNowValid({
      buyNowPriceGbp: 100,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: false,
    })).toBe(true);
  });

  it('invalid when no price', () => {
    expect(isBuyNowValid({
      buyNowPriceGbp: null,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: false,
    })).toBe(false);
  });

  it('invalid when seller', () => {
    expect(isBuyNowValid({
      buyNowPriceGbp: 100,
      isSeller: true,
      effectiveState: 'live',
      isSubmitting: false,
    })).toBe(false);
  });

  it('invalid when not live', () => {
    expect(isBuyNowValid({
      buyNowPriceGbp: 100,
      isSeller: false,
      effectiveState: 'ended',
      isSubmitting: false,
    })).toBe(false);
  });

  it('invalid when submitting', () => {
    expect(isBuyNowValid({
      buyNowPriceGbp: 100,
      isSeller: false,
      effectiveState: 'live',
      isSubmitting: true,
    })).toBe(false);
  });
});

describe('PASS 5: transactionSheetLogic — lifecycle guards', () => {
  it('shouldCloseSheetDueToLifecycle returns true for ended', () => {
    expect(shouldCloseSheetDueToLifecycle('ended')).toBe(true);
  });

  it('shouldCloseSheetDueToLifecycle returns true for cancelled', () => {
    expect(shouldCloseSheetDueToLifecycle('cancelled')).toBe(true);
  });

  it('shouldCloseSheetDueToLifecycle returns true for settled', () => {
    expect(shouldCloseSheetDueToLifecycle('settled')).toBe(true);
  });

  it('shouldCloseSheetDueToLifecycle returns false for live', () => {
    expect(shouldCloseSheetDueToLifecycle('live')).toBe(false);
  });

  it('shouldCloseSheetDueToLifecycle returns false for upcoming', () => {
    expect(shouldCloseSheetDueToLifecycle('upcoming')).toBe(false);
  });
});

describe('PASS 5: transactionSheetLogic — stale state', () => {
  it('isSheetStateStale returns true after threshold', () => {
    expect(isSheetStateStale(1000, 35000, 30000)).toBe(true);
  });

  it('isSheetStateStale returns false within threshold', () => {
    expect(isSheetStateStale(1000, 15000, 30000)).toBe(false);
  });
});

describe('PASS 5: transactionSheetLogic — formatGbpEquivalent', () => {
  it('returns null for GBP', () => {
    expect(formatGbpEquivalent(100, 100, 'GBP')).toBeNull();
  });

  it('returns formatted string for non-GBP', () => {
    const result = formatGbpEquivalent(125, 100, 'USD');
    expect(result).toContain('£100.00');
  });
});

describe('PASS 5: transactionSheetLogic — getSuggestedBid', () => {
  it('returns a numeric string', () => {
    const result = getSuggestedBid(100, 'GBP', { GBP: 1 });
    const parsed = Number(result);
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBeGreaterThan(100);
  });
});

// ── PASS 5.1: Integration tests — real function invocation ──

describe('PASS 5.1: createStableId integration', () => {
  it('generates a UUID-format string', () => {
    const id = createStableId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs on consecutive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(createStableId());
    }
    expect(ids.size).toBe(100);
  });

  it('supports optional prefix', () => {
    const id = createStableId('bid');
    expect(id.startsWith('bid_')).toBe(true);
  });

  it('does not use Math.random for the primary path', () => {
    const id = createStableId();
    expect(id.length).toBe(36);
  });
});

describe('PASS 5.1: Idempotency state machine — ambiguous vs definitive', () => {
  it('network failure is classified as ambiguous (preserve key)', () => {
    const txError = mapApiErrorToTransactionError(
      new Error('network'),
      'fallback',
      null,
      undefined,
      'Network error',
      true,
    );
    expect(txError.isAmbiguous).toBe(true);
    expect(txError.canRetry).toBe(true);
  });

  it('5xx server error is classified as ambiguous (preserve key)', () => {
    const txError = mapApiErrorToTransactionError(
      new Error('server'),
      'fallback',
      null,
      503,
      'Service unavailable',
      false,
    );
    expect(txError.isAmbiguous).toBe(true);
  });

  it('BUY_NOW_REVIEW_REQUIRED is definitive (reset key)', () => {
    const txError = mapApiErrorToTransactionError(
      new Error('buy now'),
      'fallback',
      'BUY_NOW_REVIEW_REQUIRED',
      409,
      'Use Buy Now',
      false,
    );
    expect(txError.isAmbiguous).toBe(false);
    expect(txError.transactionPossible).toBe(true);
  });

  it('minimum_changed is definitive (reset key)', () => {
    const txError = mapApiErrorToTransactionError(
      new Error('min'),
      'fallback',
      null,
      400,
      'Bid must be at least 20.00 GBP',
      false,
    );
    expect(txError.isAmbiguous).toBe(false);
    expect(txError.canRetry).toBe(true);
  });

  it('BUY_NOW_PRICE_CHANGED is definitive (reset key)', () => {
    const txError = mapApiErrorToTransactionError(
      new Error('price'),
      'fallback',
      'BUY_NOW_PRICE_CHANGED',
      409,
      'Price changed to 150.00',
      false,
    );
    expect(txError.isAmbiguous).toBe(false);
    expect(txError.canRetry).toBe(true);
    expect(txError.currentBuyNowPriceGbp).toBe(150);
  });

  it('AUCTION_CANCELLED is definitive terminal (no retry)', () => {
    const txError = mapApiErrorToTransactionError(
      new Error('cancelled'),
      'fallback',
      'AUCTION_CANCELLED',
      409,
      'Auction cancelled',
      false,
    );
    expect(txError.isAmbiguous).toBe(false);
    expect(txError.canRetry).toBe(false);
    expect(txError.transactionPossible).toBe(false);
  });

  it('AUCTION_SETTLED is definitive terminal (no retry)', () => {
    const txError = mapApiErrorToTransactionError(
      new Error('settled'),
      'fallback',
      'AUCTION_SETTLED',
      409,
      'Auction settled',
      false,
    );
    expect(txError.isAmbiguous).toBe(false);
    expect(txError.canRetry).toBe(false);
  });

  it('401 auth is definitive (not ambiguous)', () => {
    const txError = mapApiErrorToTransactionError(
      new Error('auth'),
      'fallback',
      null,
      401,
      'Unauthorized',
      false,
    );
    expect(txError.isAmbiguous).toBe(false);
    expect(txError.transactionPossible).toBe(false);
  });
});

// ── PASS 5.2: New error kinds and quick-increment fallback ──

describe('PASS 5.2: mapApiErrorToTransactionError — AUCTION_ALREADY_WON', () => {
  it('maps 409 with AUCTION_ALREADY_WON code as terminal', () => {
    const result = mapApiErrorToTransactionError(
      new Error('already won'),
      'fallback',
      'AUCTION_ALREADY_WON',
      409,
      'This auction has already been won via Buy Now.',
      false,
    );
    expect(result.kind).toBe('auction_already_won');
    expect(result.isAmbiguous).toBe(false);
    expect(result.canRetry).toBe(false);
    expect(result.transactionPossible).toBe(false);
  });

  it('maps 409 with "already been won" message as auction_already_won', () => {
    const result = mapApiErrorToTransactionError(
      new Error('won'),
      'fallback',
      null,
      409,
      'This auction has already been won via Buy Now.',
      false,
    );
    expect(result.kind).toBe('auction_already_won');
    expect(result.canRetry).toBe(false);
  });
});

describe('PASS 5.2: applyQuickIncrement — fallback uses minimum, not current bid', () => {
  const gbpRates = { GBP: 1, IZE: 10, USD: 1.25 };

  it('uses fallbackMinimumGbp when input is empty', () => {
    const result = applyQuickIncrement('', 0.05, 51, 'GBP', gbpRates);
    expect(Number(result)).toBeCloseTo(53.55, 2);
  });

  it('uses fallbackMinimumGbp when input is invalid', () => {
    const result = applyQuickIncrement('abc', 0.1, 51, 'GBP', gbpRates);
    expect(Number(result)).toBeCloseTo(56.1, 2);
  });

  it('applies increment to existing valid input, ignoring fallback', () => {
    const result = applyQuickIncrement('100.00', 0.05, 51, 'GBP', gbpRates);
    expect(Number(result)).toBeCloseTo(105.0, 2);
  });

  it('converts fallback from GBP to display currency for non-GBP', () => {
    const result = applyQuickIncrement('', 0.05, 51, 'USD', gbpRates);
    expect(Number(result)).toBeCloseTo(66.94, 2);
  });
});

// ── Bid activity privacy ──

describe('PASS 4.1: Bid activity privacy', () => {
  it('masks non-viewer bidder identity', () => {
    const bid = {
      id: 1,
      bidderUsername: 'privateuser',
      amountGbp: 100,
      createdAt: '2025-06-15T11:00:00Z',
      isViewer: false,
    };
    const row = formatBidActivityRow(bid, 0, formatFromFiat);
    expect(row.bidderLabel).not.toBe('Bidder');
    expect(row.bidderLabel).not.toContain('privateuser');
    expect(row.bidderLabel).toContain('•••');
  });

  it('preserves You for viewer bids', () => {
    const bid = {
      id: 2,
      bidderUsername: 'me',
      amountGbp: 120,
      createdAt: '2025-06-15T11:01:00Z',
      isViewer: true,
    };
    const row = formatBidActivityRow(bid, 0, formatFromFiat);
    expect(row.bidderLabel).toBe('You');
  });
});
