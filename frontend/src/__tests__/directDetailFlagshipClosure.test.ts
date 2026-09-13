import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');
const HOOKS = resolve(__dirname, '../hooks');

function readScreen(name: string): string {
  return readFileSync(resolve(SCREENS, name), 'utf-8');
}

function readComponent(relPath: string): string {
  return readFileSync(resolve(COMPONENTS, relPath), 'utf-8');
}

function readHook(relPath: string): string {
  return readFileSync(resolve(HOOKS, relPath), 'utf-8');
}

describe('direct-listing-detail flagship closure (spec 04_DIRECT)', () => {
  const src = readScreen('ItemDetailScreen.tsx');
  // The screen was decomposed — ItemDetailScreen.tsx is now an
  // orchestrator. Positive assertions below check the owner layer where
  // the code actually lives, not the orchestrator:
  //   hooks/itemDetail/itemDetailDerived.ts  — display-string derivation
  //   hooks/itemDetail/useItemDetailOverlays — sheet visibility state
  //   hooks/itemDetail/useItemDetailData     — server comparables query
  //   components/itemdetail/ItemDetailSheets — canonical BottomSheet set
  //   components/commerce/detail/CommerceIdentityBlock — identity wiring
  const derived = readHook('itemDetail/itemDetailDerived.ts');
  const overlays = readHook('itemDetail/useItemDetailOverlays.ts');
  const dataHook = readHook('itemDetail/useItemDetailData.ts');
  const sheets = readComponent('itemdetail/ItemDetailSheets.tsx');
  const identityBlock = readComponent('commerce/detail/CommerceIdentityBlock.tsx');

  // ── §1 Remove fabricated "interested" count ──
  describe('fabricated interested count', () => {
    it('does not fabricate "people interested" by adding saved-to-collection to likes', () => {
      // The interestSignal function should not combine likes with
      // isItemSavedAnywhere to fabricate a higher "people interested"
      // count. It should only show truthful likes.
      // interestSignal is derived in the owner layer (itemDetailDerived),
      // not the orchestrator.
      const interestSignalMatch = derived.match(/const interestSignal = \([\s\S]*?\}\)\(\);/);
      expect(interestSignalMatch).toBeTruthy();
      expect(interestSignalMatch![0]).not.toContain('isItemSavedAnywhere');
      expect(interestSignalMatch![0]).not.toContain('people interested');
    });

    it('only shows truthful likes from the backend', () => {
      // Owner layer: itemDetailDerived builds the likes line.
      expect(derived).toContain('item.likes');
      expect(derived).toContain("like${item.likes > 1 ? 's' : ''}");
    });
  });

  // ── §2 Remove "Demand" label ──
  describe('demand label', () => {
    it('does not label likes as "Demand"', () => {
      expect(src).not.toContain("'Demand'");
      expect(src).not.toContain('label: \'Demand\'');
    });

    it('retains truthful price insight rows', () => {
      // Owner layer: itemDetailDerived builds priceInsightRows.
      expect(derived).toContain('Price drop');
      expect(derived).toContain('similar sold');
      expect(derived).toContain('Time on market');
    });
  });

  // ── §3 Collapse Q&A ──
  describe('Q&A collapse', () => {
    it('uses a disclosure row, not inline ListingQA', () => {
      // The Q&A section should use CommerceDetailDisclosureRow, not
      // inline ListingQA in the section body.
      const qaSection = src.match(/CommerceDetailSection label="Questions"[\s\S]*?<\/CommerceDetailSection>/);
      expect(qaSection).toBeTruthy();
      expect(qaSection![0]).toContain('CommerceDetailDisclosureRow');
      expect(qaSection![0]).toContain('View all questions');
    });

    it('does not render ListingQA inline in the section', () => {
      const qaSection = src.match(/CommerceDetailSection label="Questions"[\s\S]*?<\/CommerceDetailSection>/);
      expect(qaSection).toBeTruthy();
      expect(qaSection![0]).not.toContain('<ListingQA');
    });

    it('has qaSheetVisible state', () => {
      // Owner layer: overlay visibility lives in useItemDetailOverlays.
      expect(overlays).toContain('qaSheetVisible');
      expect(overlays).toContain('setQaSheetVisible');
    });

    it('opens Q&A in a canonical BottomSheet', () => {
      // Owner layer: the sheet set lives in ItemDetailSheets (BottomSheet
      // + ListingQA wired to visibility.qa); the visibility state lives in
      // useItemDetailOverlays.
      expect(sheets).toContain('BottomSheet');
      expect(sheets).toContain('visibility.qa');
      expect(sheets).toContain('ListingQA');
      expect(overlays).toContain('qaSheetVisible');
    });
  });

  // ── §4 Three discovery modules max ──
  describe('discovery density', () => {
    it('does not render generic duplicate recommendation rails', () => {
      expect(src).not.toContain('railSections.map');
    });

    it('does not render DiscoveryGrid', () => {
      // DiscoveryGrid was removed to stay within the three-module budget.
      // The JSX reference is removed from the screen body.
      const scrollEnd = src.indexOf('</Reanimated.ScrollView>');
      const scrollBody = src.substring(0, scrollEnd);
      expect(scrollBody).not.toContain('<DiscoveryGrid');
    });

    it('retains Bundle upsell module', () => {
      expect(src).toContain('BundleUpsellRow');
    });

    it('retains More like this module', () => {
      expect(src).toContain('More like this');
    });

    it('contains Seen in Looks rail when looks are available', () => {
      expect(src).toContain('SeenInLooksRail');
    });
  });

  // ── §5 Family-aware identity ──
  describe('family-aware identity', () => {
    it('identity uses family="direct"', () => {
      // Owner layer: the screen composes CommerceIdentityBlock, which owns
      // the CommerceDetailIdentity wiring.
      const identityMatch = identityBlock.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).toContain('family="direct"');
    });

    it('identity shows primaryValue (direct may show price)', () => {
      const identityMatch = identityBlock.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).toContain('primaryValue={formattedPrice}');
    });
  });

  // ── §6 Server comparables ──
  describe('server comparables', () => {
    it('derives sold comparables from backend listings', () => {
      // Owner layer: useItemDetailData fetches comparables via the
      // authoritative server endpoint (useListingSoldComparables) and
      // itemDetailDerived consumes them for the price-insight rows.
      expect(dataHook).toContain('soldComps');
      expect(dataHook).toContain('useListingSoldComparables');
      expect(derived).toContain('soldComps');
    });

    it('requires at least 2 sold comparables', () => {
      // Owner layer: the >=2 gate lives in itemDetailDerived.
      expect(derived).toContain('sampleSize >= 2');
    });
  });

  // ── §7 Engagement summary ──
  describe('engagement summary', () => {
    it('uses listingEngagement from backend', () => {
      expect(src).toContain('listingEngagement');
      expect(src).toContain('item?.engagement');
    });

    it('uses questionCount from engagement in disclosure summary', () => {
      expect(src).toContain('listingEngagement?.questionCount');
    });
  });
});
