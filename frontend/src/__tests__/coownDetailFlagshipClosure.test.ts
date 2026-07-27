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
      expect(src).toContain('fundamentalsStacked');
      expect(src).toContain('fundamentalsRow');
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

  // ── §5 Dossier collapse ──
  describe('dossier collapse', () => {
    it('has dossierExpanded state', () => {
      expect(src).toContain('dossierExpanded');
      expect(src).toContain('setDossierExpanded');
    });

    it('shows summary facts by default (maximum five)', () => {
      expect(src).toContain('Authenticity');
      expect(src).toContain('Condition');
      expect(src).toContain('Storage');
      expect(src).toContain('Insurance');
      expect(src).toContain('Latest appraisal');
    });

    it('has "View full asset dossier" disclosure', () => {
      expect(src).toContain('View full asset dossier');
    });

    it('full dossier renders only when expanded', () => {
      expect(src).toContain('{dossierExpanded && (');
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

    it('supply summary uses "Available · allocated · holders"', () => {
      expect(src).toContain('Available · allocated · holders');
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
      expect(src).toContain('riskDisclosureVisible');
      expect(src).toContain('setRiskDisclosureVisible');
    });

    it('has "View risk disclosure" disclosure row', () => {
      expect(src).toContain('View risk disclosure');
    });

    it('does not render CoOwnRiskDisclosure inline in the section', () => {
      // The old code rendered <CoOwnRiskDisclosure ... /> directly in
      // the section. The new code opens it in a modal.
      const rightsSection = src.match(/CommerceDetailSection label="Rights & risks"[\s\S]*?<\/CommerceDetailSection>/);
      expect(rightsSection).toBeTruthy();
      expect(rightsSection![0]).not.toContain('<CoOwnRiskDisclosure');
    });

    it('risk disclosure opens in a Modal', () => {
      expect(src).toContain('riskDisclosureModalSheet');
      expect(src).toContain('riskDisclosureModalOverlay');
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
});
