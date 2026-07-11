/**
 * PRODUCT-01 — Unified Flagship Product Detail Contract tests
 *
 * Validates:
 * - adapter output for direct / auction / co-own
 * - discriminated family narrowing
 * - family capability matrices (buyer / owner / seller / issuer / holder / guest)
 * - canonical route resolution
 * - auction lifecycle preservation
 * - co-own holder / non-holder / issuer / closed states
 * - media + attribute derivation
 * - family is never guessed from price / fields / IDs
 */
import { describe, it, expect } from 'vitest';
import {
  buildDirectViewModel,
  buildAuctionViewModel,
  buildCoOwnViewModel,
  isDirectViewModel,
  isAuctionViewModel,
  isCoOwnViewModel,
  resolveDetailRoute,
  mediaFromUris,
  type ProductDetailViewModel,
  type ListingFamily,
} from '../platform/product/productDetailViewModel';
import type { Listing } from '../data/mockData';
import type {
  AuctionDetail,
  MarketCoOwnAsset,
  CoOwnOrderBookEntry,
} from '../services/marketApi';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseListing: Listing = {
  id: 'list_001',
  title: 'Vintage Denim Jacket',
  brand: 'Levi\'s',
  size: 'M',
  condition: 'Very good',
  price: 45.0,
  originalPrice: 80.0,
  images: ['https://cdn.example.com/img1.jpg', 'https://cdn.example.com/img2.jpg'],
  likes: 12,
  views: 340,
  sellerId: 'seller_001',
  seller: { id: 'seller_001', username: 'vintage_co', avatar: null },
  category: 'women',
  subcategory: 'Clothing',
  description: 'Classic denim jacket in very good condition.',
  createdAt: '2025-06-01T10:00:00Z',
  shippingMethod: 'Standard',
  shippingPayer: 'buyer',
};

const baseAuction: AuctionDetail = {
  id: 'auc_001',
  listingId: 'list_001',
  seller: { id: 'seller_001', username: 'vintage_co', displayName: 'Vintage Co', avatarUrl: null },
  title: 'Vintage Denim Jacket',
  imageUrl: 'https://cdn.example.com/img1.jpg',
  brand: 'Levi\'s',
  category: 'women',
  conditionLabel: 'Very good',
  description: 'Classic denim jacket.',
  listingPriceGbp: 45.0,
  startsAt: '2025-07-01T10:00:00Z',
  endsAt: '2025-07-07T10:00:00Z',
  startingBidGbp: 20.0,
  currentBidGbp: 35.0,
  minimumNextBidGbp: 37.0,
  buyNowPriceGbp: 60.0,
  reservePriceGbp: null,
  bidCount: 5,
  lifecycle: 'live',
  terminalReason: null,
  viewerState: 'leading',
  isWatched: true,
  winnerBidderId: null,
  settledAt: null,
  cancelledAt: null,
  createdAt: '2025-06-28T10:00:00Z',
};

const baseAsset: MarketCoOwnAsset = {
  id: 'asset_001',
  listingId: 'list_002',
  issuerId: 'issuer_001',
  title: 'Shared Designer Handbag',
  imageUrl: 'https://cdn.example.com/bag.jpg',
  totalUnits: 100,
  availableUnits: 60,
  unitPriceGbp: 12.5,
  unitPriceStable: 15.0,
  settlementMode: 'GBP',
  issuerJurisdiction: 'UK',
  marketMovePct24h: 2.5,
  holders: 8,
  volume24hGbp: 500,
  isOpen: true,
  createdAt: '2025-06-15T10:00:00Z',
  updatedAt: '2025-06-30T10:00:00Z',
};

const orderBook: { bids: CoOwnOrderBookEntry[]; asks: CoOwnOrderBookEntry[] } = {
  bids: [{ side: 'buy', unitPriceGbp: 12.0, units: 10, orderCount: 3 }],
  asks: [{ side: 'sell', unitPriceGbp: 13.0, units: 5, orderCount: 2 }],
};

// ── Direct adapter ───────────────────────────────────────────────────────────

