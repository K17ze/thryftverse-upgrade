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
    bidCount: 5,
    viewerState: 'not_participating',
    isWatched: false,
    cancelledAt: null,
    settledAt: null,
    winnerBidderId: null,
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

  it('formats non-viewer bid with username', () => {
    const bid = {
      id: 2,
      bidderUsername: 'otheruser',
      amountGbp: 90,
      createdAt: '2025-06-15T10:30:00Z',
      isViewer: false,
    };
    const row = formatBidActivityRow(bid, 1, formatFromFiat);
    expect(row.isViewer).toBe(false);
    expect(row.bidderLabel).toBe('@otheruser');
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

// ── Static guardrails ──

describe('PASS 4.12: Static guardrails (source inspection)', () => {
  const fs = require('fs');
  const path = require('path');
  const screenSrc = fs.readFileSync(
    path.resolve(__dirname, '../screens/AuctionDetailScreen.tsx'),
    'utf-8'
  );
  const logicSrc = fs.readFileSync(
    path.resolve(__dirname, '../utils/auctionDetailLogic.ts'),
    'utf-8'
  );

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

  it('has bid composer with minimum next bid', () => {
    expect(screenSrc).toContain('composerBidInfo');
    expect(screenSrc).toContain('minimumNextBidGbp');
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
    expect(screenSrc).not.toMatch(/winning bid/i);
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

  it('Buy Now requires confirmation via Alert.alert', () => {
    expect(screenSrc).toContain('Alert.alert');
    expect(screenSrc).toContain('confirmBuyNow');
  });

  it('does not navigate to Checkout for viewResult in sticky dock', () => {
    const dockStart = screenSrc.indexOf('Sticky bottom action dock');
    const dockEnd = screenSrc.indexOf('sellerDockInfo');
    const dockSection = screenSrc.substring(dockStart, dockEnd);
    expect(dockSection).not.toContain('Checkout');
  });

  // ── Correction pass 2 guardrails ──

  it('has KeyboardAvoidingView in bid composer', () => {
    expect(screenSrc).toContain('KeyboardAvoidingView');
    expect(screenSrc).toContain('Platform.OS');
  });

  it('touch targets are at least 44pt (back and watch buttons)', () => {
    expect(screenSrc).toMatch(/backBtnFloating[\s\S]*?width:\s*44/);
    expect(screenSrc).toMatch(/watchBtnFloating[\s\S]*?width:\s*44/);
  });

  it('seller name has numberOfLines to prevent overflow', () => {
    expect(screenSrc).toMatch(/sellerName[\s\S]*?numberOfLines/);
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
