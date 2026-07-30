import { describe, expect, it } from 'vitest';
import {
  friendlyBackendError,
  mapBackendListingToListing,
  mapBackendListings,
} from '../services/listingMapper';
import {
  ALL_FIXTURE_ROWS,
  FULL_RICH_LISTING,
  MALFORMED_OPTIONAL_FIELDS_LISTING,
  MISSING_IMAGE_LISTING,
  MISSING_SELLER_LISTING,
  SOLD_LISTING,
  SPARSE_PRODUCT_DETAIL,
} from '../services/__fixtures__/backendListingFixtures';

/**
 * Runtime contract audit for the canonical backend mapper. Missing commercial
 * facts remain missing; detail surfaces can explain them and compact discovery
 * surfaces can fail closed without presenting invented product information.
 */
describe('mapBackendListingToListing — truthful detail contract', () => {
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
    expect(out.isSold).toBe(false);
    expect(out.status).toBe('active');
    expect(out.sellerId).toBe('u_seller_1');
    expect(out.seller?.username).toBe('archived thread');
    expect(out.category).toBe('women');
    expect(out.subcategory).toBe('Jackets');
    expect(out.description).toContain('archive');
    expect(out.createdAt).toBe('2026-06-15T10:30:00.000Z');
  });

  it('preserves missing media instead of inventing a sentinel asset', () => {
    expect(mapBackendListingToListing(MISSING_IMAGE_LISTING).images).toEqual([]);
  });

  it('preserves a missing seller identity', () => {
    const out = mapBackendListingToListing(MISSING_SELLER_LISTING);
    expect(out.sellerId).toBeNull();
    expect(out.seller).toBeNull();
    expect(out.title).toBe('Nike Air Force 1');
    expect(out.price).toBe(80);
  });

  it('keeps malformed facts missing instead of fabricating defaults', () => {
    const out = mapBackendListingToListing(MALFORMED_OPTIONAL_FIELDS_LISTING);
    expect(out.price).toBeNull();
    expect(out.title).toBeNull();
    expect(out.brand).toBeNull();
    expect(out.size).toBeNull();
    expect(out.condition).toBeNull();
    expect(out.category).toBeNull();
    expect(out.subcategory).toBeNull();
    expect(out.description).toBeNull();
    expect(out.createdAt).toBeNull();
    expect(out.images).toEqual([
      'https://cdn.thryftverse.com/listings/malformed_1/real.jpg',
    ]);
    expect(out.originalPrice).toBeUndefined();
    expect(out.seller?.username).toBeNull();
    expect(out.seller?.avatar).toBeNull();
  });

  it('preserves exact lifecycle and sparse detail truth', () => {
    expect(mapBackendListingToListing(SOLD_LISTING).status).toBe('sold');
    expect(mapBackendListingToListing(SOLD_LISTING).isSold).toBe(true);

    const sparse = mapBackendListingToListing(SPARSE_PRODUCT_DETAIL);
    expect(sparse.id).toBe('sparse_1');
    expect(sparse.images).toEqual([]);
    expect(sparse.seller).toBeNull();
    expect(sparse.sellerId).toBe('u_x');
    expect(sparse.category).toBeNull();
    expect(sparse.status).toBe('unknown');
  });

  it('rejects a row without a stable id instead of inventing one', () => {
    expect(() => mapBackendListingToListing({ id: '   ' })).toThrow(/stable id/i);
  });
});

describe('mapBackendListingToListing — truth invariants', () => {
  for (const row of ALL_FIXTURE_ROWS) {
    it(`does not fabricate facts for fixture "${row.id}"`, () => {
      const out = mapBackendListingToListing(row);
      expect(Array.isArray(out.images)).toBe(true);
      for (const uri of out.images) {
        expect(typeof uri).toBe('string');
        expect(uri.trim().length).toBeGreaterThan(0);
      }

      for (const fact of [
        out.title,
        out.brand,
        out.size,
        out.category,
        out.subcategory,
        out.description,
        out.createdAt,
        out.sellerId,
      ]) {
        expect(
          fact === null || (typeof fact === 'string' && fact.trim().length > 0)
        ).toBe(true);
      }

      expect(
        out.condition === null
          || ['New with tags', 'Very good', 'Good', 'Satisfactory'].includes(out.condition)
      ).toBe(true);
      expect(
        out.price === null || (Number.isFinite(out.price) && out.price >= 0)
      ).toBe(true);
      expect(
        out.seller == null || typeof out.seller.id === 'string'
      ).toBe(true);
      expect(Number.isFinite(out.likes)).toBe(true);
      expect(out.likes).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('mapBackendListings — discovery boundary', () => {
  it('excludes non-object and incomplete records from compact feeds', () => {
    const out = mapBackendListings([
      FULL_RICH_LISTING,
      null,
      'string-row',
      42,
      MISSING_IMAGE_LISTING,
      undefined,
    ] as unknown[]);
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
    const message = friendlyBackendError(
      new Error('Network request failed for http://10.0.2.2:4000/listings: Internet connection is offline')
    );
    expect(message).not.toContain('http://');
    expect(message).not.toContain('10.0.2.2');
    expect(message.length).toBeLessThan(120);
  });

  it('translates known failure classes', () => {
    expect(friendlyBackendError(new Error('Request timed out after 5000ms')).toLowerCase())
      .toContain('cached');
    expect(friendlyBackendError(new Error('Request failed (404) for /listings/xyz')).toLowerCase())
      .toContain('no longer available');
  });

  it('contains unexpectedly long messages and handles empty errors', () => {
    expect(friendlyBackendError(new Error('x'.repeat(200))).length).toBeLessThan(120);
    expect(friendlyBackendError(null).length).toBeGreaterThan(5);
  });
});