describe('PRODUCT-01 direct adapter', () => {
  it('builds a direct view model with family=direct', () => {
    const vm = buildDirectViewModel({ listing: baseListing, currentUserId: 'buyer_001' });
    expect(vm.family).toBe('direct');
    expect(vm.canonicalListingId).toBe('list_001');
    expect(vm.objectId).toBe('list_001');
    expect(vm.underlyingListingId).toBe('list_001');
  });

  it('sets viewerRole=owner when currentUserId matches sellerId', () => {
    const vm = buildDirectViewModel({ listing: baseListing, currentUserId: 'seller_001' });
    expect(vm.viewerRole).toBe('owner');
    const direct = vm as Extract<typeof vm, { family: 'direct' }>;
    expect(direct.capabilities.canBuy).toBe(false);
    expect(direct.capabilities.canManage).toBe(true);
    expect(direct.capabilities.canEdit).toBe(true);
    expect(direct.capabilities.canMessage).toBe(false);
  });

  it('sets viewerRole=buyer and enables buy/offer for non-owner', () => {
    const vm = buildDirectViewModel({ listing: baseListing, currentUserId: 'buyer_001' });
    expect(vm.viewerRole).toBe('buyer');
    const direct = vm as Extract<typeof vm, { family: 'direct' }>;
    expect(direct.capabilities.canBuy).toBe(true);
    expect(direct.capabilities.canOffer).toBe(true);
    expect(direct.capabilities.canMessage).toBe(true);
    expect(direct.capabilities.canManage).toBe(false);
  });

  it('sets viewerRole=guest when no currentUserId', () => {
    const vm = buildDirectViewModel({ listing: baseListing });
    expect(vm.viewerRole).toBe('guest');
  });

  it('sets availability=sold and suppresses buy when isSold', () => {
    const vm = buildDirectViewModel({
      listing: { ...baseListing, isSold: true },
      currentUserId: 'buyer_001',
    });
    expect(vm.availability).toBe('sold');
    const direct = vm as Extract<typeof vm, { family: 'direct' }>;
    expect(direct.capabilities.canBuy).toBe(false);
    expect(direct.capabilities.canOffer).toBe(false);
  });

  it('derives media from images with correct kind', () => {
    const vm = buildDirectViewModel({
      listing: { ...baseListing, images: ['https://x.com/a.jpg', 'https://x.com/b.mp4'] },
    });
    expect(vm.media).toHaveLength(2);
    expect(vm.media[0].kind).toBe('image');
    expect(vm.media[1].kind).toBe('video');
  });

  it('derives attributes from authoritative fields only', () => {
    const vm = buildDirectViewModel({ listing: baseListing });
    const labels = vm.attributes.map((a) => a.label);
    expect(labels).toContain('Brand');
    expect(labels).toContain('Size');
    expect(labels).toContain('Condition');
    expect(labels).toContain('Category');
  });

  it('basket capability is false (no real basket contract)', () => {
    const vm = buildDirectViewModel({ listing: baseListing, currentUserId: 'buyer_001' });
    const direct = vm as Extract<typeof vm, { family: 'direct' }>;
    expect(direct.capabilities.canBasket).toBe(false);
  });

  it('preserves originalPrice and buyerProtectionTotal', () => {
    const vm = buildDirectViewModel({
      listing: baseListing,
      commerce: {
        itemPrice: 45,
        buyerProtectionFee: 3.5,
        estimatedTotal: 48.5,
        currency: 'GBP',
        shippingMethod: 'Standard',
        shippingPayer: 'buyer',
        protectionPolicy: null,
        returnPolicy: null,
        authenticity: null,
      },
    });
    const direct = vm as Extract<typeof vm, { family: 'direct' }>;
    expect(direct.originalPrice).toBe(80.0);
    expect(direct.buyerProtectionTotal).toBe(48.5);
  });
});

// ── Auction adapter ──────────────────────────────────────────────────────────

