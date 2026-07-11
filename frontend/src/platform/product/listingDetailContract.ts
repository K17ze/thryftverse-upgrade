import type { Listing, ListingSeller } from '../../data/mockData';

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
    icon: 'shield-checkmark',
    color: 'success',
    description: 'Meets seller standards programme',
  },
};

// ── Seller Standards Badge Programme ──
// Badges are derived from existing SellerTrustSummary metrics.
// Each badge has a clear criterion so the UI can truthfully show earned badges.

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
    icon: 'rocket-outline',
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
 * Derives seller standards badges from the SellerTrustSummary metrics.
 * Only returns badges that are truthfully earned based on the criteria.
 */
export function deriveSellerBadges(trust: SellerTrustSummary | null): SellerBadgeType[] {
  if (!trust) return [];
  const earned: SellerBadgeType[] = [];

  const completedSales = trust.completedSales ?? 0;
  const rating = trust.rating ?? 0;
  const responseRate = trust.responseRate ?? 0;
  const responseTimeLabel = trust.responseTimeLabel ?? '';
  const dispatchTimeLabel = trust.dispatchTimeLabel ?? '';

  // Top Seller: 50+ sales, 4.5+ rating
  if (completedSales >= 50 && rating >= 4.5) {
    earned.push('topSeller');
  }

  // Super Seller: 200+ sales, 4.8+ rating
  if (completedSales >= 200 && rating >= 4.8) {
    earned.push('superSeller');
  }

  // Fast Shipper: dispatches same day or within 1 day
  const fastDispatch = /same day|within 1 day|1 day|24h/i.test(dispatchTimeLabel);
  if (fastDispatch) {
    earned.push('fastShipper');
  }

  // Responsive: 90%+ response rate AND replies within 2 hours
  const fastResponse = /within 1h|within 2h|1 hour|2 hour|1h|2h/i.test(responseTimeLabel);
  if (responseRate >= 90 && fastResponse) {
    earned.push('responsive');
  }

  return earned;
}

export interface ListingCommerceContext {
  itemPrice: number;
  buyerProtectionFee?: number;
  shippingPrice?: number;
  estimatedTotal?: number;
  currency: string;
  shippingMethod?: string | null;
  shippingPayer?: 'buyer' | 'seller' | null;
  estimatedDeliveryStart?: string | null;
  estimatedDeliveryEnd?: string | null;
  returnPolicy?: {
    accepted: boolean;
    windowDays?: number;
    conditions?: string;
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
  likes?: number;
  views?: number;
  saves?: number;
  offers?: number;
}

export interface ListingCapabilities {
  canBuy: boolean;
  canOffer: boolean;
  canEdit: boolean;
  canManage: boolean;
  canMessage: boolean;
  isOwner: boolean;
  isSold: boolean;
  isAvailable: boolean;
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
  if (!seller) return null;
  return {
    id: seller.id,
    username: seller.username ?? 'Seller',
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
  const engagement: ListingEngagementSummary = {};
  if (listing.likes && listing.likes > 0) engagement.likes = listing.likes;
  if (listing.views && listing.views > 0) engagement.views = listing.views;
  return engagement;
}

export function buildCapabilities(
  listing: Listing,
  currentUserId?: string
): ListingCapabilities {
  const isOwner = !!currentUserId && listing.sellerId === currentUserId;
  const isSold = !!listing.isSold;
  const isAvailable = !isSold;

  return {
    canBuy: !isOwner && isAvailable,
    canOffer: !isOwner && isAvailable,
    canEdit: isOwner,
    canManage: isOwner,
    canMessage: !isOwner,
    isOwner,
    isSold,
    isAvailable,
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
