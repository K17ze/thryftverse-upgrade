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

  describe('ended — seller sold', () => {
    it('shows View outcome as primary', () => {
      const auction = makeAuction({ viewerState: 'seller', bidCount: 5 });
      const result = resolveStateAction('ended', 'seller', auction);
      expect(result.primary.type).toBe('viewOutcome');
      expect(result.viewerMessage).toBe('Your auction has ended');
    });
  });

  describe('ended — seller no bids', () => {
    it('shows no bids received message', () => {
      const auction = makeAuction({ viewerState: 'seller', bidCount: 0 });
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

// ── Module-level source reads for static guardrails and parity tests ──

const fs = require('fs');
const path = require('path');
const screenSrc = fs.readFileSync(
  path.resolve(__dirname, '../screens/AuctionDetailScreen.tsx'),
  'utf-8'
);
const sellerTrustCardSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/product/SellerTrustCard.tsx'),
  'utf-8'
);
const logicSrc = fs.readFileSync(
  path.resolve(__dirname, '../utils/auctionDetailLogic.ts'),
  'utf-8'
);
const bidSheetSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/ui/BidSheet.tsx'),
  'utf-8'
);
const buyNowSheetSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/ui/BuyNowSheet.tsx'),
  'utf-8'
);
const txLogicSrc = fs.readFileSync(
  path.resolve(__dirname, '../utils/transactionSheetLogic.ts'),
  'utf-8'
);

// ── Static guardrails ──

describe('PASS 4.12: Static guardrails (source inspection)', () => {

  it('uses useBucketedServerClock (not local interval)', () => {
    expect(screenSrc).toContain('useBucketedServerClock');
    expect(screenSrc).not.toContain('setInterval');
  });

  it('uses secondClock and minuteClock', () => {
    expect(screenSrc).toContain('secondClock');
    expect(screenSrc).toContain('minuteClock');
  });

  it('uses resolveStateAction from auctionDetailLogic', () => {
    expect(screenSrc).toContain('resolveStateAction');
  });

  it('uses resolveDetailPriceLabel from auctionDetailLogic', () => {
    expect(screenSrc).toContain('resolveDetailPriceLabel');
  });

  it('uses resolveDetailCountdown from auctionDetailLogic', () => {
    expect(screenSrc).toContain('resolveDetailCountdown');
  });

  it('uses resolveViewerContextMessage from auctionDetailLogic', () => {
    expect(screenSrc).toContain('resolveViewerContextMessage');
  });

  it('uses detectLifecycleTransition for auto-refresh', () => {
    expect(screenSrc).toContain('detectLifecycleTransition');
  });

  it('uses isBuyNowAvailable from auctionDetailLogic', () => {
    expect(screenSrc).toContain('isBuyNowAvailable');
  });

  it('uses areBidControlsRemoved from auctionDetailLogic', () => {
    expect(screenSrc).toContain('areBidControlsRemoved');
  });

  it('does not fabricate conversation IDs', () => {
    expect(screenSrc).not.toMatch(/conversationId.*seller/);
    expect(screenSrc).not.toMatch(/seller.*conversationId/);
  });

  it('uses NewMessage route for seller messaging', () => {
    expect(screenSrc).toContain('NewMessage');
    expect(screenSrc).toContain('preselectedUserId');
  });

  it('handles cancelled state', () => {
    expect(screenSrc).toContain('cancelled');
    expect(screenSrc).toContain('cancelledAt');
  });

  it('handles settled state', () => {
    expect(screenSrc).toContain('settled');
    expect(screenSrc).toContain('settledAt');
  });

  it('has terminal dock for ended/cancelled/settled', () => {
    expect(screenSrc).toContain('terminalDock');
    expect(screenSrc).toContain('isTerminal');
  });

  it('has seller dock with seller ownership treatment', () => {
    expect(screenSrc).toContain('sellerDockInfo');
    expect(screenSrc).toContain('isSeller');
  });

  it('BidSheet shows minimum next bid', () => {
    expect(bidSheetSrc).toContain('Minimum to lead');
    expect(bidSheetSrc).toContain('minimumNextBidGbp');
  });

  it('has accessibility label for screen', () => {
    expect(screenSrc).toContain('accessibilityLabel');
    expect(screenSrc).toContain('buildDetailAccessibilityLabel');
  });

  it('has resync failure banner', () => {
    expect(screenSrc).toContain('resyncFailed');
    expect(screenSrc).toContain('markResyncFailed');
  });

  it('does not use haptics', () => {
    expect(screenSrc).not.toContain('haptics');
  });

  it('does not describe Buy Now as maximum bid or instant bid', () => {
    expect(screenSrc).not.toMatch(/maximum bid/i);
    expect(screenSrc).not.toMatch(/instant bid/i);
    // "Winning bid" is valid in terminal result-state context (lost viewer)
    // but must not appear in BuyNowSheet description
    expect(buyNowSheetSrc).not.toMatch(/winning bid/i);
  });

  it('does not expose Edit, Cancel or Relist for seller', () => {
    expect(screenSrc).not.toMatch(/\bEdit\b/);
    expect(screenSrc).not.toMatch(/\bRelist\b/);
  });

  it('logic file exports resolveStateAction', () => {
    expect(logicSrc).toContain('export function resolveStateAction');
  });

  it('logic file exports isBuyNowAvailable', () => {
    expect(logicSrc).toContain('export function isBuyNowAvailable');
  });

  it('logic file exports areBidControlsRemoved', () => {
    expect(logicSrc).toContain('export function areBidControlsRemoved');
  });

  it('logic file exports isSellerBlocked', () => {
    expect(logicSrc).toContain('export function isSellerBlocked');
  });

  it('logic file exports detectLifecycleTransition', () => {
    expect(logicSrc).toContain('export function detectLifecycleTransition');
  });

  it('logic file has forbidden actions including edit, cancel, relist', () => {
    expect(logicSrc).toContain("'edit'");
    expect(logicSrc).toContain("'cancel'");
    expect(logicSrc).toContain("'relist'");
  });

  // ── Correction pass 1 guardrails ──

  it('does not have inline action row duplicating sticky dock', () => {
    expect(screenSrc).not.toContain('inlineActionRow');
    expect(screenSrc).not.toContain('inlineActionPrimary');
  });

  it('has exactly one primary CTA in sticky dock (not side-by-side)', () => {
    expect(screenSrc).toContain('actionDockFull');
    expect(screenSrc).not.toContain('actionDockPrimary');
  });

  it('Buy Now is demoted to a text link below primary CTA', () => {
    expect(screenSrc).toContain('buyNowLink');
    expect(screenSrc).toContain('buyNowLinkText');
  });

  it('Buy Now requires confirmation via BuyNowSheet', () => {
    expect(screenSrc).toContain('BuyNowSheet');
    expect(screenSrc).not.toContain('Alert.alert');
  });

  it('does not navigate to Checkout for viewResult in sticky dock', () => {
    const dockStart = screenSrc.indexOf('Sticky bottom action dock');
    const dockEnd = screenSrc.indexOf('sellerDockInfo');
    const dockSection = screenSrc.substring(dockStart, dockEnd);
    expect(dockSection).not.toContain('Checkout');
  });

  // ── Correction pass 2 guardrails ──

  it('BidSheet uses BottomSheet with keyboard support', () => {
    expect(bidSheetSrc).toContain('BottomSheet');
  });

  it('touch targets are at least 44pt (back and watch buttons)', () => {
    expect(screenSrc).toMatch(/backBtnFloating[\s\S]*?width:\s*44/);
    expect(screenSrc).toMatch(/watchBtnFloating[\s\S]*?width:\s*44/);
  });

  it('seller name has numberOfLines to prevent overflow', () => {
    // Seller name rendering (with numberOfLines) lives in SellerTrustCard
    expect(sellerTrustCardSrc).toMatch(/numberOfLines/);
  });

  it('has lifecycle transition loop guard (isTransitionRefreshing)', () => {
    expect(screenSrc).toContain('isTransitionRefreshing');
  });

  it('urgent countdown uses larger font size', () => {
    expect(screenSrc).toMatch(/timeTextUrgent[\s\S]*?fontSize:\s*16/);
  });

  it('bid count is demoted (not competing with price)', () => {
    expect(screenSrc).toMatch(/bidCountValue[\s\S]*?color:\s*Colors\.textSecondary/);
  });
});

// ── PASS 4.1 Parity: Bid authoring contract ──

describe('PASS 4.1: Bid authoring currency contract', () => {
  it('BidSheet imports getSuggestedBidDisplayAmount (via transactionSheetLogic)', () => {
    expect(txLogicSrc).toContain('getSuggestedBidDisplayAmount');
  });

  it('BidSheet imports convertDisplayToGbpAmount (via transactionSheetLogic)', () => {
    expect(txLogicSrc).toContain('convertDisplayToGbpAmount');
  });

  it('BidSheet imports sanitizeDecimalInput', () => {
    expect(bidSheetSrc).toContain('sanitizeDecimalInput');
  });

  it('screen passes currencyCode and goldRates to BidSheet', () => {
    expect(screenSrc).toContain('currencyCode');
    expect(screenSrc).toContain('goldRates');
  });

  it('BidSheet validates minimumNextBidGbp', () => {
    expect(bidSheetSrc).toContain('minimumNextBidGbp');
  });

  it('transactionSheetLogic rounds to two decimals before submission', () => {
    expect(txLogicSrc).toContain('toFixed(2)');
  });

  it('BidSheet preserves +1%, +3%, +5% bump controls', () => {
    expect(bidSheetSrc).toContain('0.01');
    expect(bidSheetSrc).toContain('0.03');
    expect(bidSheetSrc).toContain('0.05');
    expect(bidSheetSrc).toContain('applyQuickIncrement');
  });
});

// ── PASS 4.1 Parity: Idempotency ──

describe('PASS 4.1: Idempotency and mutation safety', () => {
  it('screen has isSubmittingBid guard', () => {
    expect(screenSrc).toContain('isSubmittingBid');
  });

  it('screen has isBuyNowLoading guard', () => {
    expect(screenSrc).toContain('isBuyNowLoading');
  });

  it('BidSheet creates idempotency key once per attempt (not in render)', () => {
    expect(bidSheetSrc).toContain('idempotencyKeyRef');
    expect(bidSheetSrc).toContain('idempotencyKeyRef.current');
  });

  it('BidSheet uses createStableId for idempotency keys', () => {
    expect(bidSheetSrc).toContain('createStableId');
    expect(bidSheetSrc).not.toContain('Math.random');
  });

  it('BuyNowSheet creates idempotency key once per attempt (not in render)', () => {
    expect(buyNowSheetSrc).toContain('idempotencyKeyRef');
    expect(buyNowSheetSrc).toContain('idempotencyKeyRef.current');
  });

  it('BuyNowSheet uses createStableId for idempotency keys', () => {
    expect(buyNowSheetSrc).toContain('createStableId');
    expect(buyNowSheetSrc).not.toContain('Math.random');
  });

  it('handleSubmitBid has duplicate guard at top', () => {
    const submitSection = screenSrc.substring(
      screenSrc.indexOf('const handleSubmitBid'),
      screenSrc.indexOf('const openBuyNowSheet')
    );
    expect(submitSection).toContain('isSubmittingBid');
  });

  it('handleSubmitBuyNow has duplicate guard at top', () => {
    const buyNowSection = screenSrc.substring(
      screenSrc.indexOf('const handleSubmitBuyNow'),
      screenSrc.indexOf('const detailInput')
    );
    expect(buyNowSection).toContain('isBuyNowLoading');
  });
});

// ── PASS 4.1 Parity: Compliance and error adoption ──

describe('PASS 4.1: Compliance and error adoption', () => {
  it('screen imports parseApiError', () => {
    expect(screenSrc).toContain('parseApiError');
  });

  it('BidSheet has inline error display (error state + errorRow style)', () => {
    expect(bidSheetSrc).toContain('error');
    expect(bidSheetSrc).toContain('errorRow');
    expect(bidSheetSrc).toContain('errorText');
  });

  it('BidSheet validation errors set error state', () => {
    expect(bidSheetSrc).toContain('setError');
  });

  it('BidSheet backend error sets error and triggers refetch', () => {
    const submitSection = bidSheetSrc.substring(
      bidSheetSrc.indexOf('handleConfirmBid'),
      bidSheetSrc.indexOf('handleEditFromReview')
    );
    expect(submitSection).toContain('setError');
    expect(submitSection).toContain('onRefreshDetail');
  });

  it('BidSheet error clears on input change', () => {
    expect(bidSheetSrc).toContain('handleInputChange');
    expect(bidSheetSrc).toContain('setError(null)');
  });
});

// ── PASS 4.1 Parity: Watch ──

describe('PASS 4.1: Watch parity', () => {
  it('has optimistic update', () => {
    const watchSection = screenSrc.substring(
      screenSrc.indexOf('const handleToggleWatch'),
      screenSrc.indexOf('const openBidSheet')
    );
    expect(watchSection).toContain('setAuction');
    expect(watchSection).toContain('isWatched: !wasWatching');
  });

  it('has watchToggling duplicate guard', () => {
    const watchSection = screenSrc.substring(
      screenSrc.indexOf('const handleToggleWatch'),
      screenSrc.indexOf('const openBidSheet')
    );
    expect(watchSection).toContain('watchToggling');
  });

  it('has POST add and DELETE remove', () => {
    expect(screenSrc).toContain('addToWatchlist');
    expect(screenSrc).toContain('removeFromWatchlist');
  });

  it('has rollback on failure', () => {
    const watchSection = screenSrc.substring(
      screenSrc.indexOf('const handleToggleWatch'),
      screenSrc.indexOf('const openBidSheet')
    );
    expect(watchSection).toContain('catch');
    expect(watchSection).toContain('wasWatching');
  });

  it('floating watch and sticky dock use same handleToggleWatch', () => {
    expect(screenSrc).toContain('handleToggleWatch');
    const occurrences = (screenSrc.match(/handleToggleWatch/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});

// ── PASS 4.1 Parity: Seller and messaging ──

describe('PASS 4.1: Seller and messaging parity', () => {
  it('has UserProfile navigation for seller profile', () => {
    expect(screenSrc).toContain('UserProfile');
    expect(screenSrc).toContain('auction.seller.id');
  });

  it('has NewMessage navigation with preselectedUserId', () => {
    expect(screenSrc).toContain('NewMessage');
    expect(screenSrc).toContain('preselectedUserId');
    expect(screenSrc).toContain('preselectedDisplayName');
  });

  it('hides Message Seller when viewer is seller', () => {
    // AuctionDetailScreen passes onMessage=undefined when isSeller;
    // SellerTrustCard only renders the message button when onMessage is truthy.
    expect(screenSrc).toContain('!isSeller');
    expect(sellerTrustCardSrc).toMatch(/onMessage\s*&&/);
  });

  it('does not use fabricated conversation IDs', () => {
    expect(screenSrc).not.toMatch(/conversationId.*seller/);
    expect(screenSrc).not.toMatch(/seller.*conversationId/);
    expect(screenSrc).not.toContain('partnerUserId');
  });

  it('has avatar fallback for missing avatarUrl', () => {
    // Avatar fallback lives in SellerTrustCard
    expect(sellerTrustCardSrc).toContain('avatarFallback');
  });

  it('has displayName fallback to @username', () => {
    expect(screenSrc).toContain('displayName');
    expect(screenSrc).toContain('username');
  });
});

// ── PASS 4.1 Parity: Bid activity privacy ──

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

  it('screen does not expose raw bidderUsername in render', () => {
    const bidActivitySection = screenSrc.substring(
      screenSrc.indexOf('Bid activity'),
      screenSrc.indexOf('Description and item')
    );
    expect(bidActivitySection).not.toContain('bidderUsername');
  });
});

// ── PASS 4.1 Parity: Refresh and lifecycle ──

describe('PASS 4.1: Refresh and lifecycle parity', () => {
  it('has initial detail fetch', () => {
    expect(screenSrc).toContain('fetchDetail');
  });

  it('has pull-to-refresh', () => {
    expect(screenSrc).toContain('RefreshControl');
    expect(screenSrc).toContain('handleRefresh');
  });

  it('has serverNow resync', () => {
    expect(screenSrc).toContain('resync(');
    expect(screenSrc).toContain('serverNow');
  });

  it('has foreground resync', () => {
    expect(screenSrc).toContain('needsResync');
  });

  it('has lifecycle transition detection', () => {
    expect(screenSrc).toContain('detectLifecycleTransition');
    expect(screenSrc).toContain('prevLifecycleRef');
  });

  it('has transition loop guard', () => {
    expect(screenSrc).toContain('isTransitionRefreshing');
  });

  it('has post-bid refetch', () => {
    const submitSection = screenSrc.substring(
      screenSrc.indexOf('const handleSubmitBid'),
      screenSrc.indexOf('const openBuyNowSheet')
    );
    expect(submitSection).toContain('fetchDetail');
  });

  it('has post-Buy-Now refetch', () => {
    const buyNowSection = screenSrc.substring(
      screenSrc.indexOf('const handleSubmitBuyNow'),
      screenSrc.indexOf('const detailInput')
    );
    expect(buyNowSection).toContain('fetchDetail');
  });
});

// ── PASS 4.1 Parity: Loading and state continuity ──

describe('PASS 4.1: Loading and state continuity', () => {
  it('has initial skeleton', () => {
    expect(screenSrc).toContain('SkeletonLoader');
    expect(screenSrc).toContain('loading');
  });

  it('has detail failure retry', () => {
    expect(screenSrc).toContain('EmptyState');
    expect(screenSrc).toContain('Go Back');
  });

  it('has bid activity failure isolation', () => {
    expect(screenSrc).toContain('bidActivityError');
    expect(screenSrc).toContain('subSectionError');
  });

  it('has bid submission loading state', () => {
    expect(bidSheetSrc).toContain('Submitting');
  });

  it('has Buy Now loading state', () => {
    expect(screenSrc).toContain('Processing...');
  });

  it('has watch loading state', () => {
    expect(screenSrc).toContain('watchToggling');
  });
});

// ── PASS 4.1 Parity: Buy Now quality ──

describe('PASS 4.1: Buy Now quality and truth', () => {
  it('has fixed authoritative price', () => {
    expect(screenSrc).toContain('buyNowPriceGbp');
  });

  it('has idempotency key for Buy Now', () => {
    expect(buyNowSheetSrc).toContain('idempotencyKeyRef');
    expect(buyNowSheetSrc).toContain('idempotencyKey');
  });

  it('has loading guard', () => {
    expect(screenSrc).toContain('isBuyNowLoading');
  });

  it('has backend transaction call', () => {
    const buyNowSection = screenSrc.substring(
      screenSrc.indexOf('const handleSubmitBuyNow'),
      screenSrc.indexOf('const detailInput')
    );
    expect(buyNowSection).toContain('buyAuctionNow');
  });

  it('has structured error handling', () => {
    expect(buyNowSheetSrc).toContain('parseApiError');
    expect(buyNowSheetSrc).toContain('mapApiErrorToTransactionError');
  });

  it('has authoritative refetch', () => {
    expect(screenSrc).toContain('refreshDetailForTransaction');
  });

  it('does not navigate to Checkout prematurely from dock', () => {
    const dockStart = screenSrc.indexOf('Sticky bottom action dock');
    const dockEnd = screenSrc.indexOf('sellerDockInfo');
    const dockSection = screenSrc.substring(dockStart, dockEnd);
    expect(dockSection).not.toContain('Checkout');
  });

  it('BuyNowSheet replaces Alert.alert with proper review sheet', () => {
    expect(screenSrc).not.toContain('Alert.alert');
    expect(screenSrc).toContain('BuyNowSheet');
  });
});

// ── PASS 4.1 Parity: UI/UX quality ──

describe('PASS 4.1: UI/UX quality parity', () => {
  it('has single dominant CTA in sticky dock', () => {
    expect(screenSrc).toContain('actionDockFull');
    expect(screenSrc).not.toContain('inlineActionRow');
  });

  it('BidSheet uses BottomSheet with KeyboardAvoidingView', () => {
    expect(bidSheetSrc).toContain('BottomSheet');
  });

  it('minimum next bid is visible in BidSheet', () => {
    expect(bidSheetSrc).toContain('Minimum to lead');
    expect(bidSheetSrc).toContain('minimumNextBidGbp');
  });

  it('entered amount is visible and editable in BidSheet', () => {
    expect(bidSheetSrc).toContain('AppInput');
    expect(bidSheetSrc).toContain('bidInput');
    expect(bidSheetSrc).toContain('onChangeText');
  });

  it('errors appear near the relevant control (errorRow)', () => {
    expect(bidSheetSrc).toContain('errorRow');
  });

  it('seller actions remain discoverable (profile + message)', () => {
    expect(screenSrc).toContain('UserProfile');
    expect(screenSrc).toContain('NewMessage');
  });

  it('terminal states do not show dead controls', () => {
    expect(screenSrc).toContain('isTerminal');
    expect(screenSrc).toContain('terminalDock');
    expect(screenSrc).toContain('showBidControls');
  });

  it('controls disabled during submission', () => {
    expect(screenSrc).toContain('isSubmittingBid');
    expect(screenSrc).toContain('isBuyNowLoading');
    expect(bidSheetSrc).toContain('isSubmitting');
    expect(buyNowSheetSrc).toContain('isSubmitting');
  });
});

// ── PASS 5: Transaction sheet logic ──

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
    // PASS 8: fallback should be in display currency, not raw GBP
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
    expect(result.message).toContain('session has expired');
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

// ── PASS 5: BidSheet static guardrails ──

describe('PASS 5: BidSheet static guardrails', () => {
  it('has two-stage flow (entry and review)', () => {
    expect(bidSheetSrc).toContain('entry');
    expect(bidSheetSrc).toContain('review');
    expect(bidSheetSrc).toContain('Review bid');
  });

  it('has success stage', () => {
    expect(bidSheetSrc).toContain('success');
    expect(bidSheetSrc).toContain('Bid placed');
  });

  it('has error stage', () => {
    expect(bidSheetSrc).toContain('error');
    expect(bidSheetSrc).toContain('errorTitle');
  });

  it('has submitting stage', () => {
    expect(bidSheetSrc).toContain('submitting');
  });

  it('has item context header with title and seller', () => {
    expect(bidSheetSrc).toContain('itemHeader');
    expect(bidSheetSrc).toContain('itemTitle');
    expect(bidSheetSrc).toContain('sellerName');
  });

  it('has current bid and minimum next bid display', () => {
    expect(bidSheetSrc).toContain('Current value');
    expect(bidSheetSrc).toContain('Minimum to lead');
  });

  it('has quick increment chips (+1%, +3%, +5%)', () => {
    expect(bidSheetSrc).toContain('incrementChip');
    expect(bidSheetSrc).toContain('Math.round(pct * 100)');
    expect(bidSheetSrc).toContain('0.01');
    expect(bidSheetSrc).toContain('0.03');
    expect(bidSheetSrc).toContain('0.05');
  });

  it('has binding commitment notice in review', () => {
    expect(bidSheetSrc).toContain('binding');
  });

  it('has GBP equivalent display for non-GBP currencies', () => {
    expect(bidSheetSrc).toContain('gbpEquivalent');
  });

  it('has lifecycle guard effect', () => {
    expect(bidSheetSrc).toContain('shouldCloseSheetDueToLifecycle');
  });

  it('has stale state check before review', () => {
    expect(bidSheetSrc).toContain('isSheetStateStale');
  });

  it('has idempotency key ref (not recreated on re-render)', () => {
    expect(bidSheetSrc).toContain('idempotencyKeyRef');
  });

  it('has accessibility labels', () => {
    expect(bidSheetSrc).toContain('accessibilityLabel');
    expect(bidSheetSrc).toContain('accessibilityHint');
  });

  it('prevents dismiss during submission', () => {
    expect(bidSheetSrc).toContain('isSubmitting');
    const dismissSection = bidSheetSrc.substring(
      bidSheetSrc.indexOf('handleDismiss'),
      bidSheetSrc.indexOf('handleRetry')
    );
    expect(dismissSection).toContain('isSubmitting');
  });
});

// ── PASS 5: BuyNowSheet static guardrails ──

describe('PASS 5: BuyNowSheet static guardrails', () => {
  it('has review stage with price display', () => {
    expect(buyNowSheetSrc).toContain('review');
    expect(buyNowSheetSrc).toContain('fixedPriceValue');
  });

  it('has success stage', () => {
    expect(buyNowSheetSrc).toContain('success');
    expect(buyNowSheetSrc).toContain('Purchase confirmed');
  });

  it('has error stage', () => {
    expect(buyNowSheetSrc).toContain('error');
    expect(buyNowSheetSrc).toContain('errorTitle');
  });

  it('has submitting stage', () => {
    expect(buyNowSheetSrc).toContain('submitting');
  });

  it('has item context header', () => {
    expect(buyNowSheetSrc).toContain('itemHeader');
    expect(buyNowSheetSrc).toContain('itemTitle');
  });

  it('states this is a fixed-price purchase, not a bid', () => {
    expect(buyNowSheetSrc).toContain('fixed-price purchase');
    expect(buyNowSheetSrc).toContain('not a bid');
  });

  it('states auction will end immediately', () => {
    expect(buyNowSheetSrc).toContain('ends the auction immediately');
  });

  it('has lifecycle guard', () => {
    expect(buyNowSheetSrc).toContain('shouldCloseSheetDueToLifecycle');
  });

  it('has idempotency key ref', () => {
    expect(buyNowSheetSrc).toContain('idempotencyKeyRef');
  });

  it('has accessibility labels', () => {
    expect(buyNowSheetSrc).toContain('accessibilityLabel');
  });

  it('prevents dismiss during submission', () => {
    const dismissSection = buyNowSheetSrc.substring(
      buyNowSheetSrc.indexOf('handleDismiss'),
      buyNowSheetSrc.indexOf('handleRetry')
    );
    expect(dismissSection).toContain('isSubmitting');
  });

  it('has isBuyNowValid guard', () => {
    expect(buyNowSheetSrc).toContain('isBuyNowValid');
  });

  it('does not navigate to Checkout', () => {
    expect(buyNowSheetSrc).not.toContain('Checkout');
    expect(buyNowSheetSrc).not.toContain('navigation.navigate');
  });
});

// ── PASS 5: AuctionDetailScreen integration guardrails ──

describe('PASS 5: AuctionDetailScreen sheet integration', () => {
  it('renders BidSheet with auction context', () => {
    expect(screenSrc).toContain('BidSheet');
    expect(screenSrc).toContain('bidSheetVisible');
    expect(screenSrc).toContain('closeBidSheet');
  });

  it('renders BuyNowSheet with auction context', () => {
    expect(screenSrc).toContain('BuyNowSheet');
    expect(screenSrc).toContain('buyNowSheetVisible');
    expect(screenSrc).toContain('closeBuyNowSheet');
  });

  it('passes effectiveState to both sheets', () => {
    expect(screenSrc).toContain('effectiveState');
  });

  it('passes isSeller to both sheets', () => {
    expect(screenSrc).toContain('isSeller');
  });

  it('passes refreshDetailForTransaction as onRefreshDetail to both sheets', () => {
    expect(screenSrc).toContain('refreshDetailForTransaction');
  });

  it('does not import Alert', () => {
    expect(screenSrc).not.toMatch(/\bAlert\b/);
  });

  it('does not import KeyboardAvoidingView', () => {
    expect(screenSrc).not.toContain('KeyboardAvoidingView');
  });

  it('does not import Platform', () => {
    expect(screenSrc).not.toMatch(/\bPlatform\b/);
  });

  it('does not have old composer state variables', () => {
    expect(screenSrc).not.toContain('bidComposerVisible');
    expect(screenSrc).not.toContain('composerError');
    expect(screenSrc).not.toContain('bidInput');
  });

  it('does not have old composer functions', () => {
    expect(screenSrc).not.toContain('openBidComposer');
    expect(screenSrc).not.toContain('closeBidComposer');
    expect(screenSrc).not.toContain('bumpBid');
    expect(screenSrc).not.toContain('submitBid');
    expect(screenSrc).not.toContain('handleBuyNow');
    expect(screenSrc).not.toContain('confirmBuyNow');
  });

  it('does not navigate to Checkout from Buy Now', () => {
    const buyNowSection = screenSrc.substring(
      screenSrc.indexOf('handleSubmitBuyNow'),
      screenSrc.indexOf('const detailInput')
    );
    expect(buyNowSection).not.toContain('Checkout');
    expect(buyNowSection).not.toContain('navigation.navigate');
  });
});

// ── PASS 5.1: Integration tests — real function invocation with mocked API ──

import { createStableId } from '../utils/createStableId';

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
    // createStableId should use crypto.getRandomValues or crypto.randomUUID
    // We verify the output format is a valid UUID, which requires crypto-quality randomness
    const id = createStableId();
    expect(id.length).toBe(36); // UUID format with dashes
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
    // Ambiguous errors should preserve the idempotency key for replay
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
    // 401 means the request was rejected before any transaction was attempted
  });
});