describe('PRODUCT-01 auction adapter', () => {
  it('builds an auction view model with family=auction', () => {
    const vm = buildAuctionViewModel({ auction: baseAuction, currentUserId: 'bidder_001' });
    expect(vm.family).toBe('auction');
    expect(vm.canonicalListingId).toBe('list_001');
    expect(vm.objectId).toBe('auc_001');
    expect(vm.underlyingListingId).toBe('list_001');
  });

  it('uses listingId as recommendationSeedId (not auctionId)', () => {
    const vm = buildAuctionViewModel({ auction: baseAuction });
    expect(vm.recommendationSeedId).toBe('list_001');
  });

  it('preserves auction lifecycle and terminal fields exactly', () => {
    const vm = buildAuctionViewModel({ auction: baseAuction });
    const auction = vm as Extract<typeof vm, { family: 'auction' }>;
    expect(auction.lifecycle).toBe('live');
    expect(auction.startsAt).toBe(baseAuction.startsAt);
    expect(auction.endsAt).toBe(baseAuction.endsAt);
    expect(auction.startingBidGbp).toBe(20.0);
    expect(auction.currentBidGbp).toBe(35.0);
    expect(auction.minimumNextBidGbp).toBe(37.0);
    expect(auction.bidCount).toBe(5);
    expect(auction.viewerState).toBe('leading');
    expect(auction.buyNowPriceGbp).toBe(60.0);
    expect(auction.isWatched).toBe(true);
    expect(auction.terminalReason).toBe(null);
    expect(auction.settledAt).toBe(null);
    expect(auction.cancelledAt).toBe(null);
  });

  it('enables canBid for live non-seller, disables for seller', () => {
    const buyerVm = buildAuctionViewModel({
      auction: baseAuction,
      currentUserId: 'bidder_001',
    });
    expect((buyerVm as Extract<typeof buyerVm, { family: 'auction' }>).capabilities.canBid).toBe(true);

    const sellerVm = buildAuctionViewModel({
      auction: { ...baseAuction, viewerState: 'seller' },
      currentUserId: 'seller_001',
    });
    expect((sellerVm as Extract<typeof sellerVm, { family: 'auction' }>).capabilities.canBid).toBe(false);
    expect((sellerVm as Extract<typeof sellerVm, { family: 'auction' }>).capabilities.canManage).toBe(true);
  });

  it('disables canBid for terminal states (ended/cancelled/settled)', () => {
    for (const lifecycle of ['ended', 'cancelled', 'settled'] as const) {
      const vm = buildAuctionViewModel({ auction: { ...baseAuction, lifecycle } });
      expect((vm as Extract<typeof vm, { family: 'auction' }>).capabilities.canBid).toBe(false);
    }
  });

  it('disables canBid for upcoming (not yet live)', () => {
    const vm = buildAuctionViewModel({ auction: { ...baseAuction, lifecycle: 'upcoming' } });
    expect((vm as Extract<typeof vm, { family: 'auction' }>).capabilities.canBid).toBe(false);
  });

  it('offer capability is separate from bid and disabled by default', () => {
    const vm = buildAuctionViewModel({ auction: baseAuction });
    const auction = vm as Extract<typeof vm, { family: 'auction' }>;
    expect(auction.capabilities.canOffer).toBe(false);
    // Even when offersEnabled, seller cannot offer
    const sellerVm = buildAuctionViewModel({
      auction: { ...baseAuction, viewerState: 'seller' },
      offersEnabled: true,
    });
    expect((sellerVm as Extract<typeof sellerVm, { family: 'auction' }>).capabilities.canOffer).toBe(false);
  });

  it('enables offer when offersEnabled and non-seller non-terminal', () => {
    const vm = buildAuctionViewModel({ auction: baseAuction, offersEnabled: true });
    expect((vm as Extract<typeof vm, { family: 'auction' }>).capabilities.canOffer).toBe(true);
  });

  it('watch capability is separate from like (auction-specific)', () => {
    const vm = buildAuctionViewModel({ auction: baseAuction });
    const auction = vm as Extract<typeof vm, { family: 'auction' }>;
    expect(auction.capabilities.canWatch).toBe(true);
    // Seller cannot watch own auction
    const sellerVm = buildAuctionViewModel({ auction: { ...baseAuction, viewerState: 'seller' } });
    expect((sellerVm as Extract<typeof sellerVm, { family: 'auction' }>).capabilities.canWatch).toBe(false);
  });
});

// ── Co-own adapter ───────────────────────────────────────────────────────────

