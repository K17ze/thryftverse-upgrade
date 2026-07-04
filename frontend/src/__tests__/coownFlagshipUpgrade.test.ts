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
      // The old code pushed a fake "other_holders" row with remaining units
      expect(src).not.toContain("id: 'other_holders'");
      expect(src).not.toMatch(/other holders.*\$\{/);
    });

    it('AssetDetailScreen shows aggregate holder count truthfully', () => {
      const src = readSrc('screens/AssetDetailScreen.tsx');
      expect(src).toContain('Total holders');
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
      expect(src).toContain('not available');
    });
  });

  // ── 5. New Co-Own components exist ──
  describe('purpose-built Co-Own components', () => {
    it('CoOwnFeaturedHero component exists', () => {
      const src = readSrc('components/coown/CoOwnFeaturedHero.tsx');
      expect(src).toContain('export function CoOwnFeaturedHero');
      expect(src).toContain('CachedImage');
      expect(src).toContain('allocationBar');
    });

    it('CoOwnDiscoveryCard component exists', () => {
      const src = readSrc('components/coown/CoOwnDiscoveryCard.tsx');
      expect(src).toContain('export function CoOwnDiscoveryCard');
      expect(src).toContain('CachedImage');
      expect(src).toContain('allocationBar');
    });

    it('coown index exports both components', () => {
      const src = readSrc('components/coown/index.ts');
      expect(src).toContain('CoOwnFeaturedHero');
      expect(src).toContain('CoOwnDiscoveryCard');
    });
  });

  // ── 6. Hub uses media-first discovery ──
  describe('hub media-first discovery', () => {
    it('SyndicateHubScreen uses CoOwnFeaturedHero', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('CoOwnFeaturedHero');
    });

    it('SyndicateHubScreen uses CoOwnDiscoveryCard', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('CoOwnDiscoveryCard');
    });

    it('SyndicateHubScreen does not use MetricGrid', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).not.toContain('MetricGrid');
    });

    it('SyndicateHubScreen has editorial header with 30pt title', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('fontSize: 30');
    });

    it('SyndicateHubScreen has search', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('Search Co-Own');
    });

    it('SyndicateHubScreen has education module', () => {
      const src = readSrc('screens/SyndicateHubScreen.tsx');
      expect(src).toContain('How Co-Own works');
    });
  });

  // ── 7. TradeScreen has product identity and review flow ──
  describe('trade screen upgrade', () => {
    it('TradeScreen has product identity card', () => {
      const src = readSrc('screens/TradeScreen.tsx');
      expect(src).toContain('productCard');
      expect(src).toContain('CachedImage');
    });

    it('TradeScreen shows available/sellable units', () => {
      const src = readSrc('screens/TradeScreen.tsx');
      expect(src).toContain('Available units');
      expect(src).toContain('Your units');
    });

    it('TradeScreen uses Review order button', () => {
      const src = readSrc('screens/TradeScreen.tsx');
      expect(src).toContain('Review order');
      expect(src).not.toContain('Buy Units');
    });

    it('TradeConfirmScreen shows order type', () => {
      const src = readSrc('screens/TradeConfirmScreen.tsx');
      expect(src).toContain('Order type');
      expect(src).toContain('Limit');
      expect(src).toContain('Market');
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

    it('CreateSyndicateScreen has stage indicator', () => {
      const src = readSrc('screens/CreateSyndicateScreen.tsx');
      expect(src).toContain('stageIndicator');
      expect(src).toContain('stageDot');
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
      expect(src).toContain('ISSUANCE SUMMARY');
      expect(src).toContain('Total value');
    });
  });

  // ── 9. Portfolio and activity surfaces ──
  describe('portfolio and activity upgrade', () => {
    it('PortfolioScreen uses CoOwnDiscoveryCard', () => {
      const src = readSrc('screens/PortfolioScreen.tsx');
      expect(src).toContain('CoOwnDiscoveryCard');
    });

    it('PortfolioScreen does not use MetricGrid', () => {
      const src = readSrc('screens/PortfolioScreen.tsx');
      expect(src).not.toContain('MetricGrid');
    });

    it('PortfolioScreen has portfolio summary card', () => {
      const src = readSrc('screens/PortfolioScreen.tsx');
      expect(src).toContain('PORTFOLIO VALUE');
      expect(src).toContain('summaryCard');
    });

    it('PortfolioScreen has pull-to-refresh', () => {
      const src = readSrc('screens/PortfolioScreen.tsx');
      expect(src).toContain('RefreshControl');
    });

    it('SyndicateOrderHistoryScreen has editorial header', () => {
      const src = readSrc('screens/SyndicateOrderHistoryScreen.tsx');
      expect(src).toContain('headerTitle');
      expect(src).toContain('Activity');
    });
  });

  // ── 10. Ledger and leaderboard ──
  describe('ledger and leaderboard upgrade', () => {
    it('MarketLedgerScreen does not use MetricGrid', () => {
      const src = readSrc('screens/MarketLedgerScreen.tsx');
      expect(src).not.toContain('MetricGrid');
    });

    it('MarketLedgerScreen has editorial header', () => {
      const src = readSrc('screens/MarketLedgerScreen.tsx');
      expect(src).toContain('headerTitle');
    });

    it('MarketLedgerScreen has summary card', () => {
      const src = readSrc('screens/MarketLedgerScreen.tsx');
      expect(src).toContain('summaryCard');
    });

    it('AssetLeaderboardScreen has editorial header', () => {
      const src = readSrc('screens/AssetLeaderboardScreen.tsx');
      expect(src).toContain('headerTitle');
      expect(src).toContain('Leaderboards');
    });

    it('AssetLeaderboardScreen has skeleton loading', () => {
      const src = readSrc('screens/AssetLeaderboardScreen.tsx');
      expect(src).toContain('skeletonCard');
      expect(src).toContain('skeletonRow');
    });

    it('AssetLeaderboardScreen has pull-to-refresh', () => {
      const src = readSrc('screens/AssetLeaderboardScreen.tsx');
      expect(src).toContain('RefreshControl');
    });
  });
});
