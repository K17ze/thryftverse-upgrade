import type { Listing, ListingSeller } from '../../data/mockData';

export interface SellerTrustSummary {
  id: string;
  username: string;
  avatar?: string | null;
  verified?: boolean;
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
  const buyerProtectionFee = listing.priceWithProtection
    ? Number((listing.priceWithProtection - listing.price).toFixed(2))
    : undefined;

  return {
    itemPrice,
    buyerProtectionFee,
    estimatedTotal: listing.priceWithProtection,
    currency: 'GBP',
    shippingMethod: extras?.shippingMethod ?? null,
    shippingPayer: extras?.shippingPayer ?? null,
    estimatedDeliveryStart: extras?.estimatedDeliveryStart ?? null,
    estimatedDeliveryEnd: extras?.estimatedDeliveryEnd ?? null,
    returnPolicy: extras?.returnPolicy ?? null,
    protectionPolicy: extras?.protectionPolicy ?? {
      available: true,
      label: 'Buyer Protection',
      summary:
        'Items covered by Thryftverse Buyer Protection. If your item doesn\u2019t arrive or doesn\u2019t match the description, you may be eligible for a refund.',
    },
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
