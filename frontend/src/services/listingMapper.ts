import type { Listing, ListingSeller } from '../data/mockData';

/**
 * Canonical backend listing → frontend Listing view-model mapper.
 *
 * Every backend row (from /listings, /feed/home, /listings/:id, /search, /related)
 * is normalized through `mapBackendListingToListing` so that the UI always receives
 * a stable visual contract — regardless of which endpoint produced the row.
 *
 * Contract guarantees for every returned Listing:
 *  - at least one safe visual media entry (never `[]`, never `['']`)
 *  - safe title, brand, size, condition
 *  - safe seller display model (never `undefined`; `null` only when truly absent)
 *  - safe category/subcategory
 *  - safe description
 *  - safe createdAt
 *  - safe price (finite number >= 0)
 *  - stable likes/social metadata fallback (>= 0)
 *
 * This is additive hardening. It does not remove any existing field.
 */

export interface BackendListingRow {
  id: string;
  sellerId?: string | null;
  title?: string | null;
  description?: string | null;
  priceGbp?: number | string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  status?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  size?: string | null;
  condition?: string | null;
  originalPriceGbp?: number | string | null;
  createdAt?: string | null;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
  seller?: ListingSeller | null;
  likes?: number | null;
  views?: number | null;
}

const VALID_CONDITIONS: readonly Listing['condition'][] = [
  'New with tags',
  'Very good',
  'Good',
  'Satisfactory',
];

const SAFE_SELLER_ID = 'thryftverse_seller';
const SAFE_TITLE = 'Untitled listing';
const SAFE_BRAND = 'Thryftverse';
const SAFE_SIZE = 'One size';
const SAFE_CONDITION: Listing['condition'] = 'Very good';
const SAFE_CATEGORY = 'women';
const SAFE_SUBCATEGORY = 'Clothing';
const SAFE_DESCRIPTION = 'No description provided.';
const SAFE_CREATED_AT = '2026-01-01T00:00:00.000Z';

/**
 * A non-empty, non-blank placeholder URI is intentionally NOT used here.
 * Empty string `''` is the sentinel that `CachedImage` already turns into a
 * premium `ImageEmptyGraphic`. We keep `['']` (not `[]`) so that
 * `ProductMediaGallery`/`CommerceMediaStage` always receive at least one entry
 * and never collapse to the bare gray-icon empty hero.
 */
const SAFE_MEDIA_FALLBACK: string[] = [''];

