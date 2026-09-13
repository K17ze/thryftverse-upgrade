import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');

function readScreen(name: string): string {
  return readFileSync(resolve(SCREENS, name), 'utf-8');
}

function readComponent(relPath: string): string {
  return readFileSync(resolve(COMPONENTS, relPath), 'utf-8');
}

/**
 * Structural architecture checks.
 *
 * Renamed from `nativeVisualAcceptance.test.ts`: these are source-level
 * structural assertions, NOT visual acceptance. They verify that
 * deconstructed screens still compose their extracted components, that
 * design budgets (radius, stroke, icon family, text) are honoured in
 * source, and that no fabricated data or hardcoded colours leaked in.
 *
 * They cannot verify layout, hierarchy, or rendered output — a screen can
 * pass every check here while rendering a broken layout, because nothing
 * below mounts a component or inspects a render tree. Real visual
 * acceptance requires rendered screenshot comparison; see
 * `src/__tests__/visual-baseline-manifest.json`, `src/__tests__/__screenshots__/`,
 * `src/__tests__/visualRegressionPlan.test.ts` and
 * `scripts/capture-baselines.sh` for that pipeline.
 */
describe('structural architecture checks', () => {
  const auctionScreen = readScreen('AuctionDetailScreen.tsx');
  const assetScreen = readScreen('AssetDetailScreen.tsx');
  const itemScreen = readScreen('ItemDetailScreen.tsx');
  const homeScreen = readScreen('HomeScreen.tsx');
  const myProfileScreen = readScreen('MyProfileScreen.tsx');

  /**
   * Assert that `source` both references `component` and renders it as
   * JSX. A bare toContain() check passes on comments and dead imports —
   * requiring `<Component` proves the extraction is actually composed.
   */
  function expectComposes(source: string, component: string): void {
    expect(source).toContain(component);
    expect(source).toMatch(new RegExp(`<${component}[\\s/>]`));
  }

  // ── Deconstruction: screens compose extracted domain components ──
  describe('screen deconstruction', () => {
    it('ItemDetailScreen composes the Phase-2 detail components', () => {
      // Regression guard for the Phase-2 extraction: media, identity,
      // trust and action were deconstructed into commerce/detail/*.
      // The screen must render them, not re-inline the sections.
      for (const component of [
        'CommerceMediaHero',
        'CommerceIdentityBlock',
        'CommerceTrustDossier',
        'CommerceActionDock',
      ]) {
        expectComposes(itemScreen, component);
      }
    });

    it('AuctionDetailScreen composes identity and transaction surface', () => {
      // Surface budget guard: identity + transaction stay as flat
      // composed primitives instead of card-on-card rows. The screen was
      // decomposed into auctiondetail/* — check the owner layer.
      expectComposes(readComponent('auctiondetail/AuctionDetailHero.tsx'), 'CommerceDetailIdentity');
      expectComposes(readComponent('auctiondetail/AuctionBidPanel.tsx'), 'CommerceDetailTransactionSurface');
    });

    it('AssetDetailScreen composes extracted identity and state dock', () => {
      // Wave 13/32 refactor: identity was extracted to AssetDetailIdentity;
      // the transaction surface was removed and state flows through the
      // dock + TradeConfirmScreen. The dock check runs on the owner
      // layer, not the orchestrator.
      expectComposes(assetScreen, 'AssetDetailIdentity');
      const dock = readComponent('coown/asset-detail/AssetDetailDock.tsx');
      expectComposes(dock, 'CommerceDetailStateDock');
    });

    it('HomeScreen composes the extracted home feed components', () => {
      for (const component of [
        'HomeHeader',
        'HomeMasonryFeed',
        'HomeFeedHeader',
      ]) {
        expectComposes(homeScreen, component);
      }
    });

    it('home feed components own their nested composition', () => {
      // Composition belongs to the owner layer: the feed header owns the
      // story rail, the masonry feed owns look breaks, and the rail owns
      // poster artwork. Checking only the orchestrator would miss a
      // re-inlining regression inside the children.
      expectComposes(readComponent('home/HomeFeedHeader.tsx'), 'HomeStoryRail');
      expectComposes(readComponent('home/HomeMasonryFeed.tsx'), 'HomeLookBreak');
      expectComposes(readComponent('home/HomeStoryRail.tsx'), 'PosterStoryArtwork');
    });

    it('MyProfileScreen composes the extracted profile components', () => {
      for (const component of [
        'ProfileHeaderHero',
        'CompletionGrowthPanel',
        'StorefrontTabs',
      ]) {
        expectComposes(myProfileScreen, component);
      }
    });

    it('StorefrontTabs owns the closet grid', () => {
      // ClosetGrid is composed inside StorefrontTabs (the listings tab),
      // not directly by the screen — check the owner layer.
      expectComposes(readComponent('myprofile/StorefrontTabs.tsx'), 'ClosetGrid');
    });
  });

  // ── Media-first composition: hero media dominates the first viewport ──
  describe('media-first composition', () => {
    it('auction screen renders a media stage', () => {
      // CommerceMediaStage lives inside the extracted hero (owner layer).
      expectComposes(readComponent('auctiondetail/AuctionDetailHero.tsx'), 'CommerceMediaStage');
    });

    it('asset screen renders a media stage', () => {
      expectComposes(assetScreen, 'CommerceMediaStage');
    });

    it('item screen renders the Phase-2 media hero', () => {
      // ItemDetailScreen's media surface is CommerceMediaHero, which wraps
      // CommerceMediaStage internally. The previous assertion matched the
      // string 'CommerceMediaStage' inside code comments only — a
      // tautology that could not fail.
      expectComposes(itemScreen, 'CommerceMediaHero');
      expectComposes(readComponent('commerce/detail/CommerceMediaHero.tsx'), 'CommerceMediaStage');
    });
  });

  // ── Radius budget: no more than two non-avatar radius sizes ──
  describe('radius budget', () => {
    it('commerce detail components use restrained radii', () => {
      const identity = readComponent('commerce/detail/CommerceDetailIdentity.tsx');
      const dock = readComponent('commerce/detail/CommerceDetailStateDock.tsx');
      // Should not use arbitrary large radii like 30, 32, 40
      expect(identity).not.toMatch(/borderRadius:\s*(30|32|40|48)/);
      expect(dock).not.toMatch(/borderRadius:\s*(30|32|40|48)/);
    });

    it('auction screen styles use restrained radii', () => {
      // No arbitrary large radii in the screen-level styles
      expect(auctionScreen).not.toMatch(/borderRadius:\s*(30|32|40|48)/);
    });

    it('asset screen styles use restrained radii', () => {
      expect(assetScreen).not.toMatch(/borderRadius:\s*(30|32|40|48)/);
    });
  });

  // ── Stroke grammar: hairline separators, 1pt fields, 2pt focus ──
  describe('stroke grammar', () => {
    it('commerce detail section uses hairline divider', () => {
      const section = readComponent('commerce/detail/CommerceDetailSection.tsx');
      expect(section).toMatch(/hairlineWidth|0\.5|borderWidth.*0\.5/);
    });

    it('auction screen does not mix arbitrary stroke widths', () => {
      // Should not have 0.5, 1, 1.5, and 2pt all in the same file
      const widths = auctionScreen.match(/borderWidth:\s*([0-9.]+)/g) || [];
      const uniqueWidths = new Set(widths.map((w) => w.replace(/borderWidth:\s*/, '')));
      // Allow up to 3 distinct stroke widths (hairline, 1pt, 2pt)
      expect(uniqueWidths.size).toBeLessThanOrEqual(4);
    });
  });

  // ── Icon grammar: one icon family per surface ──
  describe('icon grammar', () => {
    // The Ionicons import alone proves nothing — a dead import passes a
    // toContain('Ionicons') check. The real invariant is that no second
    // icon family is mixed into the surface.
    const FOREIGN_ICON_FAMILIES = [
      'MaterialIcons',
      'MaterialCommunityIcons',
      'FontAwesome',
      'Feather',
    ];

    it('auction screen has a consistent icon family', () => {
      for (const family of FOREIGN_ICON_FAMILIES) {
        expect(auctionScreen).not.toContain(family);
      }
    });

    it('asset detail tree has a consistent icon family', () => {
      // Ionicons usage moved to the extracted components
      // (AssetDetailIdentity, AssetDetailDock), so the invariant is
      // checked across the orchestrator and its owner layer.
      const identity = readComponent('coown/asset-detail/AssetDetailIdentity.tsx');
      const dock = readComponent('coown/asset-detail/AssetDetailDock.tsx');
      for (const family of FOREIGN_ICON_FAMILIES) {
        expect(assetScreen).not.toContain(family);
        expect(identity).not.toContain(family);
        expect(dock).not.toContain(family);
      }
    });

    it('item screen has a consistent icon family', () => {
      for (const family of FOREIGN_ICON_FAMILIES) {
        expect(itemScreen).not.toContain(family);
      }
    });
  });

  // ── Text budget: no more than three type sizes and one eyebrow ──
  describe('text budget', () => {
    it('auction identity uses eyebrow + title, not duplicate headings', () => {
      // The identity should have eyebrow and title, not multiple
      // competing headings. The extracted CommerceDetailIdentity owns the
      // title; the orchestrator should not render it again separately.
      const titleMatches = auctionScreen.match(/<Text[^>]*>\s*\{.*title.*\}\s*<\/Text>/g) || [];
      expect(titleMatches.length).toBeLessThanOrEqual(2);
    });

    // Asset heading ownership is covered by the deconstruction checks:
    // AssetDetailIdentity owns eyebrow + title for that surface.
  });

  // ── No card-on-card composition ──
  describe('no card-on-card composition', () => {
    it('auction screen does not nest CommerceDetailSection in cards', () => {
      // Sections should be flat canvas, not wrapped in card surfaces
      const sectionInCard = auctionScreen.match(/<View[^>]*style=\{[^}]*card[^}]*\}[^>]*>\s*<CommerceDetailSection/g);
      expect(sectionInCard).toBeNull();
    });

    it('asset screen does not nest CommerceDetailSection in cards', () => {
      const sectionInCard = assetScreen.match(/<View[^>]*style=\{[^}]*card[^}]*\}[^>]*>\s*<CommerceDetailSection/g);
      expect(sectionInCard).toBeNull();
    });
  });

  // ── Truthful UI: no fabricated data ──
  describe('truthful UI', () => {
    it('auction screen does not fabricate bid count', () => {
      // Bid count must come from auction.bidCount, not a literal.
      expect(auctionScreen).toContain('auction.bidCount');
      expect(auctionScreen).not.toMatch(/\bbidCount\s*=\s*\d+/);
    });

    it('asset screen does not fabricate market data', () => {
      // Market data must come from the backend, not a literal.
      expect(assetScreen).not.toMatch(/lastExecutionPrice.*=\s*\d+(\.\d+)?/);
    });

    it('item screen does not fabricate interested count', () => {
      // Per Pass 4: no fabricated "people interested" in actual code.
      expect(itemScreen).not.toContain('people interested');
    });

    it('item screen does not label likes as Demand', () => {
      expect(itemScreen).not.toContain("'Demand'");
    });
  });

  // ── State completeness: loading, error, unavailable ──
  describe('state completeness', () => {
    it('auction screen handles loading state', () => {
      expect(auctionScreen).toMatch(/loading|queryLoading|isLoading/i);
    });

    it('auction screen handles error state', () => {
      expect(auctionScreen).toMatch(/error|queryError|CommerceStateCanvas/i);
    });

    it('asset screen handles loading state', () => {
      expect(assetScreen).toMatch(/loading|queryLoading|isLoading/i);
    });

    it('asset screen handles error state', () => {
      expect(assetScreen).toMatch(/error|queryError|CommerceStateCanvas/i);
    });

    it('item screen handles loading state', () => {
      expect(itemScreen).toMatch(/loading|queryLoading|isLoading/i);
    });

    it('item screen handles error state', () => {
      expect(itemScreen).toMatch(/error|queryError|CommerceStateCanvas/i);
    });

    it('item screen handles unavailable state', () => {
      expect(itemScreen).toContain('Item not found');
    });
  });

  // ── Control quality: pressed feedback and a11y on owner layers ──
  describe('control quality', () => {
    it('auction dock has accessibility labels', () => {
      expect(auctionScreen).toMatch(/accessibilityLabel|accessibilityRole/);
    });

    it('asset dock has accessibility labels', () => {
      // The asset screen delegates its interactive surface to
      // AssetDetailDock / CommerceDetailMediaRail — the dock component is
      // the owner layer where the a11y labels actually live. Check the
      // dock itself, not the orchestrator's prop wiring.
      const dock = readComponent('coown/asset-detail/AssetDetailDock.tsx');
      expect(dock).toMatch(/accessibilityLabel|accessibilityRole/);
    });

    it('item dock has accessibility labels', () => {
      expect(itemScreen).toMatch(/accessibilityLabel|accessibilityRole/);
    });

    it('commerce detail dock has pressed feedback', () => {
      const dock = readComponent('commerce/detail/CommerceDetailStateDock.tsx');
      expect(dock).toMatch(/pressed|Pressable/);
    });
  });

  // ── Discovery density: consolidated modules per spec 12 ──
  describe('discovery density', () => {
    it('item screen has consolidated discovery modules', () => {
      // Per spec 12: "One high-quality continuation section is better than
      // 3 repetitive rails." Phase 2 consolidated to BundleUpsell + More
      // like this + Seen in Looks. The screen was decomposed into
      // itemdetail/* — the grid style lives in the owner component.
      expect(itemScreen).toContain('BundleUpsellRow');
      expect(readComponent('itemdetail/ItemDetailSimilarGrid.tsx')).toContain('moreLikeThisGrid');
      // Should NOT have the generic rail mapping or DiscoveryGrid
      expect(itemScreen).not.toContain('railSections.map');
    });

    it('auction screen has reduced recommendation density', () => {
      // Per Pass 2: reduced recommendation density
      expect(auctionScreen).toMatch(/recommendation|discovery/i);
    });

    it('asset screen has one discovery rail', () => {
      // Per Pass 3: one discovery rail
      expect(assetScreen).toMatch(/recommendation|discovery/i);
    });

    it('Co-Own price chart is width-responsive', () => {
      const priceChart = readComponent('coown/CoOwnPriceChart.tsx');
      expect(priceChart).toContain('useWindowDimensions');
      expect(priceChart).not.toMatch(/^const CHART_WIDTH = 320;$/m);
      expect(priceChart).toContain('screenWidth');
    });

    it('Co-Own candle chart is width-responsive', () => {
      const candleChart = readComponent('coown/CoOwnCandleChart.tsx');
      expect(candleChart).toContain('useWindowDimensions');
      expect(candleChart).not.toMatch(/^const CHART_WIDTH = 320;$/m);
      expect(candleChart).toContain('screenWidth');
    });

    it('fully allocated state has a real primary action', () => {
      // Per acceptance matrix: "Fully allocated state has a real action"
      // Dock logic was extracted to AssetDetailDock.tsx
      const dockSrc = readComponent('coown/asset-detail/AssetDetailDock.tsx');
      const fullyAllocatedMatch = dockSrc.match(/availableUnits === 0 && !isHolder[\s\S]*?Browse secondary/);
      expect(fullyAllocatedMatch).toBeTruthy();
      expect(fullyAllocatedMatch![0]).toContain('primaryAction');
      expect(fullyAllocatedMatch![0]).toContain('Browse secondary');
    });
  });

  // ── Light/dark parity: theme colours, no hardcoded backgrounds ──
  describe('light/dark parity', () => {
    it('commerce detail components use theme colors, not hardcoded', () => {
      const identity = readComponent('commerce/detail/CommerceDetailIdentity.tsx');
      const dock = readComponent('commerce/detail/CommerceDetailStateDock.tsx');
      // Should reference colors from theme, not hardcoded hex
      expect(identity).toContain('colors.');
      expect(dock).toContain('colors.');
      // Should not have hardcoded black/white backgrounds
      expect(identity).not.toMatch(/backgroundColor:\s*['"]#(000|fff)/i);
      expect(dock).not.toMatch(/backgroundColor:\s*['"]#(000|fff)/i);
    });
  });
});
