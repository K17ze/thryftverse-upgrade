import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const SERVICES = resolve(__dirname, '../services');

function readScreen(name: string): string {
  return readFileSync(resolve(SCREENS, name), 'utf-8');
}

function readService(name: string): string {
  return readFileSync(resolve(SERVICES, name), 'utf-8');
}

describe('auction-detail flagship closure (spec 02_AUCTION)', () => {
  const src = readScreen('AuctionDetailScreen.tsx');
  const marketApi = readService('marketApi.ts');

  // ── §1 Remove duplicated price hierarchy ──
  describe('price hierarchy', () => {
    it('identity does not show price (family="auction")', () => {
      // The identity should not pass primaryValue when family="auction"
      const identityMatch = src.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).toContain('family="auction"');
      expect(identityMatch![0]).not.toContain('primaryValue={priceText}');
    });

    it('transaction surface owns the current bid', () => {
      const surfaceMatch = src.match(/<CommerceDetailTransactionSurface[\s\S]*?\/>/);
      expect(surfaceMatch).toBeTruthy();
      expect(surfaceMatch![0]).toContain('family="auction"');
      expect(surfaceMatch![0]).toContain('primaryValue={priceText}');
    });

    it('dock owns minimum next bid or action state', () => {
      expect(src).toContain('dockValue');
      expect(src).toContain('Min next bid');
    });
  });

  // ── §2 Remove duplicated auction family/state treatment ──
  describe('family/state badge', () => {
    it('does not render ProductFamilyBadge in identity', () => {
      expect(src).not.toContain('ProductFamilyBadge');
      expect(src).not.toContain('familyChip');
    });

    it('retains AuctionStateBadge in media overlay', () => {
      expect(src).toContain('AuctionStateBadge');
      expect(src).toContain('overlayTopContent');
    });
  });

  // ── §3 Consolidate bid history ──
  describe('bid history', () => {
    it('uses one presentation pattern (Bid activity)', () => {
      expect(src).toContain('Bid activity');
      expect(src).toContain('bidActivityRow');
    });

    it('does not show both a disclosure row and a three-row preview', () => {
      // The old pattern had CommerceDetailDisclosureRow with label="Bid
      // history" inside a "Bid history" section. The new pattern uses
      // a single "Bid activity" section with a latest-bid row.
      expect(src).not.toContain('label="Bid history"');
      expect(src).not.toContain('bidPreviewList');
    });

    it('has one View all bids action', () => {
      expect(src).toContain('bidActivityViewAll');
      expect(src).toContain('View all');
    });
  });

  // ── §4 Eliminate terminal-state duplication ──
  describe('terminal state', () => {
    it('dock does not repeat terminal result message', () => {
      // The dock should not have a stateBadge with the terminal message
      // (the body owns the result). The dock carries the action only.
      const dockSection = src.match(/if \(isTerminal\)[\s\S]*?return \(\s*<CommerceDetailStateDock[\s\S]*?\/>\s*\)/);
      expect(dockSection).toBeTruthy();
      expect(dockSection![0]).not.toContain('terminalMessage');
      expect(dockSection![0]).not.toContain('stateBadge');
    });

    it('body owns detailed terminal result', () => {
      expect(src).toContain('terminalResultModule');
      expect(src).toContain('You won');
      expect(src).toContain('Auction closed');
    });
  });

  // ── §5 Coherent Item Details section ──
  describe('item details section', () => {
    it('wraps description and evidence in one Item details section', () => {
      expect(src).toContain('label="Item details"');
      expect(src).toContain('variant="editorial"');
    });

    it('includes condition row inside Item details', () => {
      expect(src).toContain('itemDetailRow');
      expect(src).toContain('Condition');
    });
  });

  // ── §6 Compact dock geometry ──
  describe('compact dock geometry', () => {
    it('Buy Now button label does not include price', () => {
      // The old label was `Buy Now · £X`. The new label is just "Buy now".
      expect(src).not.toContain('Buy Now ·');
      expect(src).toMatch(/label:.*'Buy now'/);
    });

    it('uses compact button labels', () => {
      expect(src).toContain('Place bid');
      expect(src).toContain('Bid again');
    });
  });

  // ── §7 Multi-media support ──
  describe('multi-media support', () => {
    it('uses auctionMediaImages derived from canonical media array', () => {
      expect(src).toContain('auctionMediaImages');
      expect(src).toContain('mediaItems');
    });

    it('falls back to imageUrl for compatibility', () => {
      expect(src).toContain('auction.imageUrl');
    });

    it('AuctionMediaItem type exists in marketApi', () => {
      expect(marketApi).toContain('interface AuctionMediaItem');
      expect(marketApi).toContain("type: 'image' | 'video'");
      expect(marketApi).toContain('blurhash');
      expect(marketApi).toContain('focalX');
      expect(marketApi).toContain('focalY');
      expect(marketApi).toContain('posterUrl');
      expect(marketApi).toContain('order: number');
    });

    it('AuctionDetail has mediaItems field', () => {
      expect(marketApi).toContain('mediaItems?: AuctionMediaItem[]');
    });
  });

  // ── §8 Winner/seller fulfilment contract ──
  describe('fulfilment contract', () => {
    it('AuctionFulfilmentSummary type exists in marketApi', () => {
      expect(marketApi).toContain('interface AuctionFulfilmentSummary');
      expect(marketApi).toContain('orderId: string | null');
      expect(marketApi).toContain('paymentStatus');
      expect(marketApi).toContain('fulfilmentStatus');
      expect(marketApi).toContain('buyerNextAction: string | null');
      expect(marketApi).toContain('sellerNextAction: string | null');
    });

    it('AuctionDetail has fulfilment field', () => {
      expect(marketApi).toContain('fulfilment?: AuctionFulfilmentSummary | null');
    });

    it('screen uses auctionFulfilment for next steps', () => {
      expect(src).toContain('auctionFulfilment');
      expect(src).toContain('buyerNextAction');
      expect(src).toContain('sellerNextAction');
    });

    it('does not show "Fulfilment not yet available" as the final state', () => {
      expect(src).not.toContain('Fulfilment not yet available for this result.');
    });
  });

  // ── §9 Reduce lower-page recommendation density ──
  describe('recommendation density', () => {
    it('does not render generic duplicate recommendation rails', () => {
      // The old code mapped railSections (filtered recommendation
      // sections). The new code only renders seenInLooksSection.
      expect(src).not.toContain('railSections.map');
    });

    it('retains one related-auctions rail', () => {
      expect(src).toContain('CommerceRelatedRail');
      // Heading is now contextual with the category name, but the
      // fallback label and the rail component must still be present.
      expect(src).toMatch(/More\s+auctions|More\s+.*auctions/);
    });

    it('retains one Seen in Looks rail', () => {
      expect(src).toContain('seenInLooksSection');
    });
  });
});
