import type { BackendListingRow } from '../listingMapper';

/**
 * Visual-regression-safe runtime fixtures for the backend listing mapper.
 *
 * Each fixture represents a real runtime state the app must survive:
 *  - full rich listing
 *  - missing image
 *  - missing seller
 *  - zero listings (handled by callers, not the mapper)
 *  - malformed optional fields
 *  - sold listing
 *  - sparse product detail
 *
 * These are intentionally backend-shaped (snake_case + nulls + missing keys)
 * so the mapper is exercised against the same shape the live API produces.
 */

export const FULL_RICH_LISTING: BackendListingRow = {
  id: 'rich_1',
  sellerId: 'u_seller_1',
  title: 'Vintage Levi’s 501 Denim Jacket',
  description: 'Gently worn, original hardware, no rips. A true archive piece.',
  priceGbp: 68,
  imageUrl: 'https://cdn.thryftverse.com/listings/rich_1/hero.jpg',
  images: [
    'https://cdn.thryftverse.com/listings/rich_1/hero.jpg',
    'https://cdn.thryftverse.com/listings/rich_1/detail_1.jpg',
    'https://cdn.thryftverse.com/listings/rich_1/detail_2.jpg',
  ],
  status: 'active',
  category: 'women',
  subcategory: 'Jackets',
  brand: "Levi's",
  size: 'M',
  condition: 'Very good',
  originalPriceGbp: 120,
  createdAt: '2026-06-15T10:30:00.000Z',
  shippingMethod: 'tracked',
  shippingPayer: 'buyer',
  seller: {
    id: 'u_seller_1',
    username: 'archived thread',
    avatar: 'https://cdn.thryftverse.com/avatars/u_seller_1.jpg',
    rating: 4.9,
    reviewCount: 128,
    location: 'London, UK',
  },
};

export const MISSING_IMAGE_LISTING: BackendListingRow = {
  id: 'no_img_1',
  sellerId: 'u_seller_2',
  title: 'Acne Studios Wool Sweater',
  description: 'No photos uploaded yet.',
  priceGbp: 45,
  imageUrl: null,
  images: [],
  status: 'active',
  category: 'women',
  brand: 'Acne Studios',
  size: 'S',
  condition: 'New with tags',
  createdAt: '2026-06-20T08:00:00.000Z',
  seller: {
    id: 'u_seller_2',
    username: 'minimal closet',
    avatar: null,
    rating: null,
    reviewCount: null,
    location: null,
  },
};

export const MISSING_SELLER_LISTING: BackendListingRow = {
  id: 'no_seller_1',
  sellerId: null,
  title: 'Nike Air Force 1',
  description: 'Classic white AF1s.',
  priceGbp: 80,
  imageUrl: 'https://cdn.thryftverse.com/listings/no_seller_1/hero.jpg',
  images: ['https://cdn.thryftverse.com/listings/no_seller_1/hero.jpg'],
  status: 'active',
  category: 'men',
  subcategory: 'Shoes',
  brand: 'Nike',
  size: 'UK 9',
  condition: 'Good',
  createdAt: '2026-06-22T12:00:00.000Z',
  seller: null,
};

export const MALFORMED_OPTIONAL_FIELDS_LISTING: BackendListingRow = {
  id: 'malformed_1',
  sellerId: 'u_seller_3',
  // Backend may send a non-numeric price; mapper must coerce safely.
  priceGbp: 'not a number' as unknown as number,
  title: '   ', // whitespace-only title
  description: null,
  imageUrl: '   ', // whitespace-only uri
  // Backend may send nulls/blanks inside the images array; mapper must filter.
  images: [null, '', '   ', 'https://cdn.thryftverse.com/listings/malformed_1/real.jpg'] as unknown as string[],
  status: 'active',
  category: '',
  subcategory: '',
  brand: '',
  size: '',
  condition: 'made up condition',
  originalPriceGbp: 'free' as unknown as number,
  createdAt: null,
  shippingMethod: null,
  shippingPayer: null,
  seller: {
    id: 'u_seller_3',
    username: '',
    avatar: '   ',
    rating: 'high' as unknown as number,
    reviewCount: 'many' as unknown as number,
    location: '',
  },
};

export const SOLD_LISTING: BackendListingRow = {
  id: 'sold_1',
  sellerId: 'u_seller_4',
  title: 'Sold Vintage Tee',
  description: 'Already sold.',
  priceGbp: 25,
  imageUrl: 'https://cdn.thryftverse.com/listings/sold_1/hero.jpg',
  images: ['https://cdn.thryftverse.com/listings/sold_1/hero.jpg'],
  status: 'sold',
  category: 'women',
  subcategory: 'Tops',
  brand: 'Vintage',
  size: 'One size',
  condition: 'Good',
  createdAt: '2026-05-01T00:00:00.000Z',
  seller: {
    id: 'u_seller_4',
    username: 'sold shop',
    avatar: 'https://cdn.thryftverse.com/avatars/u_seller_4.jpg',
    rating: 5.0,
    reviewCount: 12,
    location: 'Manchester, UK',
  },
};

export const SPARSE_PRODUCT_DETAIL: BackendListingRow = {
  id: 'sparse_1',
  // Only the bare minimum a backend might return for a detail fetch.
  sellerId: 'u_x',
  title: 'Sparse Listing',
  priceGbp: 10,
  createdAt: '2026-06-29T00:00:00.000Z',
};

export const ALL_FIXTURE_ROWS: BackendListingRow[] = [
  FULL_RICH_LISTING,
  MISSING_IMAGE_LISTING,
  MISSING_SELLER_LISTING,
  MALFORMED_OPTIONAL_FIELDS_LISTING,
  SOLD_LISTING,
  SPARSE_PRODUCT_DETAIL,
];
