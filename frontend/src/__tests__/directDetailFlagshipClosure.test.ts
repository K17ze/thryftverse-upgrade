import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');

function readScreen(name: string): string {
  return readFileSync(resolve(SCREENS, name), 'utf-8');
}

describe('direct-listing-detail flagship closure (spec 04_DIRECT)', () => {
  const src = readScreen('ItemDetailScreen.tsx');

  // ── §1 Remove fabricated "interested" count ──
  describe('fabricated interested count', () => {
    it('does not fabricate "people interested" by adding saved-to-collection to likes', () => {
      // The interestSignal function should not combine likes with
      // isItemSavedAnywhere to fabricate a higher "people interested"
      // count. It should only show truthful likes.
      const interestSignalMatch = src.match(/const interestSignal = \([\s\S]*?\}\)\(\);/);
      expect(interestSignalMatch).toBeTruthy();
      expect(interestSignalMatch![0]).not.toContain('isItemSavedAnywhere');
      expect(interestSignalMatch![0]).not.toContain('people interested');
    });

    it('only shows truthful likes from the backend', () => {
      expect(src).toContain('item.likes');
      expect(src).toContain("like${item.likes > 1 ? 's' : ''}");
    });
  });

  // ── §2 Remove "Demand" label ──
  describe('demand label', () => {
    it('does not label likes as "Demand"', () => {
      expect(src).not.toContain("'Demand'");
      expect(src).not.toContain('label: \'Demand\'');
    });

    it('retains truthful price insight rows', () => {
      expect(src).toContain('Price drop');
      expect(src).toContain('similar sold');
      expect(src).toContain('Time on market');
    });
  });

  // ── §3 Collapse Q&A ──
  describe('Q&A collapse', () => {
    it('uses a disclosure row, not inline ListingQA', () => {
      // The Q&A section should use CommerceDetailDisclosureRow, not
      // inline ListingQA in the section body.
      const qaSection = src.match(/CommerceDetailSection label="Questions & answers"[\s\S]*?<\/CommerceDetailSection>/);
      expect(qaSection).toBeTruthy();
      expect(qaSection![0]).toContain('CommerceDetailDisclosureRow');
      expect(qaSection![0]).toContain('View all questions');
    });

    it('does not render ListingQA inline in the section', () => {
      const qaSection = src.match(/CommerceDetailSection label="Questions & answers"[\s\S]*?<\/CommerceDetailSection>/);
      expect(qaSection).toBeTruthy();
      expect(qaSection![0]).not.toContain('<ListingQA');
    });

    it('has qaSheetVisible state', () => {
      expect(src).toContain('qaSheetVisible');
      expect(src).toContain('setQaSheetVisible');
    });

    it('opens Q&A in a canonical BottomSheet', () => {
      expect(src).toContain('BottomSheet');
      expect(src).toContain('qaSheetVisible');
      expect(src).toContain('ListingQA');
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

    it('retains Seen in Looks module', () => {
      expect(src).toContain('SeenInLooksRail');
    });
  });

  // ── §5 Family-aware identity ──
  describe('family-aware identity', () => {
    it('identity uses family="direct"', () => {
      const identityMatch = src.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).toContain('family="direct"');
    });

    it('identity shows primaryValue (direct may show price)', () => {
      const identityMatch = src.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).toContain('primaryValue={formattedPrice}');
    });
  });

  // ── §6 Server comparables ──
  describe('server comparables', () => {
    it('derives sold comparables from backend listings', () => {
      expect(src).toContain('soldComps');
      expect(src).toContain('backendListings');
    });

    it('requires at least 2 sold comparables', () => {
      expect(src).toContain('sampleSize >= 2');
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
