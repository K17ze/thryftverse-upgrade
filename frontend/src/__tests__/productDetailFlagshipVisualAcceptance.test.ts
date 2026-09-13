import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');
const HOOKS = resolve(__dirname, '../hooks');
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
  //
  // The screens were decomposed into orchestrators — each shared
  // primitive is now composed inside an extracted owner component. The
  // OWNER_LAYER map records where each primitive lives; null means the
  // orchestrator still references it directly. An array means "any of
  // these owner files" (OR).
  const OWNER_LAYER: Record<
    string,
    Record<'header' | 'identity' | 'stateDock' | 'section' | 'mediaRail' | 'seller', string | string[] | null>
  > = {
    'ItemDetailScreen.tsx': {
      // Owner layer: itemdetail/ItemDetailHeader owns the header,
      // CommerceIdentityBlock owns the identity, CommerceActionDock
      // wraps CommerceDetailStateDock.
      header: 'itemdetail/ItemDetailHeader.tsx',
      identity: 'commerce/detail/CommerceIdentityBlock.tsx',
      stateDock: 'commerce/detail/CommerceActionDock.tsx',
      section: null,
      mediaRail: null,
      seller: null,
    },
    'AuctionDetailScreen.tsx': {
      // Owner layer: hero owns identity + media rail, dock owns the
      // state dock, info sections own the section, seller section owns
      // the seller row.
      header: null,
      identity: 'auctiondetail/AuctionDetailHero.tsx',
      stateDock: 'auctiondetail/AuctionDetailDock.tsx',
      section: 'auctiondetail/AuctionDetailInfoSections.tsx',
      mediaRail: 'auctiondetail/AuctionDetailHero.tsx',
      seller: 'auctiondetail/AuctionDetailSellerSection.tsx',
    },
    'AssetDetailScreen.tsx': {
      // AssetDetailScreen was refactored earlier: identity/seller row
      // live in AssetDetailIdentity, the dock in AssetDetailDock, and
      // CommerceDetailSection in the extracted section components.
      header: null,
      identity: 'coown/asset-detail/AssetDetailIdentity.tsx',
      stateDock: 'coown/asset-detail/AssetDetailDock.tsx',
      section: [
        'coown/asset-detail/AssetOverviewSection.tsx',
        'coown/asset-detail/AssetMarketSection.tsx',
        'coown/asset-detail/AssetOwnershipSection.tsx',
      ],
      mediaRail: null,
      seller: 'coown/asset-detail/AssetDetailIdentity.tsx',
    },
  };

  function ownerSources(
    screen: string,
    key: 'header' | 'identity' | 'stateDock' | 'section' | 'mediaRail' | 'seller',
  ): string[] {
    const ref = OWNER_LAYER[screen][key];
    if (ref === null) return [readScreen(screen)];
    const paths = Array.isArray(ref) ? ref : [ref];
    return paths.map((p) => read(resolve(COMPONENTS, p)));
  }

  describe('shared shell adoption', () => {
    for (const screen of DETAIL_SCREENS) {
      it(`${screen} imports CommerceDetailHeader`, () => {
        expect(
          ownerSources(screen, 'header').some((s) => s.includes('CommerceDetailHeader')),
        ).toBe(true);
      });

      it(`${screen} imports CommerceDetailIdentity`, () => {
        expect(
          ownerSources(screen, 'identity').some((s) => s.includes('CommerceDetailIdentity')),
        ).toBe(true);
      });

      it(`${screen} imports CommerceDetailStateDock`, () => {
        expect(
          ownerSources(screen, 'stateDock').some((s) => s.includes('CommerceDetailStateDock')),
        ).toBe(true);
      });

      it(`${screen} imports CommerceDetailSection`, () => {
        expect(
          ownerSources(screen, 'section').some((s) => s.includes('CommerceDetailSection')),
        ).toBe(true);
      });

      it(`${screen} imports CommerceDetailMediaRail`, () => {
        expect(
          ownerSources(screen, 'mediaRail').some((s) => s.includes('CommerceDetailMediaRail')),
        ).toBe(true);
      });

      it(`${screen} imports CommerceDetailSellerRow or SellerInfoCard`, () => {
        // SellerInfoCard is the enriched canonical seller surface for
        // ItemDetailScreen; CommerceDetailSellerRow remains the slim row
        // for Auction/Asset detail. Either is acceptable.
        expect(
          ownerSources(screen, 'seller').some((s) => /CommerceDetailSellerRow|SellerInfoCard/.test(s)),
        ).toBe(true);
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
  // Each screen adapts to 320/360/390/430 widths via the centralized
  // useBreakpoint hook (hooks/useBreakpoint.ts).
  describe('responsive viewport handling', () => {
    it('ItemDetailScreen uses useBreakpoint for responsive layout', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      expect(src).toContain('useBreakpoint');
    });

    it('ItemDetailScreen adapts media stage height to viewport', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      expect(src).toContain('heightFraction');
    });

    it('AuctionDetailScreen uses useBreakpoint for responsive layout', () => {
      const src = readScreen('AuctionDetailScreen.tsx');
      expect(src).toContain('useBreakpoint');
    });

    it('AssetDetailScreen uses compact flagship hero fractions', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toContain('useBreakpoint');
      // Pillar 1 (v1.8): media height increased from 0.26-0.30 to
      // 0.38-0.42 to give the luxury asset visual dominance per
      // September 2026 Masterworks/Instagram/Pinterest PDP density
      // research. The identity block was rescaled to 20pt to compensate.
      expect(src).toContain('isVeryCompact ? 0.42');
      expect(src).toContain('isCompact ? 0.40');
      expect(src).toContain(': 0.38');
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
      // Identity carries the dominant price — the owner layer
      // (CommerceIdentityBlock) wires primaryValue to the identity.
      const identityBlock = read(resolve(COMPONENTS, 'commerce/detail/CommerceIdentityBlock.tsx'));
      expect(identityBlock).toContain('primaryValue={formattedPrice}');
      // No second large price display in the body (the dock carries a
      // compact actionable price, which is allowed). Kept on the
      // orchestrator: it must not re-inline a competing price surface.
      expect(src).not.toContain('ProductCommerceSummary');
      expect(src).not.toContain('PriceInsightStrip');
    });

    it('AuctionDetailScreen has one dominant price (current bid) in transaction surface', () => {
      // Owner layer: AuctionBidPanel composes the transaction surface.
      const bidPanel = read(resolve(COMPONENTS, 'auctiondetail/AuctionBidPanel.tsx'));
      expect(bidPanel).toMatch(/CommerceDetailTransactionSurface|primaryValue/);
    });

    it('AssetDetailScreen has one dominant price (unit price) in transaction surface', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      // The dominant price is rendered in the identity header as a
      // single priceHero number (dominantPriceValue). The transaction
      // surface with executable depth lives in AssetMarketSection.
      expect(src).toContain('dominantPriceValue');
      expect(src).toContain('formatCoOwnIze(dominantPriceValue)');
    });
  });

  // ── 5. No repeated family labels ──
  describe('no repeated family labels', () => {
    it('ItemDetailScreen does not repeat family label in identity eyebrow and media badge', () => {
      // The family badge lives on the media stage; the identity eyebrow
      // is the brand, not the family label. Note: family="direct" is a
      // prop that controls art direction, not a visible family label.
      // Owner layer: CommerceIdentityBlock composes the identity.
      const identityBlock = read(resolve(COMPONENTS, 'commerce/detail/CommerceIdentityBlock.tsx'));
      const identityMatch = identityBlock.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
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
      // rendered by default. Owner layer: AuctionDetailSellerSection
      // composes the row; the orchestrator must not re-inline the card.
      const sellerSection = read(resolve(COMPONENTS, 'auctiondetail/AuctionDetailSellerSection.tsx'));
      expect(sellerSection).toContain('CommerceDetailSellerRow');
      expect(sellerSection).not.toContain('<SellerTrustCard');
      expect(src).not.toContain('<SellerTrustCard');
    });

    it('ItemDetailScreen does not render both SellerTrustCard and CommerceDetailSellerRow', () => {
      const src = readScreen('ItemDetailScreen.tsx');
      // SellerInfoCard is the canonical enriched seller surface for
      // ItemDetailScreen; the slim CommerceDetailSellerRow is not used
      // here, and the legacy SellerTrustCard must not appear.
      expect(src).toContain('SellerInfoCard');
      expect(src).not.toContain('<SellerTrustCard');
    });
  });

  describe('no duplicated appraisal modules (Co-Own)', () => {
    it('AssetDetailScreen does not render a separate valuation card alongside due diligence', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toContain('AssetDueDiligence');
      // The old valuation provenance card has been removed; the dossier
      // is the single source of appraisal truth.
      expect(src).not.toContain('valuationCard');
      expect(src).not.toContain('Valuation provenance');
    });
  });

  // ── 8. Buyout contradiction resolved ──
  describe('buyout contradiction resolved', () => {
    it('AssetDetailScreen links to the real Buyout screen with an assetId', () => {
      // Buyout is a real screen (BuyoutScreen, registered in AppNavigator)
      // backed by real endpoints (GET/POST /co-own/assets/:assetId/buyout-offers,
      // POST /co-own/buyout-offers/:offerId/accept). The old "fake Buyout"
      // contradiction no longer exists; the entry point is now required so
      // holders can reach exit offers from the asset they own.
      const src = readScreen('AssetDetailScreen.tsx');
      const ownershipSection = read(resolve(COMPONENTS, 'coown/asset-detail/AssetOwnershipSection.tsx'));
      const buyoutWiring = src + ownershipSection;
      expect(buyoutWiring).toContain("navigate('Buyout'");
      expect(buyoutWiring).toContain('assetId');
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
        // AuctionDetailScreen was decomposed — the top-inset rail lives
        // in the owner layer (auctiondetail/AuctionDetailHero).
        const src = screen === 'AuctionDetailScreen.tsx'
          ? read(resolve(COMPONENTS, 'auctiondetail/AuctionDetailHero.tsx'))
          : readScreen(screen);
        expect(src).toContain('useSafeAreaInsets');
        expect(src).toMatch(/insets\.top/);
      });
    }
  });

  describe('Co-Own native composition regressions', () => {
    it('renders a structured bid, ask, and spread market snapshot', () => {
      // Bid/ask/CoOwnOrderBook moved to AssetMarketSection.tsx during
      // the AssetDetailScreen refactor.
      const marketSection = read(resolve(COMPONENTS, 'coown/asset-detail/AssetMarketSection.tsx'));
      expect(marketSection).toContain('CoOwnOrderBook');
      expect(marketSection).toContain('Bid');
      expect(marketSection).toContain('Ask');
      expect(marketSection).toContain('Spread');
    });

    it('keeps unavailable fundamentals outside the dominant market surface', () => {
      // trustFactualLine was replaced by trustBadges in AssetOverviewDetails
      // during the Wave 33 refactor. The market surface must not carry
      // secondaryMetrics.
      const overviewDetails = read(resolve(COMPONENTS, 'coown/asset-detail/AssetOverviewDetails.tsx'));
      const ownershipSection = read(resolve(COMPONENTS, 'coown/asset-detail/AssetOwnershipSection.tsx'));
      const marketSection = read(resolve(COMPONENTS, 'coown/asset-detail/AssetMarketSection.tsx'));
      expect(
        overviewDetails.includes('trustBadges')
        || overviewDetails.includes('trustFacts')
        || ownershipSection.includes('trustFacts'),
      ).toBe(true);
      expect(marketSection).not.toContain('secondaryMetrics');
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
      // Owner layer: itemDetailDerived computes dockHeight from
      // DockConstants based on the dual/single-action dock shape.
      const derived = read(resolve(HOOKS, 'itemDetail/itemDetailDerived.ts'));
      expect(derived).toMatch(/DockConstants|dockHeight/);
    });

    it('AuctionDetailScreen computes dock height from action count', () => {
      // Owner layer: useAuctionDetailPresentation computes dockHeight
      // from DockConstants.
      const presentation = read(resolve(HOOKS, 'auctiondetail/useAuctionDetailPresentation.ts'));
      expect(presentation).toMatch(/DockConstants|dockHeight/);
    });

    it('AssetDetailScreen computes dock height from action count', () => {
      const src = readScreen('AssetDetailScreen.tsx');
      expect(src).toMatch(/DockConstants|dockHeight/);
    });
  });
});
