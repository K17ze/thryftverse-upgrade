import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');
const HOOKS = resolve(__dirname, '../hooks');
const SERVICES = resolve(__dirname, '../services');
const UTILS = resolve(__dirname, '../utils');

function readScreen(name: string): string {
  return readFileSync(resolve(SCREENS, name), 'utf-8');
}

function readComponent(relPath: string): string {
  return readFileSync(resolve(COMPONENTS, relPath), 'utf-8');
}

function readHook(relPath: string): string {
  return readFileSync(resolve(HOOKS, relPath), 'utf-8');
}

function readService(name: string): string {
  return readFileSync(resolve(SERVICES, name), 'utf-8');
}

function readUtil(name: string): string {
  return readFileSync(resolve(UTILS, name), 'utf-8');
}

describe('auction-detail flagship closure (spec 02_AUCTION)', () => {
  const src = readScreen('AuctionDetailScreen.tsx');
  const marketApi = readService('marketApi.ts');
  const logic = readUtil('auctionDetailLogic.ts');
  // The screen was decomposed — AuctionDetailScreen.tsx is now an
  // orchestrator. Positive assertions below check the owner layer where
  // the code actually lives, not the orchestrator:
  //   auctiondetail/AuctionDetailHero        — media stage + identity
  //   auctiondetail/AuctionBidPanel          — transaction surface
  //   auctiondetail/AuctionDetailDock        — dock incl. terminal action
  //   auctiondetail/AuctionDetailInfoSections— Item details + bid activity
  //   auctiondetail/AuctionDetailDiscovery   — related rail + seen-in-looks
  //   auction/AuctionTerminalResult          — terminal result module
  //   hooks/auctiondetail/useAuctionDetailPresentation — media derivation
  const hero = readComponent('auctiondetail/AuctionDetailHero.tsx');
  const bidPanel = readComponent('auctiondetail/AuctionBidPanel.tsx');
  const dock = readComponent('auctiondetail/AuctionDetailDock.tsx');
  const infoSections = readComponent('auctiondetail/AuctionDetailInfoSections.tsx');
  const discovery = readComponent('auctiondetail/AuctionDetailDiscovery.tsx');
  const terminalResult = readComponent('auction/AuctionTerminalResult.tsx');
  const presentation = readHook('auctiondetail/useAuctionDetailPresentation.ts');

  // ── §1 Remove duplicated price hierarchy ──
  describe('price hierarchy', () => {
    it('identity does not show price (family="auction")', () => {
      // The identity should not pass primaryValue when family="auction".
      // Owner layer: AuctionDetailHero composes CommerceDetailIdentity.
      const identityMatch = hero.match(/<CommerceDetailIdentity[\s\S]*?\/>/);
      expect(identityMatch).toBeTruthy();
      expect(identityMatch![0]).toContain('family="auction"');
      expect(identityMatch![0]).not.toContain('primaryValue={priceText}');
    });

    it('transaction surface owns the current bid', () => {
      // Owner layer: AuctionBidPanel composes the transaction surface.
      const surfaceMatch = bidPanel.match(/<CommerceDetailTransactionSurface[\s\S]*?\/>/);
      expect(surfaceMatch).toBeTruthy();
      expect(surfaceMatch![0]).toContain('family="auction"');
      expect(surfaceMatch![0]).toContain('primaryValue={priceText}');
    });

    it('dock owns minimum next bid or action state', () => {
      // Owner layer: AuctionDetailDock computes dockValue + label.
      expect(dock).toContain('dockValue');
      expect(dock).toContain('Min next bid');
    });
  });

  // ── §2 Remove duplicated auction family/state treatment ──
  describe('family/state badge', () => {
    it('does not render ProductFamilyBadge in identity', () => {
      // Screen must not re-inline it, and the owner layer (hero, which
      // composes the identity) must not render it either.
      expect(src).not.toContain('ProductFamilyBadge');
      expect(src).not.toContain('familyChip');
      expect(hero).not.toContain('ProductFamilyBadge');
      expect(hero).not.toContain('familyChip');
    });

    it('renders identity in media overlay', () => {
      // Owner layer: AuctionDetailHero wires overlayBottomContent.
      expect(hero).toContain('overlayBottomContent');
      expect(hero).toContain('family="auction"');
    });
  });

  // ── §3 Consolidate bid history ──
  describe('bid history', () => {
    it('uses one presentation pattern (Bid activity)', () => {
      // Owner layer: AuctionDetailInfoSections owns the bid-activity rows.
      expect(infoSections).toContain('Bid activity');
      expect(infoSections).toContain('bidActivityRow');
    });

    it('does not show both a disclosure row and a three-row preview', () => {
      // The old pattern had CommerceDetailDisclosureRow with label="Bid
      // history" inside a "Bid history" section. The new pattern uses
      // a single "Bid activity" section with a latest-bid row. Checked on
      // the orchestrator and the owner layer so neither re-inlines it.
      expect(src).not.toContain('label="Bid history"');
      expect(src).not.toContain('bidPreviewList');
      expect(infoSections).not.toContain('label="Bid history"');
      expect(infoSections).not.toContain('bidPreviewList');
    });

    it('has one View all bids action', () => {
      // Owner layer: AuctionDetailInfoSections owns the action.
      expect(infoSections).toContain('bidActivityViewAll');
      expect(infoSections).toContain('View all');
    });
  });

  // ── §4 Eliminate terminal-state duplication ──
  describe('terminal state', () => {
    it('dock does not repeat terminal result message', () => {
      // The dock should not have a stateBadge with the terminal message
      // (the body owns the result). The dock carries the action only.
      // Owner layer: AuctionDetailDock owns the isTerminal branch.
      const terminalStart = dock.indexOf('if (isTerminal)');
      const terminalEnd = dock.indexOf('// ── Post-end lifecycle states ──', terminalStart);
      const dockSection = dock.slice(terminalStart, terminalEnd);
      expect(terminalStart).toBeGreaterThan(-1);
      expect(terminalEnd).toBeGreaterThan(terminalStart);
      expect(dockSection).toContain('primaryAction={terminalAction}');
      expect(dockSection).not.toContain('terminalMessage');
      expect(dockSection).not.toContain('stateBadge');
    });

    it('body owns detailed terminal result', () => {
      // Owner layer: the terminal result module was extracted to
      // components/auction/AuctionTerminalResult.tsx, composed by the
      // screen. Check the owner layer for the module + copy.
      expect(src).toContain('AuctionTerminalResult');
      expect(terminalResult).toContain('terminalResultModule');
      expect(terminalResult).toContain('You won');
      expect(terminalResult).toContain('Auction closed');
    });
  });

  // ── §5 Coherent Item Details section ──
  describe('item details section', () => {
    it('wraps description and evidence in one Item details section', () => {
      // Owner layer: AuctionDetailInfoSections owns the section.
      expect(infoSections).toContain('label="Item details"');
      expect(infoSections).toContain('variant="editorial"');
    });

    it('includes condition row inside Item details', () => {
      // Owner layer: AuctionDetailInfoSections owns the rows.
      expect(infoSections).toContain('itemDetailRow');
      expect(infoSections).toContain('Condition');
    });
  });

  // ── §6 Compact dock geometry ──
  describe('compact dock geometry', () => {
    it('Buy Now button label does not include price', () => {
      // The old label was `Buy Now · £X`. The new label is just "Buy now".
      // Owner layer: AuctionDetailDock owns the dock actions.
      expect(dock).not.toContain('Buy Now ·');
      expect(dock).toMatch(/label:.*'Buy now'/);
    });

    it('uses compact button labels', () => {
      // Owner layer: AuctionDetailDock owns the action labels.
      expect(dock).toContain('Place bid');
      expect(dock).toContain('Bid again');
    });
  });

  // ── §7 Multi-media support ──
  describe('multi-media support', () => {
    it('uses auctionMediaItems derived from the canonical image/video array', () => {
      expect(src).toContain('auctionMediaItems');
      expect(src).toContain('fullscreenMediaIndex');
      expect(logic).toContain('mediaItems');
      expect(logic).toContain('posterUri');
      expect(logic).toContain('focalPoint');
      expect(logic).not.toContain(".filter((m) => m.type === 'image')");
    });

    it('falls back to imageUrl for compatibility', () => {
      // Owner layer: useAuctionDetailPresentation maps auction.imageUrl
      // into auctionMediaItems as the compatibility fallback.
      expect(presentation).toContain('auction.imageUrl');
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
      // Owner layer: AuctionDetailDock maps fulfilment into terminal
      // actions (View order etc.).
      expect(dock).toContain('auctionFulfilment');
      expect(dock).toContain('buyerNextAction');
      expect(dock).toContain('sellerNextAction');
    });

    it('does not show "Fulfilment not yet available" as the final state', () => {
      expect(src).not.toContain('Fulfilment not yet available for this result.');
      expect(dock).not.toContain('Fulfilment not yet available for this result.');
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
      // Owner layer: AuctionDetailDiscovery owns the related rail.
      expect(discovery).toContain('CommerceRelatedRail');
      // Heading is now contextual with the category name, but the
      // fallback label and the rail component must still be present.
      expect(discovery).toMatch(/More\s+auctions|More\s+.*auctions/);
    });

    it('retains one Seen in Looks rail', () => {
      // Owner layer: AuctionDetailDiscovery owns seenInLooksSection.
      expect(discovery).toContain('seenInLooksSection');
    });
  });
});
