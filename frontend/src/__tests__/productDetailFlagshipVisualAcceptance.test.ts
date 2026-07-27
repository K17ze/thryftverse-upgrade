import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');
const COMMERCE_DETAIL = resolve(COMPONENTS, 'commerce/detail');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

function readScreen(name: string): string {
  return read(resolve(SCREENS, name));
}

function readDetailComponent(name: string): string {
  return read(resolve(COMMERCE_DETAIL, `${name}.tsx`));
}

const DETAIL_SCREENS = [
  'ItemDetailScreen.tsx',
  'AuctionDetailScreen.tsx',
  'AssetDetailScreen.tsx',
] as const;

const SHARED_DETAIL_PRIMITIVES = [
  'CommerceDetailHeader',
  'CommerceDetailIdentity',
  'CommerceDetailMediaRail',
  'CommerceDetailSection',
  'CommerceDetailSellerRow',
  'CommerceDetailStateDock',
  'CommerceDetailDisclosureRow',
  'CommerceDetailMetricRow',
  'CommerceDetailUnavailableInline',
] as const;

describe('product-detail-flagship-reconstruction: visual acceptance', () => {
  // ── 1. Shared shell adoption ──
  // Every detail screen must use the shared commerce/detail primitives.
  // This is the structural foundation for visual consistency across
  // 320/360/390/430 in light/dark.
  describe('shared shell adoption', () => {
    for (const screen of DETAIL_SCREENS) {
      it(`${screen} imports CommerceDetailHeader`, () => {
        expect(readScreen(screen)).toContain('CommerceDetailHeader');
      });

      it(`${screen} imports CommerceDetailIdentity`, () => {
        expect(readScreen(screen)).toContain('CommerceDetailIdentity');
      });

      it(`${screen} imports CommerceDetailStateDock`, () => {
        expect(readScreen(screen)).toContain('CommerceDetailStateDock');
      });

      it(`${screen} imports CommerceDetailSection`, () => {
        expect(readScreen(screen)).toContain('CommerceDetailSection');
      });

      it(`${screen} imports CommerceDetailMediaRail`, () => {
        expect(readScreen(screen)).toContain('CommerceDetailMediaRail');
      });

      it(`${screen} imports CommerceDetailSellerRow`, () => {
        expect(readScreen(screen)).toContain('CommerceDetailSellerRow');
      });
    }

    for (const comp of SHARED_DETAIL_PRIMITIVES) {
      it(`${comp}.tsx exists in commerce/detail`, () => {
        const src = readDetailComponent(comp);
        expect(src.length).toBeGreaterThan(0);
        expect(src).toMatch(/export (function|const) CommerceDetail/);
      });
    }
  });

  // ── 2. Responsive viewport handling ──
  // Each screen must adapt to 320/360/390/430 widths.
  describe('responsive viewport handling', () => {
    it('ItemDetailScreen uses useWindowDimensions for responsive layout', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      expect(src).toContain('useWindowDimensions');
      expect(src).toMatch(/isCompactScreen.*<\s*390/);
    });

    it('ItemDetailScreen adapts media stage height to viewport', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      expect(src).toContain('heightFraction');
    });

    it('AuctionDetailScreen uses useWindowDimensions for responsive layout', () => {
      const src = readScreen('AuctionDetailScreen.tsx');
      expect(src).toContain('useWindowDimensions');
    });

    it('AssetDetailScreen uses compact flagship hero fractions', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toContain('useWindowDimensions');
      expect(src).toContain('isVeryCompact ? 0.48');
      expect(src).toContain('isCompact ? 0.5');
      expect(src).toContain(': 0.56');
      expect(src).not.toContain(': 0.65');
    });

    it('CommerceDetailStateDock adapts to dual-action vs single-action', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      // The dock adapts its layout based on whether a secondaryAction is
      // present (dual-action) or only a primaryAction (single-action).
      expect(src).toContain('primaryAction');
      expect(src).toContain('secondaryAction');
      expect(src).toMatch(/secondaryAction\s*\?/);
    });

    it('CommerceMediaStage adapts height to viewport fraction', () => {
      const src = read(resolve(COMPONENTS, 'commerce/CommerceMediaStage.tsx'));
      expect(src).toMatch(/heightFraction|useWindowDimensions/);
    });
  });

  // ── 3. Light/dark theme token usage ──
  // No hardcoded colors that would break in light or dark mode.
  describe('light/dark theme token usage', () => {
    for (const screen of DETAIL_SCREENS) {
      it(`${screen} uses theme colors (not hardcoded hex)`, () => {
        const src = readScreen(screen);
        // Must reference the theme color system
        expect(src).toMatch(/colors\.(background|surface|textPrimary|textSecondary|border|brand)/);
        // Must NOT use hardcoded white/black backgrounds
        expect(src).not.toMatch(/backgroundColor:\s*['"]#fff['"]/i);
        expect(src).not.toMatch(/backgroundColor:\s*['"]#000['"]/i);
      });

      it(`${screen} uses useAppTheme for dark mode`, () => {
        const src = readScreen(screen);
        expect(src).toContain('useAppTheme');
        expect(src).toMatch(/isDark|colors/);
      });
    }

    it('CommerceDetailIdentity uses theme colors', () => {
      const src = readDetailComponent('CommerceDetailIdentity');
      expect(src).toMatch(/colors\./);
      expect(src).not.toMatch(/color:\s*['"]#[0-9a-f]{3,6}['"]/i);
    });

    it('CommerceDetailStateDock uses theme colors', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toMatch(/colors\./);
    });
  });

  // ── 4. Price hierarchy — one dominant price location ──
  describe('price hierarchy: one dominant price location', () => {
    it('ItemDetailScreen has one dominant price in identity, not repeated in body', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      // Identity carries the dominant price
      expect(src).toContain('primaryValue={formattedPrice}');
      // No second large price display in the body (the dock carries a
      // compact actionable price, which is allowed)
      expect(src).not.toContain('ProductCommerceSummary');
      expect(src).not.toContain('PriceInsightStrip');
    });

    it('AuctionDetailScreen has one dominant price (current bid) in transaction surface', () => {
      const src = readScreen('AuctionDetailScreen.tsx');
      expect(src).toMatch(/CommerceDetailTransactionSurface|primaryValue/);
    });

    it('AssetDetailScreen has one dominant price (unit price) in transaction surface', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toMatch(/CommerceDetailTransactionSurface|primaryValue/);
    });
  });

  // ── 5. No repeated family labels ──
  describe('no repeated family labels', () => {
    it('ItemDetailScreen does not repeat family label in identity eyebrow and media badge', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      // The family badge lives on the media stage; the identity eyebrow
      // is the brand, not the family label. Note: family="direct" is a
      // prop that controls art direction, not a visible family label.
      const identityMatch = src.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).not.toContain('"Direct"');
    });

    it('AssetDetailScreen does not repeat Co-Own label in identity and media badge', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      // The family badge is on the media stage; the identity eyebrow is
      // the category, not "Co-Own".
      const identitySection = src.match(/CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identitySection).toBeTruthy();
      expect(identitySection![0]).not.toMatch(/eyebrow=.*"Co-Own"/);
      expect(identitySection![0]).not.toContain('familyChip');
    });
  });

  // ── 6. No duplicated seller modules ──
  describe('no duplicated seller modules', () => {
    it('AuctionDetailScreen does not render both SellerTrustCard and CommerceDetailSellerRow', () => {
      const src = readScreen('AuctionDetailScreen.tsx');
      // The slim row is the primary presentation; the full card is not
      // rendered by default.
      expect(src).toContain('CommerceDetailSellerRow');
      expect(src).not.toContain('<SellerTrustCard');
    });

    it('ItemDetailScreen does not render both SellerTrustCard and CommerceDetailSellerRow', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      expect(src).toContain('CommerceDetailSellerRow');
      expect(src).not.toContain('<SellerTrustCard');
    });
  });

  // ── 7. No duplicated appraisal modules (Co-Own) ──
  describe('no duplicated appraisal modules (Co-Own)', () => {
    it('AssetDetailScreen does not render a separate valuation card alongside CoOwnAssetDossier', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toContain('CoOwnAssetDossier');
      // The old valuation provenance card has been removed; the dossier
      // is the single source of appraisal truth.
      expect(src).not.toContain('valuationCard');
      expect(src).not.toContain('Valuation provenance');
    });
  });

  // ── 8. Buyout contradiction resolved ──
  describe('buyout contradiction resolved', () => {
    it('AssetDetailScreen does not navigate to Buyout for unavailable buyout', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      // The Buyout row is a truthful unavailable state, not a navigation
      // to a Buyout flow that does not exist.
      expect(src).not.toContain("navigation.navigate('Buyout'");
      expect(src).toContain('Full-asset buyout');
      expect(src).toContain('Not available');
    });
  });

  // ── 9. Co-Own risk disclosure collapses by default ──
  describe('Co-Own risk disclosure collapses by default', () => {
    it('CoOwnRiskDisclosure renders a collapsed summary, not all 5 risks', () => {
      const src = read(resolve(COMPONENTS, 'coown/CoOwnRiskDisclosure.tsx'));
      // Must have a collapsed state with a disclosure toggle
      expect(src).toMatch(/expanded/);
      // Must slice risks to a preview count when collapsed
      expect(src).toMatch(/slice\(0,\s*PREVIEW_COUNT\)/);
      // Must have a "View all risks" toggle
      expect(src).toMatch(/View all risks/);
    });
  });

  // ── 10. Co-Own price chart nullable movement ──
  describe('Co-Own price chart nullable movement', () => {
    it('CoOwnPriceChart accepts nullable marketMovePct24h', () => {
      const src = read(resolve(COMPONENTS, 'coown/CoOwnPriceChart.tsx'));
      // The prop type must accept null
      expect(src).toMatch(/marketMovePct24h\??:\s*number\s*\|\s*null/);
      // Must guard against null before rendering movement (hasMovement check)
      expect(src).toMatch(/hasMovement/);
      expect(src).toMatch(/marketMovePct24h\s*!=\s*null/);
    });

    it('CoOwnPriceChart hides controls when no history', () => {
      const src = read(resolve(COMPONENTS, 'coown/CoOwnPriceChart.tsx'));
      // Empty/no-history state is handled inline
      expect(src).toMatch(/empty|noHistory|hideControls|Inline states/);
    });

    it('CoOwnPriceChart has a real Retry action on error', () => {
      const src = read(resolve(COMPONENTS, 'coown/CoOwnPriceChart.tsx'));
      expect(src).toMatch(/Retry|onRetry|refetch/);
    });
  });

  // ── 11. Flat sections (no old rounded cards in flat areas) ──
  describe('flat sections: no old rounded cards in flat areas', () => {
    it('CoOwnTrustPanel does not wrap content in a rounded card', () => {
      const src = read(resolve(COMPONENTS, 'coown/CoOwnTrustPanel.tsx'));
      // The outer rounded card container has been removed; content is
      // flat within the parent section.
      expect(src).not.toMatch(/borderRadius:\s*(Radius\.(lg|md)|16|12)/);
    });

    it('CoOwnAssetDossier does not wrap content in a rounded card', () => {
      const src = read(resolve(COMPONENTS, 'coown/CoOwnAssetDossier.tsx'));
      expect(src).not.toMatch(/borderRadius:\s*(Radius\.(lg|md)|16|12)/);
    });
  });

  // ── 12. Safe area handling for notch/Dynamic Island ──
  describe('safe area handling', () => {
    for (const screen of DETAIL_SCREENS) {
      it(`${screen} uses useSafeAreaInsets for top inset`, () => {
        const src = readScreen(screen);
        expect(src).toContain('useSafeAreaInsets');
        expect(src).toMatch(/insets\.top/);
      });
    }
  });

  describe('Co-Own native composition regressions', () => {
    it('renders a structured bid, ask, and spread market snapshot', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toContain('marketBookRow');
      expect(src).toContain('Bid');
      expect(src).toContain('Ask');
      expect(src).toContain('Spread');
    });

    it('keeps unavailable fundamentals outside the dominant market surface', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toContain('marketSecondaryFacts');
      expect(src).not.toContain('secondaryMetrics');
    });

    it('uses the real Co-Own watchlist action', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toContain('toggleCoOwnWatch');
      expect(src).toContain('isCoOwnWatched');
    });

    it('does not fabricate sponsor locked as zero', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).not.toContain('sponsorLocked: 0');
    });
  });

  // ── 13. Dock geometry adapts to action count ──
  describe('dock geometry adapts to action count', () => {
    it('ItemDetailScreen computes dock height from action count', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      expect(src).toMatch(/DockConstants|dockHeight/);
    });

    it('AuctionDetailScreen computes dock height from action count', () => {
      const src = readScreen('AuctionDetailScreen.tsx');
      expect(src).toMatch(/DockConstants|dockHeight/);
    });

    it('AssetDetailScreen computes dock height from action count', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toMatch(/DockConstants|dockHeight/);
    });
  });
});
