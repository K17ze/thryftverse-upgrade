/**
 * Home Discovery View Model — Phase 5 visual regression recovery
 *
 * Transforms a domain `Listing` into a presentation-ready view model
 * that carries enough identity (title/brand) for the Home feed to read
 * as visual commerce instead of "Pinterest with prices".
 *
 * The view model is the single source of truth for `HomeDiscoveryCard`.
 * It pre-resolves:
 *   - media URI + kind + aspect ratio (so the card never re-derives geometry)
 *   - a synthesised identity string (brand + product description)
 *   - price (current + optional original for price-drop display)
 *   - at most ONE context fact (price drop, size match, followed seller, etc.)
 *   - badges (boosted, authenticated)
 *
 * Identity synthesis follows doc 46 precedence:
 *   1. brand + productType/title  → "Acne Studios wool scarf"
 *   2. Clean listing title (if descriptive)
 *   3. Category-specific fallback  → "Vintage leather shoulder bag"
 *
 * NEVER produces "Unknown" or "Untitled listing" for an active card.
 */

import type { Listing } from '../domain';
import { isVideoUri, getCategoryFocalPoint } from '../utils/media';
import { resolveListingMediaHeightRatio } from '../utils/listingMediaGeometry';

// ============================================================================
// VIEW MODEL INTERFACE
// ============================================================================

export interface HomeDiscoveryItemVM {
  id: string;
  media: {
    uri: string;
    kind: 'image' | 'video';
    posterUri?: string;
    width?: number;
    height?: number;
    focalPoint?: { x: number; y: number };
  };
  identity: {
    primary: string; // e.g. "Acne Studios wool scarf"
    secondary?: string; // e.g. size or condition if useful
  };
  price: {
    currentMinor: number;
    originalMinor?: number;
    currency: string;
  };
  context?:
    | { kind: 'price_drop'; text: string }
    | { kind: 'size_match'; text: string }
    | { kind: 'followed_seller'; text: string; avatarUrl?: string }
    | { kind: 'ending_soon'; text: string }
    | { kind: 'reason'; text: string };
  badges: Array<'boosted' | 'authenticated'>;
  saved: boolean;
  routeId: string;
  sellerId: string;
  likes: number;
  aspectRatio: number;
  category: string;
  /** When true, this tile spans both columns as a wider editorial card. */
  featured?: boolean;
  /** Whether the primary media is a video (controls price placement). */
  isVideo: boolean;
  /** Seller display info for Following-mode context. */
  sellerUsername?: string | null;
  sellerAvatar?: string | null;
}

// ============================================================================
// IDENTITY SYNTHESIS
// ============================================================================

/**
 * Category-based fallback descriptions for brandless / generic listings.
 * Maps subcategory keywords to a human-readable product noun.
 */
const CATEGORY_NOUN_MAP: Record<string, string> = {
  shoes: 'Sneakers',
  bags: 'Bag',
  clothing: 'Item',
  jewellery: 'Jewellery',
  jewelry: 'Jewellery',
  watches: 'Watch',
  accessories: 'Accessory',
  outerwear: 'Jacket',
  knitwear: 'Knitwear',
  denim: 'Jeans',
  dresses: 'Dress',
  tops: 'Top',
  bottoms: 'Trousers',
  fragrance: 'Fragrance',
  beauty: 'Beauty product',
  home: 'Home item',
  art: 'Artwork',
};

/**
 * Extracts a product noun from a subcategory or category string.
 */
function categoryNoun(subcategory?: string | null, category?: string | null): string {
  const sub = subcategory?.toLowerCase().trim();
  if (sub && CATEGORY_NOUN_MAP[sub]) {
    return CATEGORY_NOUN_MAP[sub];
  }
  // Try partial match on subcategory
  if (sub) {
    for (const key of Object.keys(CATEGORY_NOUN_MAP)) {
      if (sub.includes(key)) {
        return CATEGORY_NOUN_MAP[key];
      }
    }
  }
  const cat = category?.toLowerCase().trim();
  if (cat) {
    for (const key of Object.keys(CATEGORY_NOUN_MAP)) {
      if (cat.includes(key)) {
        return CATEGORY_NOUN_MAP[key];
      }
    }
  }
  return 'Item';
}

/**
 * Checks whether a title is descriptive enough to stand alone as identity.
 * Generic titles like "Item", "Listing", "New", or very short strings
 * are not descriptive enough.
 */
function isTitleDescriptive(title: string): boolean {
  const trimmed = title.trim();
  if (trimmed.length < 3) return false;
  const lower = trimmed.toLowerCase();
  const generic = ['item', 'listing', 'new', 'untitled', 'unknown', 'product', 'n/a', 'test'];
  return !generic.includes(lower);
}

/**
 * Strips a leading brand name from a title to avoid duplication.
 * e.g. brand="Yves Saint Laurent", title="Yves Saint Laurent Sweater" → "Sweater"
 */
function stripLeadingBrand(title: string, brand: string): string {
  const trimmedTitle = title.trim();
  const trimmedBrand = brand.trim();
  if (!trimmedBrand) return trimmedTitle;

  // Check if title starts with brand (case-insensitive)
  const lowerTitle = trimmedTitle.toLowerCase();
  const lowerBrand = trimmedBrand.toLowerCase();
  if (lowerTitle.startsWith(lowerBrand)) {
    const remainder = trimmedTitle.slice(trimmedBrand.length).trim();
    return remainder || trimmedTitle; // If remainder is empty, keep full title
  }
  return trimmedTitle;
}