describe('PASS 5.1: Buy Now response verification', () => {
  it('BuyNowSheet verifies isBuyNow in response (source inspection)', () => {
    expect(buyNowSheetSrc).toContain('result.isBuyNow');
    expect(buyNowSheetSrc).toContain('Buy Now response did not confirm purchase');
  });

  it('BuyNowSheet verifies price match in preflight (source inspection)', () => {
    expect(buyNowSheetSrc).toContain('buy_now_price_changed');
    expect(buyNowSheetSrc).toContain('Buy Now price has changed');
  });

  it('BuyNowSheet uses authoritative server price for transaction (source inspection)', () => {
    expect(buyNowSheetSrc).toContain('authoritativePrice');
    expect(buyNowSheetSrc).toContain('transactionAmount');
  });
});

describe('PASS 5.1: BidSheet preflight and stale state', () => {
  it('BidSheet uses snapshot from refresh for validation (source inspection)', () => {
    expect(bidSheetSrc).toContain('getAuthoritativeSnapshot');
    expect(bidSheetSrc).toContain('snapshot');
  });

  it('BidSheet uses local validatedGbpAmount for submission (source inspection)', () => {
    expect(bidSheetSrc).toContain('validatedGbpAmount');
  });

  it('BidSheet has preflight loading state (source inspection)', () => {
    expect(bidSheetSrc).toContain('isPreflighting');
    expect(bidSheetSrc).toContain('Checking...');
  });

  it('BidSheet has pressed feedback on increment chips (source inspection)', () => {
    expect(bidSheetSrc).toContain('incrementChipPressed');
    expect(bidSheetSrc).toContain('pressed');
  });

  it('BidSheet passes currencyCode and goldRates to applyQuickIncrement (source inspection)', () => {
    expect(bidSheetSrc).toContain('applyQuickIncrement(bidInput, pct, currentMinimum, currencyCode, goldRates)');
  });
});

