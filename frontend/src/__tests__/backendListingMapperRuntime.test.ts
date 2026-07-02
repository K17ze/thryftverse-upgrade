import { describe, expect, it } from 'vitest';
import {
  mapBackendListingToListing,
  mapBackendListings,
  friendlyBackendError,
} from '../services/listingMapper';
import {
  FULL_RICH_LISTING,
  MISSING_IMAGE_LISTING,
  MISSING_SELLER_LISTING,
  MALFORMED_OPTIONAL_FIELDS_LISTING,
  SOLD_LISTING,
  SPARSE_PRODUCT_DETAIL,
  ALL_FIXTURE_ROWS,
} from '../services/__fixtures__/backendListingFixtures';

/**
 * Runtime UI/UX regression audit — proves the canonical mapper never emits
 * broken visual data across every live-backend state the app must survive.
 *
 * These tests are the contract that mock mode, Docker backend mode, empty DB
 * mode, missing-media mode, slow mode, and failed-sync mode all render the
 * same premium-safe frontend view model.
 */

describe('mapBackendListingToListing — visual contract', () => {
  it('preserves a full rich listing without losing any field', () => {
    const out = mapBackendListingToListing(FULL_RICH_LISTING);
    expect(out.id).toBe('rich_1');
    expect(out.title).toBe('Vintage Levi’s 501 Denim Jacket');
    expect(out.brand).toBe("Levi's");
    expect(out.size).toBe('M');
    expect(out.condition).toBe('Very good');
    expect(out.price).toBe(68);
    expect(out.originalPrice).toBe(120);
    expect(out.images).toHaveLength(3);
    expect(out.images.every((u) => u.length > 0)).toBe(true);
    expect(out.isSold).toBe(false);
    expect(out.sellerId).toBe('u_seller_1');
    expect(out.seller?.username).toBe('archived thread');
    expect(out.seller?.avatar).toContain('avatars');
    expect(out.category).toBe('women');
    expect(out.subcategory).toBe('Jackets');
    expect(out.description).toContain('archive');
    expect(out.createdAt).toBe('2026-06-15T10:30:00.000Z');
    expect(out.shippingMethod).toBe('tracked');
    expect(out.shippingPayer).toBe('buyer');
  });

  it('never emits an empty images array — missing image yields a safe sentinel', () => {
    const out = mapBackendListingToListing(MISSING_IMAGE_LISTING);
    // Contract: at least one entry so ProductMediaGallery never collapses.
    expect(out.images.length).toBeGreaterThanOrEqual(1);
    // The sentinel is the empty string CachedImage turns into ImageEmptyGraphic.
    // It must NOT be a usable URL and must NOT be undefined/null.
    expect(typeof out.images[0]).toBe('string');
  });

  it('falls back to a safe sellerId and null seller when seller is missing', () => {
    const out = mapBackendListingToListing(MISSING_SELLER_LISTING);
    expect(out.sellerId).toBeTruthy();
    expect(out.seller).toBeNull();
    // Title/brand/price still render.
    expect(out.title).toBe('Nike Air Force 1');
    expect(out.brand).toBe('Nike');
    expect(out.price).toBe(80);
    expect(out.images[0]).toContain('no_seller_1');
  });

  it('coerces malformed optional fields into safe visual values', () => {
    const out = mapBackendListingToListing(MALFORMED_OPTIONAL_FIELDS_LISTING);
    // Non-numeric price → 0, never NaN.
    expect(out.price).toBe(0);
    expect(Number.isNaN(out.price)).toBe(false);
    // Whitespace title → safe default.
    expect(out.title).toBe('Untitled listing');
    // Whitespace brand → derived from the safe title (two words) → safe value.
    expect(out.brand).toBe('Untitled listing');
    // Whitespace size → safe default.
    expect(out.size).toBe('One size');
    // Unknown condition → safe default.
    expect(out.condition).toBe('Very good');
    // Whitespace category → safe default.
    expect(out.category).toBe('women');
    // Whitespace subcategory → safe default.
    expect(out.subcategory).toBe('Clothing');
    // Whitespace description → safe default.
    expect(out.description).toBe('No description provided.');
    // Null createdAt → safe default, never undefined.
    expect(typeof out.createdAt).toBe('string');
    expect(out.createdAt!.length).toBeGreaterThan(0);
    // Images: nulls/blanks filtered, only the real URL survives.
    expect(out.images).toEqual(['https://cdn.thryftverse.com/listings/malformed_1/real.jpg']);
    // Non-numeric originalPrice → undefined, never NaN.
    expect(out.originalPrice).toBeUndefined();
    // Seller with blank username/avatar → null username/avatar preserved, no crash.
    expect(out.seller).not.toBeNull();
    expect(out.seller?.username).toBeNull();
    expect(out.seller?.avatar).toBeNull();
  });

  it('marks sold listings and preserves the rest of the visual contract', () => {
    const out = mapBackendListingToListing(SOLD_LISTING);
    expect(out.isSold).toBe(true);
    expect(out.title).toBe('Sold Vintage Tee');
    expect(out.images[0]).toContain('sold_1');
    expect(out.seller?.username).toBe('sold shop');
  });

  it('handles a sparse product detail row without crashing', () => {
    const out = mapBackendListingToListing(SPARSE_PRODUCT_DETAIL);
    expect(out.id).toBe('sparse_1');
    expect(out.title).toBe('Sparse Listing');
    expect(out.price).toBe(10);
    // Sparse row has no images — must still get the safe sentinel.
    expect(out.images.length).toBeGreaterThanOrEqual(1);
    expect(out.seller).toBeNull();
    expect(out.sellerId).toBeTruthy();
    expect(out.createdAt).toBe('2026-06-29T00:00:00.000Z');
  });
});