/**
 * Synthesises a human-readable identity for a listing card.
 *
 * Precedence (doc 46):
 *   1. brand + product description  → "Acne Studios wool scarf"
 *   2. Clean listing title          → "Vintage leather shoulder bag"
 *   3. Category-based fallback      → "Leather bag"
 *
 * NEVER returns "Unknown" or "Untitled listing".
 */
export function synthesizeListingIdentity(listing: Listing): { primary: string; secondary?: string } {
  const brand = listing.brand?.trim() ?? '';
  const title = listing.title?.trim() ?? '';
  const subcategory = listing.subcategory ?? null;
  const category = listing.category ?? null;

  // Strategy 1: brand + title (deduplicated)
  if (brand && isTitleDescriptive(title)) {
    const productPart = stripLeadingBrand(title, brand);
    // If the title IS just the brand name (no product part after stripping),
    // use category noun as the product description
    if (productPart === title) {
      // Title doesn't start with brand — combine them
      return { primary: `${brand} ${productPart}` };
    }
    if (productPart.length > 0) {
      return { primary: `${brand} ${productPart}` };
    }
    // Title was just the brand name — add category noun
    return { primary: `${brand} ${categoryNoun(subcategory, category)}` };
  }

  // Strategy 2: brand exists but title is generic — brand + category noun
  if (brand) {
    return { primary: `${brand} ${categoryNoun(subcategory, category)}` };
  }

  // Strategy 3: no brand but title is descriptive
  if (isTitleDescriptive(title)) {
    return { primary: title };
  }

  // Strategy 4: no brand, generic title — category-based fallback
  const noun = categoryNoun(subcategory, category);
  return { primary: noun };
}

// ============================================================================
// CONTEXT DERIVATION
// ============================================================================

interface ToVMOptions {
  isSaved: boolean;
  currency: string;
  userSize?: string;
  followedSellerIds?: Set<string>;
}

/**
 * Derives at most ONE context fact for a discovery card.
 * Priority: price_drop > size_match > followed_seller
 */
function deriveContext(
  listing: Listing,
  opts: ToVMOptions,
): HomeDiscoveryItemVM['context'] {
  // Price drop: only when both current and original exist and original > current
  if (
    typeof listing.originalPrice === 'number' &&
    listing.originalPrice > listing.price &&
    listing.price > 0
  ) {
    return { kind: 'price_drop', text: 'Price dropped' };
  }

  // Size match: user's size matches listing size
  if (opts.userSize && listing.size && opts.userSize.toLowerCase() === listing.size.toLowerCase()) {
    return { kind: 'size_match', text: `Size ${listing.size}` };
  }

  // Followed seller
  if (opts.followedSellerIds && opts.followedSellerIds.has(listing.sellerId)) {
    const username = listing.seller?.username;
    return {
      kind: 'followed_seller',
      text: username ? `@${username}` : 'Following',
      avatarUrl: listing.seller?.avatar ?? undefined,
    };
  }

  return undefined;
}

// ============================================================================
// MAPPER
// ============================================================================

/**
 * Converts a domain Listing into a HomeDiscoveryItemVM for the Home feed card.
 */
export function toHomeDiscoveryItemVM(
  listing: Listing,
  opts: ToVMOptions,
): HomeDiscoveryItemVM {
  const primaryMediaUri = listing.images?.[0] ?? '';
  const isVideo = isVideoUri(primaryMediaUri);
  const posterUri = isVideo
    ? listing.images?.find((uri) => !isVideoUri(uri))
    : undefined;

  const identity = synthesizeListingIdentity(listing);
  const context = deriveContext(listing, opts);

  const badges: Array<'boosted' | 'authenticated'> = [];
  if (listing.isBumped) {
    badges.push('boosted');
  }

  const aspectRatio = primaryMediaUri
    ? resolveListingMediaHeightRatio(listing)
    : 0.78; // MISSING_MEDIA_HEIGHT_RATIO fallback

  return {
    id: `item_${listing.id}`,
    media: {
      uri: primaryMediaUri,
      kind: isVideo ? 'video' : 'image',
      posterUri,
      width: listing.mediaWidth ?? undefined,
      height: listing.mediaHeight ?? undefined,
      focalPoint: getCategoryFocalPoint(listing.subcategory || listing.category),
    },
    identity,
    price: {
      currentMinor: Math.round(listing.price * 100),
      originalMinor:
        typeof listing.originalPrice === 'number'
          ? Math.round(listing.originalPrice * 100)
          : undefined,
      currency: opts.currency,
    },
    context,
    badges,
    saved: opts.isSaved,
    routeId: listing.id,
    sellerId: listing.sellerId,
    likes: listing.likes,
    aspectRatio,
    category: listing.subcategory || listing.category,
    isVideo,
    sellerUsername: listing.seller?.username ?? null,
    sellerAvatar: listing.seller?.avatar ?? null,
  };
}

/**
 * Converts an array of domain Listings into HomeDiscoveryItemVMs.
 */
export function toHomeDiscoveryItemVMs(
  listings: Listing[],
  opts: { isSaved: (id: string) => boolean; currency: string; userSize?: string; followedSellerIds?: Set<string> },
): HomeDiscoveryItemVM[] {
  return listings.map((listing) =>
    toHomeDiscoveryItemVM(listing, {
      isSaved: opts.isSaved(listing.id),
      currency: opts.currency,
      userSize: opts.userSize,
      followedSellerIds: opts.followedSellerIds,
    }),
  );
}
