import { describe, expect, it } from 'vitest';
import {
  type MarketAuction,
  type AuctionDetail,
  type AuctionViewerState,
  type AuctionLifecycle,
  type AuctionSortMode,
  type MyAuctionBid,
  type CreateAuctionInput,
  type PlaceAuctionBidInput,
} from '../services/marketApi';

describe('auction contract types', () => {
  it('MarketAuction has viewer state and seller object', () => {
    const auction: MarketAuction = {
      id: 'auc_1',
      listingId: 'list_1',
      seller: {
        id: 'seller_1',
        username: 'selleruser',
        displayName: 'Seller User',
        avatarUrl: null,
      },
      title: 'Test Auction',
      imageUrl: null,
      brand: 'Nike',
      category: 'Sneakers',
      conditionLabel: 'New',
      startsAt: '2025-01-01T00:00:00Z',
      endsAt: '2025-01-01T06:00:00Z',
      startingBidGbp: 10,
      currentBidGbp: 25,
      minimumNextBidGbp: 26,
      buyNowPriceGbp: null,
      bidCount: 3,
      lifecycle: 'live',
      viewerState: 'leading',
      isWatched: false,
      createdAt: '2025-01-01T00:00:00Z',
    };

    expect(auction.seller.id).toBe('seller_1');
    expect(auction.viewerState).toBe('leading');
    expect(auction.lifecycle).toBe('live');
    expect(auction.minimumNextBidGbp).toBe(26);
  });

  it('AuctionViewerState covers all canonical states', () => {
    const states: AuctionViewerState[] = [
      'not_participating',
      'watching',
      'leading',
      'outbid',
      'won',
      'lost',
      'seller',
    ];
    expect(states).toHaveLength(7);
  });

  it('AuctionLifecycle covers all lifecycle phases', () => {
    const phases: AuctionLifecycle[] = ['upcoming', 'live', 'ended'];
    expect(phases).toHaveLength(3);
  });

  it('AuctionSortMode covers all sort options', () => {
    const sorts: AuctionSortMode[] = ['endingSoon', 'newest', 'mostBids', 'priceLow', 'priceHigh'];
    expect(sorts).toHaveLength(5);
  });

  it('AuctionDetail includes settlement and cancellation fields', () => {
    const detail: AuctionDetail = {
      id: 'auc_1',
      listingId: 'list_1',
      seller: { id: 's1', username: 'seller', displayName: null, avatarUrl: null },
      title: 'Test',
      imageUrl: null,
      brand: null,
      category: null,
      conditionLabel: null,
      description: null,
      listingPriceGbp: 50,
      startsAt: '2025-01-01T00:00:00Z',
      endsAt: '2025-01-01T06:00:00Z',
      startingBidGbp: 10,
      currentBidGbp: 30,
      minimumNextBidGbp: 31,
      buyNowPriceGbp: 100,
      bidCount: 5,
      lifecycle: 'ended',
      viewerState: 'won',
      isWatched: true,
      winnerBidderId: 'bidder_1',
      settledAt: '2025-01-01T06:01:00Z',
      cancelledAt: null,
      createdAt: '2025-01-01T00:00:00Z',
    };

    expect(detail.winnerBidderId).toBe('bidder_1');
    expect(detail.settledAt).not.toBeNull();
    expect(detail.cancelledAt).toBeNull();
  });

  it('MyAuctionBid has bidState derived from server', () => {
    const bid: MyAuctionBid = {
      id: 1,
      auctionId: 'auc_1',
      amountGbp: 25,
      createdAt: '2025-01-01T01:00:00Z',
      bidState: 'leading',
      auction: {
        id: 'auc_1',
        title: 'Test',
        imageUrl: null,
        currentBidGbp: 25,
        bidCount: 3,
        lifecycle: 'live',
        sellerId: 's1',
        sellerUsername: 'seller',
        endsAt: '2025-01-01T06:00:00Z',
      },
    };

    expect(bid.bidState).toBe('leading');
    expect(bid.auction.lifecycle).toBe('live');
  });
});

describe('auction API payload contracts', () => {
  it('CreateAuctionInput does not accept sellerId', () => {
    const input: CreateAuctionInput = {
      listingId: 'list_1',
      startsAt: '2025-01-01T00:00:00Z',
      endsAt: '2025-01-01T06:00:00Z',
      startingBidGbp: 10,
      idempotencyKey: 'idem_123',
    };

    expect(input).not.toHaveProperty('sellerId');
    expect(input.idempotencyKey).toBe('idem_123');
  });

  it('PlaceAuctionBidInput does not accept bidderId', () => {
    const input: PlaceAuctionBidInput = {
      amountGbp: 25,
      idempotencyKey: 'idem_456',
    };

    expect(input).not.toHaveProperty('bidderId');
    expect(input.idempotencyKey).toBe('idem_456');
  });
});