describe('PRODUCT-01 co-own adapter', () => {
  it('builds a co-own view model with family=co_own', () => {
    const vm = buildCoOwnViewModel({
      asset: baseAsset,
      viewerUnits: 0,
      currentUserId: 'buyer_001',
    });
    expect(vm.family).toBe('co_own');
    expect(vm.canonicalListingId).toBe('list_002');
    expect(vm.objectId).toBe('asset_001');
  });

  it('non-holder viewerRole=buyer, can buy units', () => {
    const vm = buildCoOwnViewModel({
      asset: baseAsset,
      viewerUnits: 0,
      currentUserId: 'buyer_001',
    });
    expect(vm.viewerRole).toBe('buyer');
    const coOwn = vm as Extract<typeof vm, { family: 'co_own' }>;
    expect(coOwn.capabilities.canBuyUnits).toBe(true);
    expect(coOwn.capabilities.canSellUnits).toBe(false);
    expect(coOwn.viewerOwnershipPct).toBe(0);
  });

  it('holder viewerRole=holder, can sell units, ownership pct correct', () => {
    const vm = buildCoOwnViewModel({
      asset: baseAsset,
      viewerUnits: 25,
      currentUserId: 'buyer_001',
    });
    expect(vm.viewerRole).toBe('holder');
    const coOwn = vm as Extract<typeof vm, { family: 'co_own' }>;
    expect(coOwn.capabilities.canBuyUnits).toBe(true);
    expect(coOwn.capabilities.canSellUnits).toBe(true);
    expect(coOwn.viewerOwnershipPct).toBe(25);
    expect(coOwn.viewerUnits).toBe(25);
  });

  it('issuer viewerRole=issuer, no buy/sell, can manage', () => {
    const vm = buildCoOwnViewModel({
      asset: baseAsset,
      viewerUnits: 0,
      currentUserId: 'issuer_001',
    });
    expect(vm.viewerRole).toBe('issuer');
    const coOwn = vm as Extract<typeof vm, { family: 'co_own' }>;
    expect(coOwn.capabilities.canBuyUnits).toBe(false);
    expect(coOwn.capabilities.canSellUnits).toBe(false);
    expect(coOwn.capabilities.canManage).toBe(true);
    expect(coOwn.capabilities.canMessageIssuer).toBe(false);
  });

  it('closed asset: availability=closed, no buy/sell', () => {
    const vm = buildCoOwnViewModel({
      asset: { ...baseAsset, isOpen: false },
      viewerUnits: 10,
      currentUserId: 'buyer_001',
    });
    expect(vm.availability).toBe('closed');
    const coOwn = vm as Extract<typeof vm, { family: 'co_own' }>;
    expect(coOwn.capabilities.canBuyUnits).toBe(false);
    expect(coOwn.capabilities.canSellUnits).toBe(false);
  });

  it('unavailable (0 units): availability=unavailable, no buy', () => {
    const vm = buildCoOwnViewModel({
      asset: { ...baseAsset, availableUnits: 0 },
      viewerUnits: 0,
      currentUserId: 'buyer_001',
    });
    expect(vm.availability).toBe('unavailable');
    const coOwn = vm as Extract<typeof vm, { family: 'co_own' }>;
    expect(coOwn.capabilities.canBuyUnits).toBe(false);
  });

  it('order book summary is derived correctly', () => {
    const vm = buildCoOwnViewModel({
      asset: baseAsset,
      viewerUnits: 0,
      orderBook,
    });
    const coOwn = vm as Extract<typeof vm, { family: 'co_own' }>;
    expect(coOwn.orderBook).not.toBeNull();
    expect(coOwn.orderBook!.bestBid?.unitPriceGbp).toBe(12.0);
    expect(coOwn.orderBook!.bestAsk?.unitPriceGbp).toBe(13.0);
    expect(coOwn.orderBook!.bidDepth).toBe(1);
    expect(coOwn.orderBook!.askDepth).toBe(1);
  });

  it('null order book yields null summary', () => {
    const vm = buildCoOwnViewModel({
      asset: baseAsset,
      viewerUnits: 0,
      orderBook: null,
    });
    const coOwn = vm as Extract<typeof vm, { family: 'co_own' }>;
    expect(coOwn.orderBook).toBeNull();
  });

  it('preserves settlement mode and financial truth', () => {
    const vm = buildCoOwnViewModel({ asset: baseAsset, viewerUnits: 0 });
    const coOwn = vm as Extract<typeof vm, { family: 'co_own' }>;
    expect(coOwn.settlementMode).toBe('GBP');
    expect(coOwn.totalUnits).toBe(100);
    expect(coOwn.availableUnits).toBe(60);
    expect(coOwn.holders).toBe(8);
    expect(coOwn.marketMovePct24h).toBe(2.5);
    expect(coOwn.volume24hGbp).toBe(500);
  });
});

// ── Family narrowing ─────────────────────────────────────────────────────────

