/**
 * Discovery Listing Summary Contract — Thryftverse Production Domain
 *
 * Production domain contract for a listing summary used in discovery feed
 * units. This contract is the production source of truth for the listing
 * tile payload — it must NOT depend on `data/mockData` types.
 *
 * The mock-data `Listing` type is a development/demo shape that carries
 * fields not relevant to discovery tiles (full description, shipping
 * details, etc.). This contract captures only the fields a discovery tile
 * needs, with nullable commerce facts (brand/size/condition) so the UI
 * never fabricates values (audit §02, P0.4).
 *
 * Mapper: `mapListingToDiscoverySummary` converts any source listing
 * (mock-data `Listing` or backend listing) into this production contract.
 */

// ============================================================================
// SHARED SELLER SUMMARY
// ============================================================================

/**
 * Minimal seller identity for a discovery tile. Carries only the fields
 * needed to render a seller row — never full profile data.
 */
export interface DiscoverySellerSummary {
  id: string;
  username: string | null;
  avatar: string | null;
  verified?: boolean | null;
}

// ============================================================================
// LISTING CONDITION
// ============================================================================

export type { ListingCondition } from './taxonomy';
import type { ListingCondition } from './taxonomy';

// ============================================================================
// DISCOVERY LISTING SUMMARY
// ============================================================================

/**
 * Production contract for a listing summary rendered in discovery feeds.
 *
 * Commerce-fact truthfulness (audit P0.4):
 * - `brand`, `size`, `condition` are nullable. The UI must render only
 *   known facts — never fabricate a brand from the title or default
 *   size/condition.
 * - `price` is always present (a listing without a price is not a listing).
 * - `originalPrice` is optional and only present when a genuine reference
 *   price exists.
 */
export interface DiscoveryListingSummary {
  /** Stable unique listing id. */
  id: string;
  /** Listing title. */
  title: string;
  /** Brand name — nullable so the UI never fabricates one. */
  brand: string | null;
  /** Size — nullable so the UI never defaults to "One size". */
  size: string | null;
  /** Condition — nullable so the UI never defaults to "Very good". */
  condition: ListingCondition | null;
  /** Current asking price (always present). */
  price: number;
  /** Optional original/reference price for discount display. */
  originalPrice?: number;
  /** Price including buyer protection fee, if applicable. */
  priceWithProtection?: number;
  /** Primary media URIs (images and/or video poster frames). */
  images: string[];
  /**
   * Width divided by height for the primary media asset. Backends should
   * provide this so discovery grids can reserve the final frame before the
   * image downloads and avoid visible layout shifts.
   */
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  /** Like count for social proof. */
  likes: number;
  /** View count (optional). */
  views?: number;
  /** Whether the listing is bumped/boosted. */
  isBumped?: boolean;
  /** Whether the listing is sold. */
  isSold?: boolean;
  /** Listing lifecycle status. */
  status?:
    | 'draft'
    | 'active'
    | 'paused'
    | 'reserved'
    | 'sold'
    | 'deleted'
    | 'removed'
    | 'unknown';
  /** Seller id. */
  sellerId: string;
  /** Minimal seller summary for tile rendering. */
  seller?: DiscoverySellerSummary | null;
  /** Primary category. */
  category: string;
  /** Optional subcategory. */
  subcategory?: string | null;
  /** Creation timestamp (ISO). */
  createdAt?: string;
  /** Backend-computed sustainability grade (A/B/C/D). Null when no impact data available (fail-closed). */
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
}

// ============================================================================
// MAPPER — mock-data Listing → DiscoveryListingSummary
// ============================================================================

/**
 * Source shape that any listing provider can produce. This structural
 * interface matches the mock-data `Listing` and backend listing payloads
 * without importing the mock-data module.
 */
export interface ListingLike {
  id: string;
  title: string;
  brand?: string | null;
  size?: string | null;
  condition?: ListingCondition | null;
  price: number;
  originalPrice?: number;
  priceWithProtection?: number;
  images: string[];
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  likes: number;
  views?: number;
  isBumped?: boolean;
  isSold?: boolean;
  status?: string | null;
  sellerId: string;
  seller?: {
    id: string;
    username: string | null;
    avatar: string | null;
    verified?: boolean | null;
  } | null;
  category: string;
  subcategory?: string | null;
  description?: string;
  createdAt?: string;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
}

/**
 * Maps any listing-like source (mock-data `Listing`, backend payload) into
 * the production `DiscoveryListingSummary` contract.
 *
 * Commerce-fact truthfulness: `brand`, `size`, `condition` are passed
 * through as-is (including `null`/`undefined` → `null`). The mapper never
 * fabricates values.
 */
export function mapListingToDiscoverySummary(
  source: ListingLike,
): DiscoveryListingSummary {
  return {
    id: source.id,
    title: source.title,
    brand: source.brand ?? null,
    size: source.size ?? null,
    condition: source.condition ?? null,
    price: source.price,
    originalPrice: source.originalPrice,
    priceWithProtection: source.priceWithProtection,
    images: source.images,
    mediaAspectRatio: source.mediaAspectRatio ?? null,
    mediaWidth: source.mediaWidth ?? null,
    mediaHeight: source.mediaHeight ?? null,
    likes: source.likes,
    views: source.views,
    isBumped: source.isBumped,
    isSold: source.isSold,
    status: (source.status as DiscoveryListingSummary['status']) ?? undefined,
    sellerId: source.sellerId,
    seller: source.seller
      ? {
          id: source.seller.id,
          username: source.seller.username,
          avatar: source.seller.avatar,
          verified: source.seller.verified ?? null,
        }
      : null,
    category: source.category,
    subcategory: source.subcategory ?? null,
    createdAt: source.createdAt,
    sustainabilityGrade: source.sustainabilityGrade ?? null,
  };
}

/**
 * Maps an array of listing-like sources into production summaries.
 */
export function mapListingsToDiscoverySummaries(
  sources: ListingLike[],
): DiscoveryListingSummary[] {
  return sources.map(mapListingToDiscoverySummary);
}
