import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '..');
const BACKEND = resolve(__dirname, '..', '..', '..', 'backend', 'api', 'src');

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return existsSync(resolve(SRC, rel));
}

describe('VQ-08A Product Detail Page Revamp', () => {
  describe('Data contract files exist', () => {
    it('listingDetailContract.ts exists', () => {
      expect(exists('platform/product/listingDetailContract.ts')).toBe(true);
    });

    it('recommendationTypes.ts exists', () => {
      expect(exists('platform/product/recommendationTypes.ts')).toBe(true);
    });

    it('recommendationService.ts exists', () => {
      expect(exists('platform/product/recommendationService.ts')).toBe(true);
    });

    it('useListingQueries.ts exists', () => {
      expect(exists('platform/product/useListingQueries.ts')).toBe(true);
    });

    it('productAnalytics.ts exists', () => {
      expect(exists('platform/product/productAnalytics.ts')).toBe(true);
    });

    it('product barrel index.ts exists', () => {
      expect(exists('platform/product/index.ts')).toBe(true);
    });
  });

  describe('Component files exist', () => {
    const components = [
      'ProductMediaGallery',
      'FullscreenMediaViewer',
      'ProductDetailHeader',
      'ProductIdentitySummary',
      'ProductAttributeChips',
      'ProductDescription',
      'ProductCommerceSummary',
      'ProductPolicySheet',
      'SellerTrustCard',
      'RecommendationRail',
      'SeenInLooksRail',
      'DiscoveryGrid',
      'ProductActionBar',
      'ProductDetailSkeleton',
      'ProductErrorState',
    ];

    for (const comp of components) {
      it(`${comp}.tsx exists`, () => {
        expect(exists(`components/product/${comp}.tsx`)).toBe(true);
      });
    }

    it('product components barrel index.ts exists', () => {
      expect(exists('components/product/index.ts')).toBe(true);
    });
  });

  describe('ItemDetailScreen uses new components', () => {
    const screen = read('screens/ItemDetailScreen.tsx');

    it('imports from components/product barrel', () => {
      expect(screen).toContain("from '../components/product'");
    });

    it('imports from platform/product', () => {
      expect(screen).toContain("from '../platform/product'");
    });

    it('uses ProductMediaGallery', () => {
      expect(screen).toContain('ProductMediaGallery');
    });

    it('uses ProductCommerceSummary', () => {
      expect(screen).toContain('ProductCommerceSummary');
    });

    it('uses SellerTrustCard', () => {
      expect(screen).toContain('SellerTrustCard');
    });

    it('uses RecommendationRail', () => {
      expect(screen).toContain('RecommendationRail');
    });

    it('uses SeenInLooksRail', () => {
      expect(screen).toContain('SeenInLooksRail');
    });

    it('uses DiscoveryGrid', () => {
      expect(screen).toContain('DiscoveryGrid');
    });

    it('uses ProductActionBar', () => {
      expect(screen).toContain('ProductActionBar');
    });

    it('uses ProductDetailSkeleton for loading', () => {
      expect(screen).toContain('ProductDetailSkeleton');
    });

    it('uses ProductErrorState for errors', () => {
      expect(screen).toContain('ProductErrorState');
    });

    it('uses FullscreenMediaViewer', () => {
      expect(screen).toContain('FullscreenMediaViewer');
    });

    it('uses ProductDetailHeader for collapsed sticky header', () => {
      expect(screen).toContain('ProductDetailHeader');
    });

    it('uses TanStack Query hooks', () => {
      expect(screen).toContain('useListingDetail');
      expect(screen).toContain('useRecommendations');
      expect(screen).toContain('useContinueExploring');
    });

    it('tracks analytics events', () => {
      expect(screen).toContain('ProductAnalytics');
    });

    it('does not import old ListingMediaHero', () => {
      expect(screen).not.toContain('ListingMediaHero');
    });

    it('does not import old ListingIdentityBlock', () => {
      expect(screen).not.toContain('ListingIdentityBlock');
    });

    it('does not import old ListingSellerRow', () => {
      expect(screen).not.toContain('ListingSellerRow');
    });
  });

  describe('Backend recommendation endpoint', () => {
    const backend = readFileSync(resolve(BACKEND, 'index.ts'), 'utf-8');

    it('has sectioned recommendations endpoint', () => {
      expect(backend).toContain('/listings/:listingId/recommendations');
    });

    it('has scoring function', () => {
      expect(backend).toContain('scoreListing');
    });

    it('has complementary category map', () => {
      expect(backend).toContain('COMPLEMENTARY_CATEGORY_MAP');
    });

    it('supports section filtering', () => {
      expect(backend).toContain('sectionsParam');
    });

    it('supports pagination cursor', () => {
      expect(backend).toContain('cursor');
    });

    it('supports personalised recommendations', () => {
      expect(backend).toContain('inspired_by_saves');
    });

    it('supports seen in looks', () => {
      expect(backend).toContain('seen_in_looks');
    });
  });

  describe('Query keys', () => {
    const queryKeys = read('platform/server/queryKeys.ts');

    it('has recommendations query key', () => {
      expect(queryKeys).toContain('recommendations');
    });
  });

  describe('Cursor pagination (PASS 6)', () => {
    const backend = readFileSync(resolve(BACKEND, 'index.ts'), 'utf-8');

    it('uses composite (created_at, id) cursor instead of offset', () => {
      expect(backend).toContain('cursorCreatedAt');
      expect(backend).toContain('cursorId');
    });

    it('encodes cursor as base64 JSON', () => {
      expect(backend).toContain('Buffer.from(JSON.stringify');
      expect(backend).toContain('toString(\'base64\')');
    });

    it('decodes cursor from base64', () => {
      expect(backend).toContain('Buffer.from(cursor, \'base64\')');
    });

    it('uses tuple comparison for pagination', () => {
      expect(backend).toContain('(l.created_at, l.id) <');
    });
  });

  describe('Analytics forwarding (PASS 7)', () => {
    const screen = read('screens/ItemDetailScreen.tsx');

    it('imports trackTelemetryEvent', () => {
      expect(screen).toContain('trackTelemetryEvent');
    });

    it('forwards product analytics events to telemetry', () => {
      expect(screen).toContain('trackTelemetryEvent(event.event');
    });

    it('cleans up analytics handler on unmount', () => {
      expect(screen).toContain('setProductAnalyticsHandler(() => {})');
    });

    const telemetry = read('lib/telemetry.ts');
    it('telemetry posts events to backend', () => {
      expect(telemetry).toContain('/analytics/events');
    });
  });

  describe('Media truth (PASS 8)', () => {
    const gallery = read('components/product/ProductMediaGallery.tsx');

    it('does not fabricate MEDIA_LABELS', () => {
      expect(gallery).not.toContain('MEDIA_LABELS');
      expect(gallery).not.toContain("'Front'");
      expect(gallery).not.toContain("'Back'");
      expect(gallery).not.toContain("'Label'");
    });
  });

  describe('Seller trust endpoint (PASS 9)', () => {
    const backend = readFileSync(resolve(BACKEND, 'index.ts'), 'utf-8');

    it('has GET /sellers/:sellerId endpoint', () => {
      expect(backend).toContain('app.get(\'/sellers/:sellerId\'');
    });

    it('computes rating from order_reviews', () => {
      expect(backend).toContain('AVG(rating)');
      expect(backend).toContain('order_reviews');
    });

    it('computes completed sales from orders', () => {
      expect(backend).toContain('completed_sales');
      expect(backend).toContain("status = 'completed'");
    });

    it('has follow toggle endpoint', () => {
      expect(backend).toContain('app.post(\'/sellers/:sellerId/follow\'');
    });

    it('uses user_follows table', () => {
      expect(backend).toContain('user_follows');
    });

    const queries = read('platform/product/useListingQueries.ts');
    it('frontend has useSellerTrust hook', () => {
      expect(queries).toContain('useSellerTrust');
    });

    it('frontend has useSellerFollow hook', () => {
      expect(queries).toContain('useSellerFollow');
    });
  });

  describe('Action bar guards (PASS 12)', () => {
    const actionBar = read('components/product/ProductActionBar.tsx');

    it('shows message button for all non-owners (not just when canBuy is false)', () => {
      expect(actionBar).toContain('capabilities.canMessage && (');
      expect(actionBar).not.toContain('!capabilities.canBuy');
    });
  });

  describe('Section-specific visual compositions (PASS 10)', () => {
    const rail = read('components/product/RecommendationRail.tsx');

    it('has cardAccent style for personalised sections', () => {
      expect(rail).toContain('cardAccent');
    });

    it('uses wider cards for complete_the_look', () => {
      expect(rail).toContain('complete_the_look');
    });

    it('passes cardWidth and cardHeight to RailCard', () => {
      expect(rail).toContain('cardWidth');
      expect(rail).toContain('cardHeight');
    });
  });
});
