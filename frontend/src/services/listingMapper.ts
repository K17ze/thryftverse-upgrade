import type {
  Listing,
  ListingCondition,
  ListingEngagementSummaryApi,
  ListingLifecycleStatus,
  ListingSeller,
} from './listingsApi';

/**
 * Canonical backend listing → frontend Listing view-model mapper.
 *
 * Every backend row (from /listings, /feed/home, /listings/:id, /search, /related)
 * is normalized through `mapBackendListingToListing` so that the UI always receives
 * a stable visual contract — regardless of which endpoint produced the row.
 *
 * Missing commercial facts stay missing. Rendering layers may explain or
 * omit absent data, but this mapper must never manufacture a product title,
 * brand, size, condition, category, seller, price or timestamp.
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
  engagement?: ListingEngagementSummaryApi | null;
}

/**
 * Discovery tiles cannot communicate absent commercial facts with the same
 * care as a detail screen. Keep incomplete records available to detail routes,
 * but exclude them from compact feeds instead of filling them with invented
 * values.
 */
export type DisplayReadyListing = Listing & {
  title: string;
  brand: string;
  size: string;
  condition: ListingCondition;
  price: number;
  sellerId: string;
  category: string;
  description: string;
  createdAt?: string;
};

const VALID_CONDITIONS: readonly ListingCondition[] = [
  'New with tags',
  'Very good',
  'Good',
  'Satisfactory',
];

function toFinitePrice(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toFiniteOriginalPrice(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function normalizeCondition(value: unknown): ListingCondition | null {
  if (typeof value === 'string' && value.length > 0) {
    const match = VALID_CONDITIONS.find(
      (c) => c.toLowerCase() === value.toLowerCase()
    );
    if (match) return match;
  }
  return null;
}

function normalizeStatus(value: unknown): ListingLifecycleStatus {
  switch (value) {
    case 'draft':
    case 'active':
    case 'paused':
    case 'reserved':
    case 'sold':
    case 'deleted':
    case 'removed':
      return value;
    default:
      return 'unknown';
  }
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

  return [];
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
  const id = nonBlank(row.id);
  if (!id) {
    throw new Error('Listing response is missing a stable id');
  }
  const status = normalizeStatus(row.status);

  return {
    id,
    title: nonBlank(row.title),
    brand: nonBlank(row.brand),
    size: nonBlank(row.size),
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
    isSold: status === 'sold',
    sellerId: nonBlank(row.sellerId),
    seller: normalizeSeller(row),
    category: nonBlank(row.category),
    subcategory: nonBlank(row.subcategory),
    description: nonBlank(row.description),
    createdAt: nonBlank(row.createdAt),
    status,
    shippingMethod: row.shippingMethod ?? null,
    shippingPayer: row.shippingPayer ?? null,
    engagement: row.engagement ?? null,
  };
}

export function isDisplayReadyListing(listing: Listing): listing is DisplayReadyListing {
  return listing.title !== null
    && listing.brand !== null
    && listing.size !== null
    && listing.condition !== null
    && listing.price !== null
    && listing.sellerId !== null
    && listing.category !== null
    && listing.description !== null
    && listing.createdAt !== null;
}

export function mapBackendListings(
  rows: unknown[] | null | undefined
): DisplayReadyListing[] {
  if (!Array.isArray(rows)) return [];
  const mapped: Listing[] = [];
  for (const row of rows) {
    if (row == null || typeof row !== 'object') continue;
    try {
      mapped.push(mapBackendListingToListing(row as BackendListingRow));
    } catch {
      // A feed cannot render an item without a stable identity. Detail fetches
      // still surface this contract violation through the single-row mapper.
    }
  }
  return mapped.filter(isDisplayReadyListing);
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
