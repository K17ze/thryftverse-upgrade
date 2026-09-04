import type {
  Listing,
  ListingCondition,
  ListingEngagementSummaryApi,
  ListingLifecycleStatus,
  ListingSeller,
} from './listingsApi';
import {
  resolveListingCategoryPolicy,
  type ListingFieldKey,
} from '../contracts/listingCategoryPolicy';
import { CONDITION_NAMES } from '../contracts/taxonomy';

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
  /** Pinned/featured listing — shown first in the Shop grid when true. */
  featured?: boolean | null;
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
  materialComposition?: string | null;
  weightKg?: number | null;
}

/**
 * Discovery tiles cannot communicate absent commercial facts with the same
 * care as a detail screen. Keep incomplete records available to detail routes,
 * but exclude them from compact feeds instead of filling them with invented
 * values.
 *
 * Category-aware (Phase 5 WP7): brand and size are NOT universally required.
 * A brandless vintage item or a sizeless home good is still display-ready
 * when the category policy says brandless/sizeless is valid. The universal
 * floor is: title, condition, price, sellerId, category, description, createdAt.
 */
export type DisplayReadyListing = Listing & {
  title: string;
  brand: string | null;
  size: string | null;
  condition: ListingCondition;
  price: number;
  sellerId: string;
  category: string;
  description: string;
  createdAt?: string;
};

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
    const match = CONDITION_NAMES.find(
      (c) => c.toLowerCase() === value.toLowerCase()
    ) as ListingCondition | undefined;
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
      verified: typeof seller.verified === 'boolean' ? seller.verified : null,
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
    featured: row.featured === true ? true : null,
    sustainabilityGrade: row.sustainabilityGrade ?? null,
    materialComposition: row.materialComposition ?? null,
    weightKg: row.weightKg ?? null,
  };
}

export function isDisplayReadyListing(listing: Listing): listing is DisplayReadyListing {
  // Universal floor: these fields are always required for a feed tile.
  const hasUniversalFields = listing.title !== null
    && listing.condition !== null
    && listing.price !== null
    && listing.sellerId !== null
    && listing.category !== null
    && listing.description !== null
    && listing.createdAt !== null;

  if (!hasUniversalFields) return false;

  // Category-aware: brand and size are only required when the category
  // policy says they are NOT valid as absent (brandlessValid/sizelessValid
  // = false). For categories where brandless/sizeless is valid, a null
  // brand/size does not disqualify the listing from the feed.
  const policy = resolveListingCategoryPolicy(listing.category, listing.subcategory);
  if (!policy.brandlessValid && listing.brand === null) return false;
  if (!policy.sizelessValid && listing.size === null) return false;

  return true;
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
  const displayReady = mapped.filter(isDisplayReadyListing);

  // Telemetry: log when identity fallback is needed for valid listings.
  // This tracks how often brandless/sizeless listings (valid per category
  // policy) enter the feed via the fallback path.
  for (const listing of displayReady) {
    if (listing.brand === null || listing.size === null) {
      logIdentityFallbackTelemetry(listing);
    }
  }

  return displayReady;
}

// ── Identity synthesis ──────────────────────────────────────────────────────

/**
 * Synthesize a display-ready identity line for a listing card.
 *
 * Pattern (per Phase 5 WP7):
 *   1. brand + title  → "Nike · Vintage Jacket"
 *   2. clean title    → "Vintage Levi's 501 Denim Jacket"
 *   3. category fallback → "Home · Vintage Jacket" (when brand is absent
 *      and the title is too generic to be the sole identity)
 *
 * Brandless listings (valid per category policy) still produce a valid
 * identity — they use the clean title or a category-based fallback.
 * Sizeless listings are not part of card identity (size is a PDP fact).
 */
export function synthesizeListingIdentity(listing: Listing): string {
  const title = listing.title ?? 'Untitled listing';
  const brand = listing.brand;
  const category = listing.category;

  if (brand && brand.trim()) {
    return `${brand.trim()} · ${title}`;
  }

  // Brandless: use the clean title. If the title is very short/generic,
  // prepend the category so the card still has a scannable identity.
  if (title.trim().length < 12 && category && category.trim()) {
    return `${category.trim()} · ${title}`;
  }

  return title;
}

/**
 * Log completeness telemetry when identity fallback is needed.
 * Called by feed/search mappers when a listing enters the feed without
 * a brand (and brandless is valid for its category) so we can track
 * how often the fallback path is exercised.
 */
export function logIdentityFallbackTelemetry(listing: Listing): void {
  const policy = resolveListingCategoryPolicy(listing.category, listing.subcategory);
  const missingFields: ListingFieldKey[] = [];
  if (listing.brand === null && policy.brandlessValid) missingFields.push('brand');
  if (listing.size === null && policy.sizelessValid) missingFields.push('size');

  if (missingFields.length > 0) {
    // Telemetry: a valid listing entered the feed using a category-aware
    // fallback. This is expected behaviour, not an error — the warn level
    // makes it visible in dev tooling without alarming production logs.
    console.warn(
      `[listingMapper] Identity fallback used for listing ${listing.id}: ` +
      `missing [${missingFields.join(', ')}] (valid for category "${listing.category}")`,
    );
  }
}

/**
 * Friendly, premium-toned error copy. Never exposes raw fetch URLs or stack.
 * Used by BrowseScreen / UnifiedDiscoveryScreen / sync banners so users never see
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
