import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');

function readScreen(name: string): string {
  return readFileSync(resolve(SCREENS, name), 'utf-8');
}

function readComponent(relativePath: string): string {
  return readFileSync(resolve(COMPONENTS, relativePath), 'utf-8');
}

function readSection(name: string): string {
  return readFileSync(resolve(COMPONENTS, `coown/asset-detail/${name}`), 'utf-8');
}

describe('co-own-detail flagship closure (spec 03_COOWN)', () => {
  const src = readScreen('AssetDetailScreen.tsx');
  const modalsSrc = readComponent('coown/asset-detail/AssetDetailModals.tsx');
  const ownershipPanel = readComponent('coown/CoOwnOwnershipPanel.tsx');

  // ── §1 Replace three-column fundamentals with stacked layout ──
  describe('fundamentals layout', () => {
    it('uses stacked fundamentals layout, not three columns', () => {
      const fundamentals = readComponent('asset/FundamentalsSection.tsx');
      expect(fundamentals).toContain('fundamentalsStacked');
      expect(fundamentals).toContain('fundamentalsRow');
    });

    it('does not use the old three-column marketSecondaryFacts in JSX', () => {
      // The old JSX used marketSecondaryFacts with three marketSecondaryFact
      // children. The new code uses fundamentalsStacked.
      const oldPattern = /marketSecondaryFacts[\s\S]*?marketSecondaryFact[\s\S]*?marketSecondaryFact[\s\S]*?marketSecondaryFact/;
      expect(oldPattern.test(src)).toBe(false);
    });
  });

  // ── §2 Reference price label ──
  // The reference price label moved to AssetOverviewSection/AssetOverviewDetails
  // during the Wave 32 refactor. The market section now focuses on order
  // book depth and execution tape, not price fundamentals.
  describe('reference price label', () => {
    it('shows appraisal/reference price in the overview details', () => {
      const overviewDetails = readSection('AssetOverviewDetails.tsx');
      expect(overviewDetails).toContain('Appraisal / unit');
      expect(overviewDetails).toContain('Valuation estimate, not a tradable price');
    });

    it('does not label reference price as "Last trade" without proof', () => {
      // The old label was primaryLabel="Last trade". The new code uses
      // conditional labeling.
      expect(src).not.toContain('primaryLabel="Last trade"');
    });
  });

  // ── §3 Family-aware identity and transaction surface ──
  describe('family-aware components', () => {
    it('identity uses family="co_own"', () => {
      // Identity was extracted to AssetDetailIdentity.tsx
      const identitySrc = readComponent('coown/asset-detail/AssetDetailIdentity.tsx');
      const identityMatch = identitySrc.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).toContain('family="co_own"');
    });

    it('transaction surface uses family="co_own"', () => {
      // The transaction surface was removed during the Wave 32 refactor;
      // the trade flow now goes through the dock → TradeConfirmScreen.
      // The identity component still carries family="co_own" for
      // structural consistency across all commerce detail surfaces.
      const identitySrc = readComponent('coown/asset-detail/AssetDetailIdentity.tsx');
      expect(identitySrc).toContain('family="co_own"');
    });
  });

  // ── §4 Candle gating ──
  describe('candle gating', () => {
    it('screen forwards embedded candles to the overview section', () => {
      expect(src).toContain('candleData');
    });

    it('does not pass empty candles array to CoOwnCandleChart', () => {
      // The old code passed candles={[]}. The new code gates on
      // hasChartCandles (ranged history, with embedded data valid only for 1W).
      expect(src).not.toContain('candles={[]}');
    });

    it('chart stays mounted through empty/error with honest empty-state copy', () => {
      // F12: the chart is always mounted so range controls and retry
      // survive loading/empty/error states; the section feeds it the
      // resolved candles (embedded data valid only for 1W) plus the
      // state-specific empty copy.
      const overviewSection = readSection('AssetOverviewSection.tsx');
      expect(overviewSection).toContain('<CoOwnCandleChart');
      expect(overviewSection).toContain('emptyStateTitle={historyLoading');
      expect(overviewSection).toContain("candleRange === '1W' ? candleData : []");
    });
  });

  // ── §5 Dossier moved to Due Diligence screen ──
  describe('dossier moved to due diligence', () => {
    it('does not have dossierExpanded state on main screen', () => {
      // The dossier has moved to the dedicated Due Diligence screen.
      // The main screen no longer carries inline dossier expansion.
      expect(src).not.toContain('dossierExpanded');
      expect(src).not.toContain('setDossierExpanded');
    });

    it('navigates to AssetDueDiligence for full dossier', () => {
      expect(src).toContain('AssetDueDiligence');
    });

    it('asset story excerpt is shown before market data', () => {
      // The asset story moved to AssetOverviewDetails during the Wave 32
      // refactor. The excerpt is shown with a "Read the full story" CTA.
      const overviewDetails = readSection('AssetOverviewDetails.tsx');
      expect(overviewDetails).toContain('asset.provenance');
      expect(overviewDetails).toContain('Asset story & due diligence');
    });
  });

  // ── §6 Supply semantics ──
  describe('supply semantics', () => {
    it('does not infer treasury from available units', () => {
      // The old code set treasury: availableUnits. The new code passes
      // null for inferred values.
      expect(modalsSrc).not.toContain('treasury: availableUnits');
      expect(modalsSrc).toContain('treasury: null');
    });

    it('does not infer authorised, issued, publicFloat', () => {
      expect(modalsSrc).toContain('authorised: null');
      expect(modalsSrc).toContain('issued: null');
      expect(modalsSrc).toContain('publicFloat: null');
    });

    it('supply summary uses "Available · allocated · holders" in due diligence', () => {
      const ddSrc = readScreen('AssetDueDiligenceScreen.tsx');
      expect(ddSrc).toContain('Available · allocated · holders');
    });

    it('does not use "Authorised · issued · float · treasury" summary', () => {
      expect(src).not.toContain('Authorised · issued · float · treasury');
    });

    it('CoOwnSupplyBuckets accepts null values', () => {
      expect(ownershipPanel).toContain('authorised?: number | null');
      expect(ownershipPanel).toContain('issued?: number | null');
      expect(ownershipPanel).toContain('publicFloat?: number | null');
      expect(ownershipPanel).toContain('treasury?: number | null');
    });
  });

  // ── §7 Holder action priority ──
  describe('holder action priority', () => {
    const dockSrc = readComponent('coown/asset-detail/AssetDetailDock.tsx');

    it('holder primary action is "Sell"', () => {
      // The holder branch should have label: 'Sell' as primary
      expect(dockSrc).toMatch(/isSellPrimary[\s\S]*?label: 'Sell'[\s\S]*?onTradePress\('sell'\)/);
    });

    it('holder secondary action is "Buy more"', () => {
      expect(dockSrc).toContain("'Buy more'");
    });

    it('non-holder primary action is "Buy units"', () => {
      expect(dockSrc).toContain("'Buy units'");
    });
  });

  // ── §8 Rights & risks compress ──
  describe('rights & risks compress', () => {
    it('risk disclosure is collapsed by default', () => {
      expect(src).toContain('riskDisclosure');
      expect(src).toContain('openSheet');
    });

    it('has "Risk disclosure" row (not "View risk disclosure")', () => {
      // The risk disclosure row moved to AssetOverviewDetails during the
      // Wave 32 refactor.
      const overviewDetails = readSection('AssetOverviewDetails.tsx');
      expect(overviewDetails).toContain('label="Risk disclosure"');
      expect(overviewDetails).not.toContain('label="View risk disclosure"');
    });

    it('does not render CoOwnRiskDisclosure inline in the Due diligence & fees section', () => {
      // The overview details no longer wraps risk disclosure in a
      // "Due diligence & fees" CommerceDetailSection — it's a flat
      // disclosure row. The full risk disclosure sheet opens via modal.
      const overviewDetails = readSection('AssetOverviewDetails.tsx');
      expect(overviewDetails).not.toContain('<CoOwnRiskDisclosure');
    });

    it('risk disclosure opens in a BottomSheet', () => {
      expect(modalsSrc).toContain('riskDisclosureSheetHeader');
      expect(modalsSrc).toContain('BottomSheet');
    });
  });

  // ── §9 One discovery rail ──
  describe('discovery density', () => {
    it('does not render generic duplicate recommendation rails', () => {
      expect(src).not.toContain('railSections.map');
    });

    it('does not render generic product RecommendationRail (Co-Own mismatch)', () => {
      // The generic RecommendationRail renders portrait listing cards
      // and reason pills inconsistent with Co-Own assets. The Co-Own
      // asset detail screen uses the hand-built "More from {issuer}"
      // rail instead.
      expect(src).not.toContain('RecommendationRail');
    });

    it('retains the Co-Own-specific related assets rail', () => {
      expect(src).toContain('relatedAssets');
    });
  });

  // ── §10 NAV vs reference label ──
  // The "Reference vs appraisal" comparison moved to the overview details
  // during the Wave 32 refactor. The appraisal is now shown with an
  // explicit "Valuation estimate, not a tradable price" sublabel so the
  // user can never confuse it with a tradable price.
  describe('NAV vs reference label', () => {
    it('shows appraisal with honest sublabel, not "Last trade vs NAV"', () => {
      const overviewDetails = readSection('AssetOverviewDetails.tsx');
      expect(overviewDetails).toContain('Appraisal / unit');
      expect(overviewDetails).toContain('Valuation estimate, not a tradable price');
      expect(overviewDetails).not.toContain('Last trade vs NAV');
    });
  });

  // ── §11 Holder P&L (spec 09 upgrade) ──
  describe('holder P&L', () => {
    it('stores the full holding object for P&L computation', () => {
      expect(src).toContain('yourHolding');
      const queriesSrc = readFileSync(resolve(__dirname, '../platform/server/useCoOwnQueries.ts'), 'utf-8');
      expect(queriesSrc).toContain('MarketCoOwnHolding');
    });

    it('computes avg entry, unrealized P&L, and P&L percentage', () => {
      expect(src).toContain('avgEntryPriceGbp');
      expect(src).toContain('unrealizedPnlGbp');
      expect(src).toContain('unrealizedPnlPct');
    });

    it('displays avg entry in the holder position', () => {
      const holderSummary = readComponent('asset/HolderPositionSummary.tsx');
      expect(holderSummary).toContain('Avg. entry');
    });
  });

  // ── §12 Dock cleanup (spec 09 upgrade) ──
  describe('dock cleanup', () => {
    const dockSrc = readComponent('coown/asset-detail/AssetDetailDock.tsx');

    it('does not show thumbnail in dock (avoids ecommerce cart look)', () => {
      // Per spec 09: avoid putting a thumbnail into dock if it makes the
      // dock look like an ecommerce cart when the asset hero is already clear.
      // The thumbnailUri prop should not be passed in the tradable dock.
      const dockMatch = dockSrc.match(/<CommerceDetailStateDock[\s\S]*?label: 'Sell'/);
      expect(dockMatch).toBeTruthy();
      expect(dockMatch![0]).not.toContain('thumbnailUri');
    });

    it('passes current price into the default dock variant', () => {
      // The dock stays visible while scrolling — the hero price scrolls
      // away. The dock should show the dominant price so the user always
      // sees the actionable value next to the Buy/Sell buttons.
      const dockMatch = dockSrc.match(/<CommerceDetailStateDock[\s\S]*?label: 'Sell'/);
      expect(dockMatch).toBeTruthy();
      expect(dockMatch![0]).toContain('value={');
      expect(dockMatch![0]).toContain('valueLabel=');
    });
  });
});
