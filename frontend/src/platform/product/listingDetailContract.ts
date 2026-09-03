import type { Listing, ListingSeller } from '../../services/listingsApi';

export interface SellerTrustSummary {
  id: string;
  username: string;
  avatar?: string | null;
  verified?: boolean;
  /** Tiered verification: 'email' (basic), 'id' (KYC document), 'seller' (full seller standards). */
  verificationTier?: VerificationTier;
  rating?: number | null;
  reviewCount?: number | null;
  completedSales?: number | null;
  responseRate?: number | null;
  responseTimeLabel?: string | null;
  dispatchTimeLabel?: string | null;
  memberSince?: string | null;
  location?: string | null;
  activeListingCount?: number | null;
  badges?: string[];
  isFollowing?: boolean;
  /** Holiday/away mode — when true, the seller's shop is paused. */
  holidayMode?: boolean;
  /** Optional away message set by the seller for buyers. */
  awayMessage?: string | null;
}

export type VerificationTier = 'email' | 'id' | 'seller';

export interface VerificationTierInfo {
  tier: VerificationTier;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const VERIFICATION_TIERS: Record<VerificationTier, VerificationTierInfo> = {
  email: {
    tier: 'email',
    label: 'Verified',
    icon: 'checkmark-circle',
    color: 'success',
    description: 'Email address confirmed',
  },
  id: {
    tier: 'id',
    label: 'ID Verified',
    icon: 'card-outline',
    color: 'brand',
    description: 'Identity document verified',
  },
  seller: {
    tier: 'seller',
    label: 'Trusted Seller',
    icon: 'checkmark-circle',
    color: 'success',
    description: 'Meets seller standards programme',
  },
};

// ── Seller Standards Badge Programme ──
// Badges are fail-closed: they are ONLY rendered when the backend provides
// an explicit, persisted programme decision via the `badges` field on
// SellerTrustSummary. The previous client-side derivation (regex over
// human-readable time labels, threshold checks on mutable summary values)
// was a P0 trust defect — a badge is a backend decision, not a client
// calculation. Text parsing is not evidence and cannot encode exclusions,
// expiry, or appeals.
//
// Until a persisted seller_standards_evaluations table feeds the API,
// `trust.badges` will be undefined/null and NO badges render. This is the
// correct fail-closed behaviour per AGENTS.md §11.

export type SellerBadgeType = 'topSeller' | 'fastShipper' | 'responsive' | 'superSeller';

export interface SellerBadgeInfo {
  type: SellerBadgeType;
  label: string;
  icon: string;
  description: string;
}

export const SELLER_BADGES: Record<SellerBadgeType, SellerBadgeInfo> = {
  topSeller: {
    type: 'topSeller',
    label: 'Top Seller',
    icon: 'ribbon',
    description: '50+ completed sales with a 4.5+ rating',
  },
  fastShipper: {
    type: 'fastShipper',
    label: 'Fast Shipper',
    icon: 'flash-outline',
    description: 'Dispatches within 1 day',
  },
  responsive: {
    type: 'responsive',
    label: 'Responsive',
    icon: 'chatbubble-ellipses',
    description: 'Replies within 2 hours, 90%+ response rate',
  },
  superSeller: {
    type: 'superSeller',
    label: 'Super Seller',
    icon: 'star',
    description: '200+ completed sales with a 4.8+ rating',
  },
};

/**
 * Returns seller standards badges from the backend-provided `badges` field.
 *
 * FAIL-CLOSED: if `trust.badges` is null/undefined/empty, returns [].
 * No client-side derivation, no regex, no threshold checks. A badge is a
 * persisted backend programme decision, not a client calculation.
 */
export function deriveSellerBadges(trust: SellerTrustSummary | null): SellerBadgeType[] {
  if (!trust?.badges) return [];
  return trust.badges.filter((b): b is SellerBadgeType =>
    Object.keys(SELLER_BADGES).includes(b),
  ) as SellerBadgeType[];
}

export interface ListingCommerceContext {
  itemPrice: number | null;
  buyerProtectionFee?: number;
  shippingPrice?: number;
  estimatedTotal?: number;
  currency: string;
  shippingMethod?: string | null;
  shippingPayer?: 'buyer' | 'seller' | null;
  estimatedDeliveryStart?: string | null;
  estimatedDeliveryEnd?: string | null;
  returnPolicy?: {
    accepted: boolean | null;
    windowDays?: number | null;
    conditions?: string | null;
  } | null;
  protectionPolicy?: {
    available: boolean;
    label: string;
    summary: string;
  } | null;
  authenticity?: {
    status: 'not_offered' | 'eligible' | 'verified';
    label?: string;
  } | null;
}

export interface ListingEngagementSummary {
  listingId?: string;
  likes?: number;
  views?: number;
  saves?: number;
  offers?: number;
  wishlistCount?: number | null;
  collectionSaveCount?: number | null;
  activeOfferCount?: number | null;
  /** Per spec 04_DIRECT §5: backend-backed question count. The
   * frontend must not fabricate this value. */
  questionCount?: number;
  answeredQuestionCount?: number;
  generatedAt?: string;
}

export interface ListingCapabilities {
  canBuy: boolean;
  canOffer: boolean;
  canEdit: boolean;
  canManage: boolean;
  canMessage: boolean;
  /** For brokered assets (cars, yachts) — replaces direct buy with an enquiry flow. */
  canEnquire?: boolean;
  /** For brokered assets — request an in-person or sea-trial viewing. */
  canRequestViewing?: boolean;
  /** Detected commerce tier for category-adaptive CTA logic. */
  commerceTier?: CommerceTier;
  isOwner: boolean;
  isSold: boolean;
  isAvailable: boolean;
  unavailableReason:
    | 'sold'
    | 'reserved'
    | 'paused'
    | 'draft'
    | 'removed'
    | 'missing_price'
    | 'missing_seller'
    | 'status_unknown'
    | null;
}

export interface ListingDetail {
  listing: Listing;
  seller: SellerTrustSummary | null;
  commerce: ListingCommerceContext;
  engagement: ListingEngagementSummary;
  capabilities: ListingCapabilities;
}

export function buildSellerTrustSummary(
  seller: ListingSeller | null | undefined,
  extras?: Partial<SellerTrustSummary>
): SellerTrustSummary | null {
  if (!seller || !seller.username) return null;
  return {
    id: seller.id,
    username: seller.username,
    avatar: seller.avatar ?? null,
    rating: seller.rating ?? null,
    reviewCount: seller.reviewCount ?? null,
    location: seller.location ?? null,
    ...extras,
  };
}

export function buildCommerceContext(
  listing: Listing,
  extras?: Partial<ListingCommerceContext>
): ListingCommerceContext {
  const itemPrice = listing.price;

  return {
    itemPrice,
    buyerProtectionFee: extras?.buyerProtectionFee,
    estimatedTotal: extras?.estimatedTotal,
    currency: 'GBP',
    shippingMethod: extras?.shippingMethod ?? null,
    shippingPayer: extras?.shippingPayer ?? null,
    estimatedDeliveryStart: extras?.estimatedDeliveryStart ?? null,
    estimatedDeliveryEnd: extras?.estimatedDeliveryEnd ?? null,
    returnPolicy: extras?.returnPolicy ?? null,
    protectionPolicy: extras?.protectionPolicy ?? null,
    authenticity: extras?.authenticity ?? null,
  };
}

export function buildEngagementSummary(
  listing: Listing
): ListingEngagementSummary {
  const engagement: ListingEngagementSummary = listing.engagement
    ? { ...listing.engagement }
    : {};
  if (listing.likes && listing.likes > 0 && engagement.likes === undefined) engagement.likes = listing.likes;
  if (listing.views && listing.views > 0) engagement.views = listing.views;
  return engagement;
}

// ── Commerce tier detection ────────────────────────────────────────────────
//
// Phase 6 Wave 5: High-value commerce ladder. The tier drives category-adaptive
// CTA logic so that brokered assets (cars, yachts) surface "Enquire" and
// "Request viewing" instead of a direct "Buy now".

export type CommerceTier = 'standard' | 'authenticated_luxury' | 'specialist' | 'brokered';

/**
 * Detect the commerce tier for a listing based on its category and price.
 *
 * - brokered: cars, yachts, boats — transaction is handled off-platform via enquiry
 * - specialist: art, collectibles — buy enabled but with inspection note
 * - authenticated_luxury: bags, watches, jewellery at high value — buy + offer with authentication note
 * - standard: everything else — current buy + offer behaviour
 *
 * Note: priceGbp is in GBP major units (e.g. 20000 = £20,000), matching
 * `listing.price` which is stored in major units, not minor/pence.
 */
export function detectCommerceTier(
  category: string,
  priceGbp: number,
  _currency?: string,
): CommerceTier {
  const normalized = category.toLowerCase();

  // Tier 4 — brokered: cars, yachts, boats
  if (normalized.includes('car') || normalized.includes('yacht') || normalized.includes('boat')) {
    return 'brokered';
  }

  // Tier 3 — specialist: art, collectibles (regardless of price)
  if (normalized.includes('art') || normalized.includes('collect')) {
    return 'specialist';
  }

  // Tier 2 — authenticated luxury: bags, watches, jewellery at high value
  // listing.price is in GBP major units (e.g. 20000 = £20,000)
  const highValueThresholdGbp = 10_000;
  if (
    priceGbp >= highValueThresholdGbp &&
    (normalized.includes('bag') || normalized.includes('watch') || normalized.includes('jewel'))
  ) {
    return 'authenticated_luxury';
  }

  // Tier 1 — standard
  return 'standard';
}

export function buildCapabilities(
  listing: Listing,
  currentUserId?: string
): ListingCapabilities {
  const isOwner = !!currentUserId && listing.sellerId === currentUserId;
  const status = listing.status ?? (listing.isSold ? 'sold' : 'active');
  const isSold = status === 'sold';
  let unavailableReason: ListingCapabilities['unavailableReason'] = null;
  if (isSold) unavailableReason = 'sold';
  else if (status === 'reserved') unavailableReason = 'reserved';
  else if (status === 'paused') unavailableReason = 'paused';
  else if (status === 'draft') unavailableReason = 'draft';
  else if (status === 'deleted' || status === 'removed') unavailableReason = 'removed';
  else if (status !== 'active') unavailableReason = 'status_unknown';
  else if (listing.price === null) unavailableReason = 'missing_price';
  else if (listing.sellerId === null) unavailableReason = 'missing_seller';

  const isAvailable = unavailableReason === null;

  // ── Category-adaptive CTA logic (Phase 6 Wave 5) ──
  const category = listing.category ?? '';
  const priceGbp = listing.price ?? 0;
  const commerceTier = detectCommerceTier(category, priceGbp);

  let canBuy = !isOwner && isAvailable;
  let canOffer = !isOwner && isAvailable;
  let canEnquire = false;
  let canRequestViewing = false;

  switch (commerceTier) {
    case 'brokered':
      // Cars, yachts — no direct buy/offer; enquire and request viewing instead
      canBuy = false;
      canOffer = false;
      canEnquire = !isOwner && listing.sellerId !== null;
      canRequestViewing = !isOwner && listing.sellerId !== null;
      break;
    case 'specialist':
      // Art, collectibles — buy enabled with inspection note
      canEnquire = !isOwner && listing.sellerId !== null;
      break;
    case 'authenticated_luxury':
      // High-value bags, watches, jewellery — buy + offer with authentication note
      break;
    case 'standard':
    default:
      // Current behaviour: buy + offer
      break;
  }

  return {
    canBuy,
    canOffer,
    canEdit: isOwner,
    canManage: isOwner,
    canMessage: !isOwner && listing.sellerId !== null,
    canEnquire,
    canRequestViewing,
    commerceTier,
    isOwner,
    isSold,
    isAvailable,
    unavailableReason,
  };
}

export function buildListingDetail(
  listing: Listing,
  currentUserId?: string,
  commerceExtras?: Partial<ListingCommerceContext>,
  sellerExtras?: Partial<SellerTrustSummary>
): ListingDetail {
  return {
    listing,
    seller: buildSellerTrustSummary(listing.seller, sellerExtras),
    commerce: buildCommerceContext(listing, commerceExtras),
    engagement: buildEngagementSummary(listing),
    capabilities: buildCapabilities(listing, currentUserId),
  };
}