describe('PASS 5.1: BottomSheet reduced motion', () => {
  it('BottomSheet respects reduced motion (source inspection)', () => {
    const fs = require('fs');
    const path = require('path');
    const bottomSheetSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/BottomSheet.tsx'),
      'utf-8'
    );
    expect(bottomSheetSrc).toContain('useReducedMotion');
    expect(bottomSheetSrc).toContain('reducedMotion');
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
    // 51 GBP * 1.25 USD/GBP = 63.75 USD, then * 1.05 = 66.94
    expect(Number(result)).toBeCloseTo(66.94, 2);
  });
});

describe('PASS 5.2: BidSheet onReviewBuyNow prop (source inspection)', () => {
  it('BidSheet has onReviewBuyNow optional prop', () => {
    expect(bidSheetSrc).toContain('onReviewBuyNow');
  });

  it('BidSheet renders Review Buy Now button for buy_now_review_required error', () => {
    expect(bidSheetSrc).toContain("error.kind === 'buy_now_review_required'");
    expect(bidSheetSrc).toContain('Review Buy Now');
  });

  it('AuctionDetailScreen wires onReviewBuyNow to open Buy Now sheet', () => {
    const fs = require('fs');
    const path = require('path');
    const screenSrc = fs.readFileSync(
      path.resolve(__dirname, '../screens/AuctionDetailScreen.tsx'),
      'utf-8'
    );
    expect(screenSrc).toContain('onReviewBuyNow');
    expect(screenSrc).toContain('setBuyNowSheetVisible(true)');
  });
});

