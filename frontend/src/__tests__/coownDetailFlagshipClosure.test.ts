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

describe('co-own-detail flagship closure (spec 03_COOWN)', () => {
  const src = readScreen('AssetDetailScreen.tsx');
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
  describe('reference price label', () => {
    it('uses "Reference unit price" by default', () => {
      expect(src).toContain('Reference unit price');
    });

    it('uses "Last settled trade" only when backend provides lastExecutionPriceGbp', () => {
      expect(src).toContain('marketSnapshot?.lastExecutionPriceGbp');
      expect(src).toContain('Last settled trade');
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
      const identityMatch = src.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).toContain('family="co_own"');
    });

    it('transaction surface uses family="co_own"', () => {
      const surfaceMatch = src.match(/<CommerceDetailTransactionSurface[\s\S]*?\/>/);
      expect(surfaceMatch).toBeTruthy();
      expect(surfaceMatch![0]).toContain('family="co_own"');
    });
  });

  // ── §4 Candle gating ──
  describe('candle gating', () => {
    it('only renders candle chart when hasCandleData is true', () => {
      expect(src).toContain('hasCandleData');
      expect(src).toContain('candleData');
    });

    it('does not pass empty candles array to CoOwnCandleChart', () => {
      // The old code passed candles={[]}. The new code passes
      // candles={candleData} only when hasCandleData is true.
      expect(src).not.toContain('candles={[]}');
    });

    it('candleChart is undefined when no candle data', () => {
      expect(src).toMatch(/hasCandleData \? \(/);
      expect(src).toMatch(/: undefined/);
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
      expect(src).toContain('assetStoryText');
      expect(src).toContain('Read the full story');
    });
  });

  // ── §6 Supply semantics ──
  describe('supply semantics', () => {
    it('does not infer treasury from available units', () => {
      // The old code set treasury: availableUnits. The new code passes
      // null for inferred values.
      expect(src).not.toContain('treasury: availableUnits');
      expect(src).toContain('treasury: null');
    });

    it('does not infer authorised, issued, publicFloat', () => {
      expect(src).toContain('authorised: null');
      expect(src).toContain('issued: null');
      expect(src).toContain('publicFloat: null');
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
    it('holder primary action is "Sell"', () => {
      // The holder branch should have label: 'Sell' as primary
      expect(src).toMatch(/isHolder[\s\S]*?label: 'Sell'[\s\S]*?handleTradePress\('sell'\)/);
    });

    it('holder secondary action is "Buy more"', () => {
      expect(src).toContain("'Buy more'");
    });

    it('non-holder primary action is "Buy units"', () => {
      expect(src).toContain("'Buy units'");
    });
  });

  // ── §8 Rights & risks compress ──
  describe('rights & risks compress', () => {
    it('risk disclosure is collapsed by default', () => {
      expect(src).toContain('riskDisclosure');
      expect(src).toContain('openSheet');
    });

    it('has "Risk disclosure" row (not "View risk disclosure")', () => {
      expect(src).toContain('label="Risk disclosure"');
      expect(src).not.toContain('label="View risk disclosure"');
    });

    it('does not render CoOwnRiskDisclosure inline in the Asset dossier section', () => {
      const ddSection = src.match(/<CommerceDetailSection[\s\S]*?label="Asset dossier"[\s\S]*?<\/CommerceDetailSection>/);
      expect(ddSection).toBeTruthy();
      expect(ddSection![0]).not.toContain('<CoOwnRiskDisclosure');
    });

    it('risk disclosure opens in a BottomSheet', () => {
      expect(src).toContain('riskDisclosureSheetHeader');
      expect(src).toContain('BottomSheet');
    });
  });

  // ── §9 One discovery rail ──
  describe('discovery density', () => {
    it('does not render generic duplicate recommendation rails', () => {
      expect(src).not.toContain('railSections.map');
    });

    it('retains one Seen in Looks rail', () => {
      expect(src).toContain('seenInLooksSection');
    });
  });

  // ── §10 NAV vs reference label ──
  describe('NAV vs reference label', () => {
    it('uses "Reference vs NAV" not "Last trade vs NAV"', () => {
      expect(src).toContain('Reference vs NAV');
      expect(src).not.toContain('Last trade vs NAV');
    });
  });

  // ── §11 Holder P&L (spec 09 upgrade) ──
  describe('holder P&L', () => {
    it('stores the full holding object for P&L computation', () => {
      expect(src).toContain('yourHolding');
      expect(src).toContain('MarketCoOwnHolding');
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
    it('does not show thumbnail in dock (avoids ecommerce cart look)', () => {
      // Per spec 09: avoid putting a thumbnail into dock if it makes the
      // dock look like an ecommerce cart when the asset hero is already clear.
      // The thumbnailUri prop should not be passed in the tradable dock.
      // Match the actual JSX usage (starts with <CommerceDetailStateDock),
      // not the import or type reference.
      const dockMatch = src.match(/<CommerceDetailStateDock[\s\S]*?label: 'Sell'/);
      expect(dockMatch).toBeTruthy();
      expect(dockMatch![0]).not.toContain('thumbnailUri');
    });

    it('does not show redundant price in dock when price is above', () => {
      // Per spec 09: do not show redundant value if same price is
      // immediately above. The tradable dock should not pass value=.
      const dockMatch = src.match(/<CommerceDetailStateDock[\s\S]*?label: 'Sell'/);
      expect(dockMatch).toBeTruthy();
      expect(dockMatch![0]).not.toContain('value={');
      expect(dockMatch![0]).not.toContain('valueLabel=');
    });
  });
});
