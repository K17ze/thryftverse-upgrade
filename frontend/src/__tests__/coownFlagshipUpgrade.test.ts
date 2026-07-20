import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('COOWN-FLAGSHIP: Co-Own department flagship upgrade', () => {
  // ── 1. SyndicateScreen retired ──
  describe('SyndicateScreen retirement', () => {
    it('SyndicateScreen.tsx no longer exists', () => {
      expect(() => readSrc('screens/SyndicateScreen.tsx')).toThrow();
    });
  });

  // ── 2. No sliced UUID fallbacks ──
  describe('no sliced UUID fallbacks', () => {
    it('TradeConfirmScreen does not slice assetId for title', () => {
      const src = readSrc('screens/TradeConfirmScreen.tsx');
      expect(src).not.toMatch(/assetId\.slice\(-6\)/);
    });

    it('SyndicateOrderHistoryScreen does not slice referenceId for title', () => {
      const src = readSrc('screens/SyndicateOrderHistoryScreen.tsx');
      expect(src).not.toMatch(/referenceId\.slice\(-6\)/);
    });

    it('SyndicateHubScreen does not slice issuerId for handle', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).not.toMatch(/issuerId\.slice\(0,\s*12\)/);
    });
  });

  // ── 3. No fabricated "other holders" by subtraction ──
  describe('no fabricated holder rows', () => {
    it('AssetDetailScreen does not fabricate other holders by subtraction', () => {
      const src = readSrc('screens/AssetDetailScreen.tsx');
      expect(src).not.toContain("id: 'other_holders'");
      expect(src).not.toMatch(/other holders.*\$\{/);
    });

    it('AssetDetailScreen shows aggregate holder count truthfully', () => {
      const src = readSrc('screens/AssetDetailScreen.tsx');
      expect(src).toContain('asset.holders');
    });
  });

  // ── 4. BuyoutScreen honest unavailable state ──
  describe('buyout truth', () => {
    it('BuyoutScreen does not hardcode 8% premium', () => {
      const src = readSrc('screens/BuyoutScreen.tsx');
      expect(src).not.toContain('1.08');
      expect(src).not.toContain('8%');
    });

    it('BuyoutScreen does not hardcode 24h expiry', () => {
      const src = readSrc('screens/BuyoutScreen.tsx');
      expect(src).not.toContain('expiresInHours: 24');
      expect(src).not.toContain('24h');
    });

    it('BuyoutScreen shows unavailable state', () => {
      const src = readSrc('screens/BuyoutScreen.tsx');
      // Asset-level exit is operator-initiated per rights, not a self-service
      // buyout flow the backend doesn't support — the screen says so honestly.
      expect(src).toContain('Asset-level exit');
      expect(src).toContain('initiated by the vehicle operator');
    });
  });

  // ── 5. New Co-Own components exist ──
  describe('purpose-built Co-Own components', () => {
    it('CoOwnFeaturedHero component exists', () => {
      const src = readSrc('components/coown/CoOwnFeaturedHero.tsx');
      expect(src).toContain('export function CoOwnFeaturedHero');
      expect(src).toContain('CachedImage');
    });

    it('CoOwnDiscoveryCard component exists', () => {
      const src = readSrc('components/coown/CoOwnDiscoveryCard.tsx');
      expect(src).toContain('export function CoOwnDiscoveryCard');
      expect(src).toContain('CachedImage');
    });

    it('coown index exports both components', () => {
      const src = readSrc('components/coown/index.ts');
      expect(src).toContain('CoOwnFeaturedHero');
      expect(src).toContain('CoOwnDiscoveryCard');
    });
  });

  // ── 6. Hub uses media-first discovery ──
  describe('hub media-first discovery', () => {
    it('SyndicateHubScreen uses CoOwn component system', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain("from '../components/coown'");
    });

    it('SyndicateHubScreen does not use MetricGrid', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).not.toContain('MetricGrid');
    });

    it('SyndicateHubScreen uses CoOwnMarketHeader', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('CoOwnMarketHeader');
    });

    it('SyndicateHubScreen has search', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('Search');
    });

    it('SyndicateHubScreen has education module', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('CoOwnEducationCard');
    });

    it('SyndicateHubScreen uses a looping market highlights carousel', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      const carousel = readSrc('components/coown/CoOwnMarketHighlightsCarousel.tsx');
      expect(src).toContain('CoOwnMarketHighlightsCarousel');
      expect(carousel).toContain('snapToInterval');
      expect(carousel).toContain('scrollToIndex');
      expect(carousel).toContain('onMomentumScrollEnd');
    });

    it('SyndicateHubScreen restores compact positions inline', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('CoOwnCompactPositionCard');
      expect(src).toContain('YOUR PORTFOLIO');
      expect(src).toContain("navigation.navigate('Portfolio')");
    });

    it('SyndicateHubScreen keeps market tabs sticky and listing controls inline', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('stickyHeaderIndices');
      expect(src).toContain('Market search and sorting');
      expect(src).not.toContain('CoOwnFeaturedAsset');
    });
  });

  // ── 7. TradeScreen has product identity and review flow ──
  describe('trade screen upgrade', () => {
    it('TradeScreen uses CoOwnTradeComposer', () => {
      const src = readSrc('screens/TradeScreen.tsx');
      expect(src).toContain('CoOwnTradeComposer');
    });

    it('TradeScreen uses CoOwnMarketHeader', () => {
      const src = readSrc('screens/TradeScreen.tsx');
      expect(src).toContain('CoOwnMarketHeader');
    });

    it('TradeScreen uses Review order button', () => {
      const src = readSrc('screens/TradeScreen.tsx');
      expect(src).toContain('Review order');
      expect(src).not.toContain('Buy Units');
    });

    it('TradeConfirmScreen uses CoOwnTradeReceipt', () => {
      const src = readSrc('screens/TradeConfirmScreen.tsx');
      expect(src).toContain('CoOwnTradeReceipt');
    });
  });

  // ── 8. CreateSyndicateScreen staged flow ──
  describe('issuer creation studio', () => {
    it('CreateSyndicateScreen has three stages', () => {
      const src = readSrc('screens/CreateSyndicateScreen.tsx');
      expect(src).toContain("'select'");
      expect(src).toContain("'configure'");
      expect(src).toContain("'review'");
    });

    it('CreateSyndicateScreen uses CoOwnIssueStudioStep', () => {
      const src = readSrc('screens/CreateSyndicateScreen.tsx');
      expect(src).toContain('CoOwnIssueStudioStep');
    });

    it('CreateSyndicateScreen has unit presets', () => {
      const src = readSrc('screens/CreateSyndicateScreen.tsx');
      expect(src).toContain('unitPreset');
      expect(src).toContain('[5, 10, 20]');
    });

    it('CreateSyndicateScreen MAX_UNITS is documented as backend constraint', () => {
      const src = readSrc('screens/CreateSyndicateScreen.tsx');
      expect(src).toContain('MAX_UNITS');
      expect(src).toContain('backend');
    });

    it('CreateSyndicateScreen has review summary', () => {
      const src = readSrc('screens/CreateSyndicateScreen.tsx');
      expect(src).toContain('Issuance summary');
      expect(src).toContain('Total value');
    });
  });

  // ── 9. Portfolio and activity surfaces ──
  describe('portfolio and activity upgrade', () => {
    it('PortfolioScreen uses CoOwn component system', () => {
      const src = readSrc('screens/PortfolioScreen.tsx');
      expect(src).toContain("from '../components/coown'");
    });

    it('PortfolioScreen does not use MetricGrid', () => {
      const src = readSrc('screens/PortfolioScreen.tsx');
      expect(src).not.toContain('MetricGrid');
    });

    it('PortfolioScreen has pull-to-refresh', () => {
      const src = readSrc('screens/PortfolioScreen.tsx');
      expect(src).toContain('RefreshControl');
    });

    it('SyndicateOrderHistoryScreen uses CoOwnMarketHeader', () => {
      const src = readSrc('screens/SyndicateOrderHistoryScreen.tsx');
      expect(src).toContain('CoOwnMarketHeader');
      expect(src).toContain('Activity');
    });
  });

  // ── 10. Ledger and leaderboard ──
  describe('ledger and leaderboard upgrade', () => {
    it('MarketLedgerScreen does not use MetricGrid', () => {
      const src = readSrc('screens/MarketLedgerScreen.tsx');
      expect(src).not.toContain('MetricGrid');
    });

    it('MarketLedgerScreen uses CoOwnMarketHeader', () => {
      const src = readSrc('screens/MarketLedgerScreen.tsx');
      expect(src).toContain('CoOwnMarketHeader');
    });

    it('MarketLedgerScreen has summary card', () => {
      const src = readSrc('screens/MarketLedgerScreen.tsx');
      expect(src).toContain('summaryCard');
    });

    it('AssetLeaderboardScreen uses CoOwnMarketHeader', () => {
      const src = readSrc('screens/AssetLeaderboardScreen.tsx');
      expect(src).toContain('CoOwnMarketHeader');
      expect(src).toContain('Leaderboards');
    });

    it('AssetLeaderboardScreen uses CoOwnLeaderboardSkeleton', () => {
      const src = readSrc('screens/AssetLeaderboardScreen.tsx');
      expect(src).toContain('CoOwnLeaderboardSkeleton');
    });

    it('AssetLeaderboardScreen has pull-to-refresh', () => {
      const src = readSrc('screens/AssetLeaderboardScreen.tsx');
      expect(src).toContain('RefreshControl');
    });

    it('AssetLeaderboardScreen does not use speculative marketMovePct24h', () => {
      const src = readSrc('screens/AssetLeaderboardScreen.tsx');
      expect(src).not.toContain('marketMovePct24h');
    });
  });
});