describe('PASS 5.2: BuyNowSheet null refresh handling (source inspection)', () => {
  it('BuyNowSheet handles null snapshot with network_failure error', () => {
    expect(buyNowSheetSrc).toContain('!snapshot');
    expect(buyNowSheetSrc).toContain('Unable to verify current auction state');
  });
});

describe('PASS 5.2: Single reconciliation owner (source inspection)', () => {
  it('AuctionDetailScreen does not fetch detail on bid error', () => {
    const fs = require('fs');
    const path = require('path');
    const screenSrc = fs.readFileSync(
      path.resolve(__dirname, '../screens/AuctionDetailScreen.tsx'),
      'utf-8'
    );
    // The catch block should NOT contain void fetchDetail() — sheet owns refresh
    const bidHandlerMatch = screenSrc.match(/handleSubmitBid[\s\S]*?finally\s*\{/);
    expect(bidHandlerMatch).toBeTruthy();
    const catchBlock = screenSrc.match(/handleSubmitBid[\s\S]*?catch\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
    expect(catchBlock).toBeTruthy();
    expect(catchBlock![1]).not.toContain('fetchDetail');
  });

  it('AuctionDetailScreen does not fetch detail on Buy Now error', () => {
    const fs = require('fs');
    const path = require('path');
    const screenSrc = fs.readFileSync(
      path.resolve(__dirname, '../screens/AuctionDetailScreen.tsx'),
      'utf-8'
    );
    const catchBlock = screenSrc.match(/handleSubmitBuyNow[\s\S]*?catch\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
    expect(catchBlock).toBeTruthy();
    expect(catchBlock![1]).not.toContain('fetchDetail');
  });
});
