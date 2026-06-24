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
});