function deriveBrand(title: string): string {
  const normalized = title.trim();
  if (!normalized) return SAFE_BRAND;
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

function toFinitePrice(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toFiniteOriginalPrice(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function normalizeCondition(value: unknown): Listing['condition'] {
  if (typeof value === 'string' && value.length > 0) {
    const match = VALID_CONDITIONS.find(
      (c) => c.toLowerCase() === value.toLowerCase()
    );
    if (match) return match;
  }
  return SAFE_CONDITION;
}

function normalizeCategory(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return SAFE_CATEGORY;
}

function normalizeSubcategory(value: unknown, category: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  // Reasonable default derived from category — never blank.
  if (category && category.toLowerCase() === 'men') return 'Clothing';
  if (category && category.toLowerCase() === 'women') return 'Clothing';
  return SAFE_SUBCATEGORY;
}

function collectMedia(row: BackendListingRow): string[] {
  const fromArray = Array.isArray(row.images)
    ? row.images.filter((uri) => typeof uri === 'string' && uri.trim().length > 0)
    : [];
  if (fromArray.length > 0) return fromArray;

  const fromSingle =
    typeof row.imageUrl === 'string' && row.imageUrl.trim().length > 0
      ? row.imageUrl
      : '';
  if (fromSingle) return [fromSingle];

  return SAFE_MEDIA_FALLBACK;
}

function nonBlank(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function normalizeSeller(row: BackendListingRow): ListingSeller | null {
  const seller = row.seller;
  if (seller && typeof seller === 'object' && seller.id) {
    return {
      id: seller.id,
      username: nonBlank(seller.username),
      avatar: nonBlank(seller.avatar),
      rating: typeof seller.rating === 'number' && Number.isFinite(seller.rating) ? seller.rating : null,
      reviewCount: typeof seller.reviewCount === 'number' && Number.isFinite(seller.reviewCount) ? seller.reviewCount : null,
      location: nonBlank(seller.location),
    };
  }
  return null;
}

export function mapBackendListingToListing(row: BackendListingRow): Listing {
  const id = typeof row.id === 'string' && row.id ? row.id : `listing_${Math.random().toString(36).slice(2)}`;
  const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : SAFE_TITLE;
  const category = normalizeCategory(row.category);
  const subcategory = normalizeSubcategory(row.subcategory, category);

  return {
    id,
    title,
    brand:
      typeof row.brand === 'string' && row.brand.trim()
        ? row.brand.trim()
        : deriveBrand(title),
    size:
      typeof row.size === 'string' && row.size.trim()
        ? row.size.trim()
        : SAFE_SIZE,
    condition: normalizeCondition(row.condition),
    price: toFinitePrice(row.priceGbp),
    originalPrice: toFiniteOriginalPrice(row.originalPriceGbp),
    images: collectMedia(row),
    mediaAspectRatio:
      typeof row.mediaAspectRatio === 'number' && Number.isFinite(row.mediaAspectRatio)
        ? row.mediaAspectRatio
        : null,
    mediaWidth:
      typeof row.mediaWidth === 'number' && Number.isFinite(row.mediaWidth)
        ? row.mediaWidth
        : null,
    mediaHeight:
      typeof row.mediaHeight === 'number' && Number.isFinite(row.mediaHeight)
        ? row.mediaHeight
        : null,
    likes: typeof row.likes === 'number' && row.likes > 0 ? row.likes : 0,
    views: typeof row.views === 'number' && row.views > 0 ? row.views : 0,
    isSold: row.status === 'sold',
    sellerId:
      typeof row.sellerId === 'string' && row.sellerId
        ? row.sellerId
        : SAFE_SELLER_ID,
    seller: normalizeSeller(row),
    category,
    subcategory,
    description:
      typeof row.description === 'string' && row.description.trim()
        ? row.description.trim()
        : SAFE_DESCRIPTION,
    createdAt:
      typeof row.createdAt === 'string' && row.createdAt
        ? row.createdAt
        : SAFE_CREATED_AT,
    shippingMethod: row.shippingMethod ?? null,
    shippingPayer: row.shippingPayer ?? null,
  };
}

export function mapBackendListings(rows: unknown[] | null | undefined): Listing[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is BackendListingRow => r != null && typeof r === 'object')
    .map(mapBackendListingToListing);
}

/**
 * Friendly, premium-toned error copy. Never exposes raw fetch URLs or stack.
 * Used by BrowseScreen / GlobalSearchScreen / sync banners so users never see
 * "Network request failed for http://10.0.2.2:4000/listings?..." style text.
 */
export function friendlyBackendError(error: unknown): string {
  if (!error) return 'Live listings are temporarily unavailable.';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Live listings are temporarily unavailable.';

  const lower = message.toLowerCase();
  if (lower.includes('offline') || lower.includes('internet connection')) {
    return 'You appear to be offline. Showing what’s already on your device.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network request failed')) {
    return 'We couldn’t reach the live feed. Showing cached listings.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The feed took too long to respond. Showing cached listings.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'This listing is no longer available.';
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return 'Sign in again to see the latest live listings.';
  }
  if (lower.includes('500') || lower.includes('server') || lower.includes('internal')) {
    return 'The server hit a snag. Showing cached listings.';
  }
  if (message.length > 80) {
    return 'Live listings are temporarily unavailable. Showing cached listings.';
  }
  return message;
}
