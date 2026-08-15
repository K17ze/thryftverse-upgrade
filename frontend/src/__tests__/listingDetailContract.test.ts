import { describe, it, expect } from 'vitest';
import {
  buildSellerTrustSummary,
  buildCommerceContext,
  buildEngagementSummary,
  buildCapabilities,
  buildListingDetail,
  detectCommerceTier,
} from '../platform/product/listingDetailContract';
import { Listing, ListingSeller } from '../domain/listing';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'test-1',
    title: 'Test Item',
    brand: 'TestBrand',
    size: 'M',
    condition: 'Very good',
    price: 50,
    priceWithProtection: 53.2,
    images: ['https://example.com/img1.jpg'],
    likes: 10,
    isSold: false,
    status: 'active',
    sellerId: 'seller-1',
    seller: {
      id: 'seller-1',
      username: 'TestSeller',
      avatar: null,
      rating: 4.5,
      reviewCount: 12,
      location: 'London',
    },
    category: 'tops',
    subcategory: 'Clothing',
    description: 'A test item description',
    createdAt: '2024-01-01',
    ...overrides,
  };
}

describe('listingDetailContract', () => {
  describe('buildSellerTrustSummary', () => {
    it('returns null for null seller', () => {
      expect(buildSellerTrustSummary(null)).toBeNull();
    });

    it('returns null for undefined seller', () => {
      expect(buildSellerTrustSummary(undefined)).toBeNull();
    });

    it('maps basic seller fields', () => {
      const seller: ListingSeller = {
        id: 's1',
        username: 'Seller1',
        avatar: 'https://example.com/avatar.jpg',
        rating: 4.8,
        reviewCount: 25,
        location: 'Paris',
      };
      const result = buildSellerTrustSummary(seller);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('s1');
      expect(result!.username).toBe('Seller1');
      expect(result!.rating).toBe(4.8);
      expect(result!.reviewCount).toBe(25);
      expect(result!.location).toBe('Paris');
    });

    it('merges extras', () => {
      const seller: ListingSeller = {
        id: 's1',
        username: 'Seller1',
        avatar: null,
        rating: null,
        reviewCount: null,
        location: null,
      };
      const result = buildSellerTrustSummary(seller, {
        verified: true,
        completedSales: 100,
        badges: ['Top Seller'],
      });
      expect(result!.verified).toBe(true);
      expect(result!.completedSales).toBe(100);
      expect(result!.badges).toEqual(['Top Seller']);
    });
  });

  describe('buildCommerceContext', () => {
    it('returns itemPrice and currency from listing, no client-side fee derivation', () => {
      const listing = makeListing({ price: 50, priceWithProtection: 53.2 });
      const commerce = buildCommerceContext(listing);
      expect(commerce.itemPrice).toBe(50);
      expect(commerce.buyerProtectionFee).toBeUndefined();
      expect(commerce.estimatedTotal).toBeUndefined();
      expect(commerce.currency).toBe('GBP');
    });

    it('does not provide a default protection policy (server-owned)', () => {
      const listing = makeListing();
      const commerce = buildCommerceContext(listing);
      expect(commerce.protectionPolicy).toBeNull();
    });

    it('accepts server-provided buyerProtectionFee and estimatedTotal via extras', () => {
      const listing = makeListing({ price: 50 });
      const commerce = buildCommerceContext(listing, {
        buyerProtectionFee: 3.2,
        estimatedTotal: 53.2,
        protectionPolicy: {
          available: true,
          label: 'Buyer Protection',
          summary: 'Covered by Thryftverse Buyer Protection.',
        },
      });
      expect(commerce.buyerProtectionFee).toBe(3.2);
      expect(commerce.estimatedTotal).toBe(53.2);
      expect(commerce.protectionPolicy).not.toBeNull();
      expect(commerce.protectionPolicy!.available).toBe(true);
      expect(commerce.protectionPolicy!.label).toBe('Buyer Protection');
    });

    it('handles listing without priceWithProtection', () => {
      const listing = makeListing({ price: 30, priceWithProtection: undefined });
      const commerce = buildCommerceContext(listing);
      expect(commerce.itemPrice).toBe(30);
      expect(commerce.buyerProtectionFee).toBeUndefined();
      expect(commerce.estimatedTotal).toBeUndefined();
    });

    it('merges extras', () => {
      const listing = makeListing();
      const commerce = buildCommerceContext(listing, {
        shippingMethod: 'Tracked',
        shippingPayer: 'seller',
        estimatedDeliveryStart: '2024-02-01',
        estimatedDeliveryEnd: '2024-02-05',
      });
      expect(commerce.shippingMethod).toBe('Tracked');
      expect(commerce.shippingPayer).toBe('seller');
      expect(commerce.estimatedDeliveryStart).toBe('2024-02-01');
    });
  });

  describe('buildEngagementSummary', () => {
    it('maps likes and views', () => {
      const listing = makeListing({ likes: 42, views: 100 });
      const engagement = buildEngagementSummary(listing);
      expect(engagement.likes).toBe(42);
      expect(engagement.views).toBe(100);
    });

    it('omits zero values', () => {
      const listing = makeListing({ likes: 0, views: 0 });
      const engagement = buildEngagementSummary(listing);
      expect(engagement.likes).toBeUndefined();
      expect(engagement.views).toBeUndefined();
    });
  });

  describe('buildCapabilities', () => {
    it('returns correct capabilities for non-owner buyer', () => {
      const listing = makeListing({ sellerId: 'seller-1', isSold: false });
      const caps = buildCapabilities(listing, 'user-1');
      expect(caps.isOwner).toBe(false);
      expect(caps.canBuy).toBe(true);
      expect(caps.canOffer).toBe(true);
      expect(caps.canEdit).toBe(false);
      expect(caps.canManage).toBe(false);
      expect(caps.canMessage).toBe(true);
      expect(caps.isSold).toBe(false);
      expect(caps.isAvailable).toBe(true);
    });

    it('returns correct capabilities for owner', () => {
      const listing = makeListing({ sellerId: 'seller-1', isSold: false });
      const caps = buildCapabilities(listing, 'seller-1');
      expect(caps.isOwner).toBe(true);
      expect(caps.canBuy).toBe(false);
      expect(caps.canOffer).toBe(false);
      expect(caps.canEdit).toBe(true);
      expect(caps.canManage).toBe(true);
      expect(caps.canMessage).toBe(false);
    });

    it('returns correct capabilities for sold item', () => {
      const listing = makeListing({ sellerId: 'seller-1', isSold: true, status: 'sold' });
      const caps = buildCapabilities(listing, 'user-1');
      expect(caps.isSold).toBe(true);
      expect(caps.isAvailable).toBe(false);
      expect(caps.canBuy).toBe(false);
      expect(caps.canOffer).toBe(false);
    });

    it('handles missing currentUserId', () => {
      const listing = makeListing({ sellerId: 'seller-1' });
      const caps = buildCapabilities(listing);
      expect(caps.isOwner).toBe(false);
      expect(caps.canBuy).toBe(true);
    });

    it('fails closed when lifecycle truth is missing', () => {
      const listing = makeListing({ status: undefined, isSold: false });
      const caps = buildCapabilities(listing, 'user-1');
      expect(caps.canBuy).toBe(false);
      expect(caps.canOffer).toBe(false);
      expect(caps.isAvailable).toBe(false);
      expect(caps.unavailableReason).toBe('status_unknown');
    });
  });

  describe('detectCommerceTier', () => {
    it('returns brokered for cars regardless of price', () => {
      expect(detectCommerceTier('cars', 200)).toBe('brokered');
      expect(detectCommerceTier('cars-luxury', 5000000)).toBe('brokered');
    });

    it('returns brokered for yachts regardless of price', () => {
      expect(detectCommerceTier('yachts', 100)).toBe('brokered');
      expect(detectCommerceTier('yachts-motor', 4000000)).toBe('brokered');
    });

    it('returns specialist for art/collectibles', () => {
      expect(detectCommerceTier('art', 500)).toBe('specialist');
      expect(detectCommerceTier('collectibles', 50000)).toBe('specialist');
    });

    it('returns authenticated_luxury for bags at £10,000+', () => {
      expect(detectCommerceTier('women-bags', 10000)).toBe('authenticated_luxury');
      expect(detectCommerceTier('women-bags', 50000)).toBe('authenticated_luxury');
    });

    it('returns authenticated_luxury for watches at £10,000+', () => {
      expect(detectCommerceTier('designer-watches', 20000)).toBe('authenticated_luxury');
    });

    it('returns authenticated_luxury for jewellery at £10,000+', () => {
      expect(detectCommerceTier('designer-jewellery', 15000)).toBe('authenticated_luxury');
    });

    it('returns standard for bags below £10,000', () => {
      expect(detectCommerceTier('women-bags', 9999)).toBe('standard');
      expect(detectCommerceTier('women-bags', 500)).toBe('standard');
    });

    it('returns standard for watches below £10,000', () => {
      expect(detectCommerceTier('designer-watches', 9999)).toBe('standard');
    });

    it('returns standard for non-luxury categories regardless of price', () => {
      expect(detectCommerceTier('women-clothing', 50000)).toBe('standard');
      expect(detectCommerceTier('electronics', 50000)).toBe('standard');
    });

    it('returns standard for empty/unknown category', () => {
      expect(detectCommerceTier('', 100)).toBe('standard');
      expect(detectCommerceTier('unknown', 100000)).toBe('standard');
    });
  });

  describe('buildListingDetail', () => {
    it('assembles all parts correctly', () => {
      const listing = makeListing();
      const detail = buildListingDetail(listing, 'user-1');
      expect(detail.listing).toBe(listing);
      expect(detail.seller).not.toBeNull();
      expect(detail.seller!.id).toBe('seller-1');
      expect(detail.commerce.itemPrice).toBe(50);
      expect(detail.commerce.buyerProtectionFee).toBeUndefined();
      expect(detail.capabilities.isOwner).toBe(false);
      expect(detail.capabilities.canBuy).toBe(true);
      expect(detail.engagement.likes).toBe(10);
    });
  });
});