describe('mapBackendListingToListing — invariant contract across all fixtures', () => {
  for (const row of ALL_FIXTURE_ROWS) {
    it(`never outputs broken visual data for fixture "${row.id}"`, () => {
      const out = mapBackendListingToListing(row);
      // 1. At least one safe visual media fallback — never [], never undefined.
      expect(Array.isArray(out.images)).toBe(true);
      expect(out.images.length).toBeGreaterThanOrEqual(1);
      for (const uri of out.images) {
        expect(typeof uri).toBe('string');
      }
      // 2. Safe title.
      expect(typeof out.title).toBe('string');
      expect(out.title.trim().length).toBeGreaterThan(0);
      // 3. Safe brand.
      expect(typeof out.brand).toBe('string');
      expect(out.brand.trim().length).toBeGreaterThan(0);
      // 4. Safe size.
      expect(typeof out.size).toBe('string');
      expect(out.size.trim().length).toBeGreaterThan(0);
      // 5. Safe condition.
      expect(['New with tags', 'Very good', 'Good', 'Satisfactory']).toContain(out.condition);
      // 6. Safe seller display model (object or null, never undefined).
      expect(out.seller === null || (out.seller && typeof out.seller.id === 'string')).toBe(true);
      // 7. Safe category/subcategory.
      expect(typeof out.category).toBe('string');
      expect(out.category.trim().length).toBeGreaterThan(0);
      expect(typeof out.subcategory).toBe('string');
      expect(out.subcategory.trim().length).toBeGreaterThan(0);
      // 8. Safe description.
      expect(typeof out.description).toBe('string');
      expect(out.description.length).toBeGreaterThan(0);
      // 9. Safe createdAt.
      expect(typeof out.createdAt).toBe('string');
      expect(out.createdAt!.length).toBeGreaterThan(0);
      // 10. Safe price (finite, >= 0, never NaN).
      expect(typeof out.price).toBe('number');
      expect(Number.isFinite(out.price)).toBe(true);
      expect(out.price).toBeGreaterThanOrEqual(0);
      // 11. Stable likes/social metadata fallback (>= 0, never NaN/undefined).
      expect(typeof out.likes).toBe('number');
      expect(Number.isFinite(out.likes)).toBe(true);
      expect(out.likes).toBeGreaterThanOrEqual(0);
      // 12. sellerId always present.
      expect(typeof out.sellerId).toBe('string');
      expect(out.sellerId.length).toBeGreaterThan(0);
    });
  }
});

describe('mapBackendListings — batch safety', () => {
  it('maps a mixed batch and filters out non-object rows', () => {
    const out = mapBackendListings([
      FULL_RICH_LISTING,
      null,
      'string-row',
      42,
      MISSING_IMAGE_LISTING,
      undefined,
    ] as unknown as unknown[]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('rich_1');
    expect(out[1].id).toBe('no_img_1');
  });

  it('returns [] for null/undefined input', () => {
    expect(mapBackendListings(null)).toEqual([]);
    expect(mapBackendListings(undefined)).toEqual([]);
  });
});

describe('friendlyBackendError — never exposes raw fetch URLs', () => {
  it('translates network failure into premium copy', () => {
    const msg = friendlyBackendError(
      new Error('Network request failed for http://10.0.2.2:4000/listings?cursor=abc: Internet connection is offline')
    );
    expect(msg).not.toContain('http://');
    expect(msg).not.toContain('10.0.2.2');
    expect(msg.length).toBeLessThan(120);
    expect(msg.length).toBeGreaterThan(10);
  });

  it('translates timeout into premium copy', () => {
    const msg = friendlyBackendError(new Error('Request timed out after 5000ms'));
    expect(msg.toLowerCase()).toContain('cached');
  });

  it('translates 404 into premium copy', () => {
    const msg = friendlyBackendError(new Error('Request failed (404) for /listings/xyz'));
    expect(msg.toLowerCase()).toContain('no longer available');
  });

  it('truncates unexpectedly long raw messages', () => {
    const long = 'x'.repeat(200);
    const msg = friendlyBackendError(new Error(long));
    expect(msg.length).toBeLessThan(120);
  });

  it('returns a default for empty error', () => {
    const msg = friendlyBackendError(null);
    expect(msg.length).toBeGreaterThan(5);
  });
});