describe('PRODUCT-01 family narrowing', () => {
  const directVm = buildDirectViewModel({ listing: baseListing });
  const auctionVm = buildAuctionViewModel({ auction: baseAuction });
  const coOwnVm = buildCoOwnViewModel({ asset: baseAsset, viewerUnits: 0 });

  it('isDirectViewModel narrows direct only', () => {
    expect(isDirectViewModel(directVm)).toBe(true);
    expect(isDirectViewModel(auctionVm)).toBe(false);
    expect(isDirectViewModel(coOwnVm)).toBe(false);
  });

  it('isAuctionViewModel narrows auction only', () => {
    expect(isAuctionViewModel(auctionVm)).toBe(true);
    expect(isAuctionViewModel(directVm)).toBe(false);
    expect(isAuctionViewModel(coOwnVm)).toBe(false);
  });

  it('isCoOwnViewModel narrows co-own only', () => {
    expect(isCoOwnViewModel(coOwnVm)).toBe(true);
    expect(isCoOwnViewModel(directVm)).toBe(false);
    expect(isCoOwnViewModel(auctionVm)).toBe(false);
  });

  it('narrowed vm exposes family-specific fields', () => {
    expect(isDirectViewModel(directVm) && directVm.itemPrice).toBe(45.0);
    expect(isAuctionViewModel(auctionVm) && auctionVm.currentBidGbp).toBe(35.0);
    expect(isCoOwnViewModel(coOwnVm) && coOwnVm.unitPriceGbp).toBe(12.5);
  });
});

// ── Route resolution ─────────────────────────────────────────────────────────

describe('PRODUCT-01 route resolution', () => {
  it('direct family resolves to ItemDetail with itemId', () => {
    const res = resolveDetailRoute('direct', 'list_001');
    expect(res.route).toBe('ItemDetail');
    expect(res.params).toEqual({ itemId: 'list_001' });
  });

  it('auction family resolves to AuctionDetail with auctionId', () => {
    const res = resolveDetailRoute('auction', 'auc_001');
    expect(res.route).toBe('AuctionDetail');
    expect(res.params).toEqual({ auctionId: 'auc_001' });
  });

  it('co-own family resolves to AssetDetail with assetId', () => {
    const res = resolveDetailRoute('co_own', 'asset_001');
    expect(res.route).toBe('AssetDetail');
    expect(res.params).toEqual({ assetId: 'asset_001' });
  });

  it('all families produce valid routes', () => {
    const families: ListingFamily[] = ['direct', 'auction', 'co_own'];
    for (const f of families) {
      const res = resolveDetailRoute(f, 'test_id');
      expect(['ItemDetail', 'AuctionDetail', 'AssetDetail']).toContain(res.route);
    }
  });
});

// ── Media helpers ────────────────────────────────────────────────────────────

describe('PRODUCT-01 media helpers', () => {
  it('mediaFromUris classifies images and videos', () => {
    const media = mediaFromUris(['https://x.com/a.jpg', 'https://x.com/b.mp4', 'https://x.com/c.mov']);
    expect(media).toHaveLength(3);
    expect(media[0].kind).toBe('image');
    expect(media[1].kind).toBe('video');
    expect(media[2].kind).toBe('video');
  });

  it('mediaFromUris filters empty URIs', () => {
    const media = mediaFromUris(['', 'https://x.com/a.jpg', '']);
    expect(media).toHaveLength(1);
  });

  it('mediaFromUris returns empty for empty input', () => {
    expect(mediaFromUris([])).toEqual([]);
  });
});

// ── Family is never guessed ──────────────────────────────────────────────────

describe('PRODUCT-01 family is authoritative, not guessed', () => {
  it('direct adapter always sets family=direct regardless of price', () => {
    const freeVm = buildDirectViewModel({ listing: { ...baseListing, price: 0 } });
    const expensiveVm = buildDirectViewModel({ listing: { ...baseListing, price: 99999 } });
    expect(freeVm.family).toBe('direct');
    expect(expensiveVm.family).toBe('direct');
  });

  it('auction adapter always sets family=auction regardless of price', () => {
    const zeroBidVm = buildAuctionViewModel({ auction: { ...baseAuction, currentBidGbp: 0, startingBidGbp: 0 } });
    expect(zeroBidVm.family).toBe('auction');
  });

  it('co-own adapter always sets family=co_own regardless of price', () => {
    const zeroPriceVm = buildCoOwnViewModel({ asset: { ...baseAsset, unitPriceGbp: 0 }, viewerUnits: 0 });
    expect(zeroPriceVm.family).toBe('co_own');
  });
});
