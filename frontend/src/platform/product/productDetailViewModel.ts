/**
 * PRODUCT-01 — Unified Flagship Product Detail Contract
 *
 * Additive, discriminated view-model layer that decouples the three canonical
 * detail screens (direct / auction / co-own) from their raw backend payload
 * shapes. The detail layer must NEVER guess the family from price, route names,
 * missing fields, IDs or client heuristics — family is set authoritatively by
 * the adapter that has real route/backend context.
 *
 * This module is intentionally pure (no React, no network) so it is trivially
 * unit-testable. Adapters consume the existing `listingsApi`, `marketApi` and
 * `listingDetailContract` types and emit a single typed union.
 */

import type { Listing } from '../../data/mockData';
import type {
  AuctionDetail,
  AuctionViewerState,
  AuctionLifecycle,
  AuctionTerminalReason,
  MarketCoOwnAsset,
  CoOwnSettlementMode,
  CoOwnOrderBookEntry,
} from '../../services/marketApi';
import type { ListingCommerceServerContext } from '../../services/listingsApi';
import type {
  SellerTrustSummary,
  ListingCommerceContext,
  ListingEngagementSummary,
} from './listingDetailContract';
import { buildCommerceContext, buildEngagementSummary } from './listingDetailContract';

// ── Common primitives ────────────────────────────────────────────────────────

export type ListingFamily = 'direct' | 'auction' | 'co_own';

export type MediaKind = 'image' | 'video';

export interface ProductMediaItem {
  uri: string;
  kind: MediaKind;
}

export type ViewerRole =
  | 'guest'
  | 'buyer'
  | 'owner'
  | 'seller'
  | 'issuer'
  | 'holder';

export type AvailabilityState =
  | 'available'
  | 'sold'
  | 'unavailable'
  | 'closed'
  | 'ended'
  | 'cancelled';

export interface ProductAttributeRow {
  label: string;
  value: string;
}

/**
 * Shared product information present on every family. Family-specific commerce
 * context lives on the discriminated branch, not here.
 */
export interface ProductDetailCommon {
  /** Stable id used for recommendation / analytics correlation. */
  canonicalListingId: string;
  family: ListingFamily;
  /** Underlying listing id (same as canonical for direct; listingId for auction/co-own). */
  underlyingListingId: string;
  /** Family-specific object id (listing id / auction id / asset id). */
  objectId: string;
  title: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  condition: string | null;
  conditionLabel: string | null;
  size: string | null;
  media: ProductMediaItem[];
  seller: SellerTrustSummary | null;
  /** Issuer trust for co-own; null for direct/auction. */
  issuer: SellerTrustSummary | null;
  engagement: ListingEngagementSummary;
  /** listingId to feed into the recommendation service. */
  recommendationSeedId: string;
  shareUrl: string;
  viewerRole: ViewerRole;
  availability: AvailabilityState;
  /** True when the viewer has wishlisted (heart) this object. */
  isLiked: boolean;
  /** True when the viewer has saved this object to any collection. */
  isSavedToCollection: boolean;
  /** Whether a report action is available to the viewer. */
  canReport: boolean;
  /** Category-aware attribute rows derived from authoritative fields only. */
  attributes: ProductAttributeRow[];
}

// ── Direct family context ────────────────────────────────────────────────────

export interface DirectFamilyContext {
  family: 'direct';
  itemPrice: number;
  originalPrice: number | null;
  buyerProtectionTotal: number | null;
  commerce: ListingCommerceContext;
  /** Stock/quantity when the backend actually provides it; null = unknown. */
  quantity: number | null;
  shippingMethod: string | null;
  shippingPayer: 'buyer' | 'seller' | null;
  deliveryEstimateStart: string | null;
  deliveryEstimateEnd: string | null;
  returnPolicy: ListingCommerceContext['returnPolicy'];
  authenticity: ListingCommerceContext['authenticity'];
  capabilities: {
    canBuy: boolean;
    canOffer: boolean;
    canBasket: boolean;
    canMessage: boolean;
    canManage: boolean;
    canEdit: boolean;
  };
}

// ── Auction family context ───────────────────────────────────────────────────

export interface AuctionFamilyContext {
  family: 'auction';
  auctionId: string;
  lifecycle: AuctionLifecycle;
  /** Authoritative server time snapshot (ISO) used for countdown truth. */
  serverNow: string | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  bidCount: number;
  viewerState: AuctionViewerState;
  /** Viewer's current highest bid when participating; null when unknown. */
  viewerHighestBidGbp: number | null;
  buyNowPriceGbp: number | null;
  isWatched: boolean;
  winnerBidderId: string | null;
  terminalReason: AuctionTerminalReason;
  settledAt: string | null;
  cancelledAt: string | null;
  capabilities: {
    canBid: boolean;
    canBuyNow: boolean;
    /** Private seller offer — separate from bidding. */
    canOffer: boolean;
    canWatch: boolean;
    canMessageSeller: boolean;
    canManage: boolean;
  };
}

// ── Co-own family context ────────────────────────────────────────────────────

export interface CoOwnOrderBookSummary {
  bestBid: CoOwnOrderBookEntry | null;
  bestAsk: CoOwnOrderBookEntry | null;
  bidDepth: number;
  askDepth: number;
}

export interface CoOwnFamilyContext {
  family: 'co_own';
  assetId: string;
  unitPriceGbp: number;
  unitPriceStable: number | null;
  availableUnits: number;
  totalUnits: number;
  viewerUnits: number;
  viewerOwnershipPct: number;
  holders: number;
  settlementMode: CoOwnSettlementMode;
  marketMovePct24h: number;
  volume24hGbp: number;
  isOpen: boolean;
  orderBook: CoOwnOrderBookSummary | null;
  capabilities: {
    canBuyUnits: boolean;
    canSellUnits: boolean;
    /** Buyout / unit-price offer per authoritative co-own contract. */
    canOffer: boolean;
    canMessageIssuer: boolean;
    canManage: boolean;
  };
}

// ── Discriminated union ──────────────────────────────────────────────────────

export type ProductDetailViewModel =
  | (ProductDetailCommon & DirectFamilyContext)
  | (ProductDetailCommon & AuctionFamilyContext)
  | (ProductDetailCommon & CoOwnFamilyContext);

// ── Family narrowing helpers ─────────────────────────────────────────────────

export function isDirectViewModel(
  vm: ProductDetailViewModel
): vm is ProductDetailCommon & DirectFamilyContext {
  return vm.family === 'direct';
}

export function isAuctionViewModel(
  vm: ProductDetailViewModel
): vm is ProductDetailCommon & AuctionFamilyContext {
  return vm.family === 'auction';
}

export function isCoOwnViewModel(
  vm: ProductDetailViewModel
): vm is ProductDetailCommon & CoOwnFamilyContext {
  return vm.family === 'co_own';
}

// ── Media helpers ────────────────────────────────────────────────────────────

function isVideo(uri: string): boolean {
  return /\.(mp4|mov|webm|m4v)$/i.test(uri) || uri.includes('video');
}

export function mediaFromUris(uris: string[]): ProductMediaItem[] {
  return uris
    .filter((u) => !!u)
    .map((uri) => ({ uri, kind: isVideo(uri) ? 'video' : 'image' }));
}

// ── Attribute derivation (authoritative fields only) ─────────────────────────

function buildDirectAttributes(
  listing: Listing
): ProductAttributeRow[] {
  const rows: ProductAttributeRow[] = [];
  if (listing.category) rows.push({ label: 'Category', value: listing.category });
  if (listing.subcategory) rows.push({ label: 'Type', value: listing.subcategory });
  if (listing.brand) rows.push({ label: 'Brand', value: listing.brand });
  if (listing.size) rows.push({ label: 'Size', value: listing.size });
  if (listing.condition) rows.push({ label: 'Condition', value: listing.condition });
  return rows;
}

function buildAuctionAttributes(
  auction: AuctionDetail
): ProductAttributeRow[] {
  const rows: ProductAttributeRow[] = [];
  if (auction.brand) rows.push({ label: 'Brand', value: auction.brand });
  if (auction.category) rows.push({ label: 'Category', value: auction.category });
  if (auction.conditionLabel) rows.push({ label: 'Condition', value: auction.conditionLabel });
  if (auction.listingPriceGbp != null) {
    rows.push({ label: 'List price', value: `£${auction.listingPriceGbp.toFixed(2)}` });
  }
  return rows;
}

function buildCoOwnAttributes(
  asset: MarketCoOwnAsset
): ProductAttributeRow[] {
  const rows: ProductAttributeRow[] = [];
  rows.push({ label: 'Settlement', value: asset.settlementMode });
  rows.push({ label: 'Total supply', value: `${asset.totalUnits} units` });
  if (asset.issuerJurisdiction) {
    rows.push({ label: 'Jurisdiction', value: asset.issuerJurisdiction });
  }
  return rows;
}

// ── Availability resolution ──────────────────────────────────────────────────

function resolveDirectAvailability(listing: Listing): AvailabilityState {
  if (listing.isSold) return 'sold';
  return 'available';
}

function resolveAuctionAvailability(
  lifecycle: AuctionLifecycle
): AvailabilityState {
  switch (lifecycle) {
    case 'ended':
      return 'ended';
    case 'cancelled':
      return 'cancelled';
    case 'settled':
      return 'ended';
    default:
      return 'available';
  }
}

function resolveCoOwnAvailability(asset: MarketCoOwnAsset): AvailabilityState {
  if (!asset.isOpen) return 'closed';
  if (asset.availableUnits <= 0) return 'unavailable';
  return 'available';
}

// ── Viewer role resolution ───────────────────────────────────────────────────

function resolveDirectRole(
  listing: Listing,
  currentUserId?: string
): ViewerRole {
  if (!currentUserId) return 'guest';
  if (listing.sellerId === currentUserId) return 'owner';
  return 'buyer';
}

function resolveAuctionRole(
  viewerState: AuctionViewerState
): ViewerRole {
  if (viewerState === 'seller') return 'seller';
  if (viewerState === 'won' || viewerState === 'leading' || viewerState === 'outbid' || viewerState === 'watching') {
    return 'buyer';
  }
  return 'guest';
}

function resolveCoOwnRole(
  asset: MarketCoOwnAsset,
  viewerUnits: number,
  currentUserId?: string
): ViewerRole {
  if (!currentUserId) return 'guest';
  if (asset.issuerId === currentUserId) return 'issuer';
  if (viewerUnits > 0) return 'holder';
  return 'buyer';
}

// ── Share URL ────────────────────────────────────────────────────────────────

function directShareUrl(listingId: string): string {
  return `https://thryftverse.com/item/${listingId}`;
}

function auctionShareUrl(auctionId: string): string {
  return `https://thryftverse.com/auction/${auctionId}`;
}

function coOwnShareUrl(assetId: string): string {
  return `https://thryftverse.com/asset/${assetId}`;
}

// ── Adapters ─────────────────────────────────────────────────────────────────

export interface DirectAdapterInput {
  listing: Listing;
  commerce?: ListingCommerceServerContext | null;
  seller?: SellerTrustSummary | null;
  currentUserId?: string;
  isLiked?: boolean;
  isSavedToCollection?: boolean;
}

export function buildDirectViewModel(input: DirectAdapterInput): ProductDetailViewModel {
  const { listing, commerce, seller, currentUserId } = input;
  const isLiked = input.isLiked ?? false;
  const isSavedToCollection = input.isSavedToCollection ?? false;
  const isOwner = !!currentUserId && listing.sellerId === currentUserId;
  const availability = resolveDirectAvailability(listing);

  const common: ProductDetailCommon = {
    canonicalListingId: listing.id,
    family: 'direct',
    underlyingListingId: listing.id,
    objectId: listing.id,
    title: listing.title,
    brand: listing.brand ?? null,
    category: listing.category ?? null,
    subcategory: listing.subcategory ?? null,
    description: listing.description ?? null,
    condition: listing.condition ?? null,
    conditionLabel: listing.condition ?? null,
    size: listing.size ?? null,
    media: mediaFromUris(listing.images ?? []),
    seller: seller ?? null,
    issuer: null,
    engagement: buildEngagementSummary(listing),
    recommendationSeedId: listing.id,
    shareUrl: directShareUrl(listing.id),
    viewerRole: resolveDirectRole(listing, currentUserId),
    availability,
    isLiked,
    isSavedToCollection,
    canReport: !isOwner,
    attributes: buildDirectAttributes(listing),
  };

  const commerceContext = buildCommerceContext(listing, commerce ? {
    buyerProtectionFee: commerce.buyerProtectionFee,
    estimatedTotal: commerce.estimatedTotal,
    shippingMethod: commerce.shippingMethod,
    shippingPayer: (commerce.shippingPayer as 'buyer' | 'seller' | null) ?? null,
    protectionPolicy: commerce.protectionPolicy,
    returnPolicy: commerce.returnPolicy,
    authenticity: commerce.authenticity,
  } : undefined);

  const canBuy = !isOwner && availability === 'available';
  const canOffer = canBuy;

  const direct: DirectFamilyContext = {
    family: 'direct',
    itemPrice: listing.price,
    originalPrice: listing.originalPrice ?? null,
    buyerProtectionTotal: commerce?.estimatedTotal ?? null,
    commerce: commerceContext,
    quantity: null,
    shippingMethod: commerce?.shippingMethod ?? listing.shippingMethod ?? null,
    shippingPayer: ((commerce?.shippingPayer ?? listing.shippingPayer) as 'buyer' | 'seller' | null) ?? null,
    deliveryEstimateStart: null,
    deliveryEstimateEnd: null,
    returnPolicy: commerceContext.returnPolicy,
    authenticity: commerceContext.authenticity,
    capabilities: {
      canBuy,
      canOffer,
      // Basket only when a real basket contract exists; none today.
      canBasket: false,
      canMessage: !isOwner,
      canManage: isOwner,
      canEdit: isOwner,
    },
  };

  return { ...common, ...direct };
}

export interface AuctionAdapterInput {
  auction: AuctionDetail;
  seller?: SellerTrustSummary | null;
  currentUserId?: string;
  isLiked?: boolean;
  isSavedToCollection?: boolean;
  /** Whether the seller has enabled private offers (authoritative). */
  offersEnabled?: boolean;
}

export function buildAuctionViewModel(input: AuctionAdapterInput): ProductDetailViewModel {
  const { auction, seller, currentUserId } = input;
  const isLiked = input.isLiked ?? false;
  const isSavedToCollection = input.isSavedToCollection ?? false;
  const isSeller = auction.viewerState === 'seller';
  const availability = resolveAuctionAvailability(auction.lifecycle);
  const media = mediaFromUris(auction.imageUrl ? [auction.imageUrl] : []);

  const common: ProductDetailCommon = {
    canonicalListingId: auction.listingId,
    family: 'auction',
    underlyingListingId: auction.listingId,
    objectId: auction.id,
    title: auction.title,
    brand: auction.brand,
    category: auction.category,
    subcategory: null,
    description: auction.description,
    condition: auction.conditionLabel,
    conditionLabel: auction.conditionLabel,
    size: null,
    media,
    seller: seller ?? {
      id: auction.seller.id,
      username: auction.seller.username,
      avatar: auction.seller.avatarUrl,
      verified: false,
    },
    issuer: null,
    engagement: auction.bidCount > 0 ? { offers: auction.bidCount } : {},
    recommendationSeedId: auction.listingId,
    shareUrl: auctionShareUrl(auction.id),
    viewerRole: resolveAuctionRole(auction.viewerState),
    availability,
    isLiked,
    isSavedToCollection,
    canReport: !isSeller,
    attributes: buildAuctionAttributes(auction),
  };

  const isTerminal = auction.lifecycle === 'ended' || auction.lifecycle === 'cancelled' || auction.lifecycle === 'settled';
  const canBid = !isSeller && !isTerminal && auction.lifecycle !== 'upcoming'
    ? auction.lifecycle === 'live'
    : false;
  // Buy-now availability is authoritative from the auction payload + business rules.
  const buyNowAvailable = auction.buyNowPriceGbp != null && !isSeller && !isTerminal;

  const auctionCtx: AuctionFamilyContext = {
    family: 'auction',
    auctionId: auction.id,
    lifecycle: auction.lifecycle,
    serverNow: null,
    startsAt: auction.startsAt,
    endsAt: auction.endsAt,
    startingBidGbp: auction.startingBidGbp,
    currentBidGbp: auction.currentBidGbp,
    minimumNextBidGbp: auction.minimumNextBidGbp,
    bidCount: auction.bidCount,
    viewerState: auction.viewerState,
    viewerHighestBidGbp: null,
    buyNowPriceGbp: auction.buyNowPriceGbp,
    isWatched: auction.isWatched,
    winnerBidderId: auction.winnerBidderId,
    terminalReason: auction.terminalReason,
    settledAt: auction.settledAt,
    cancelledAt: auction.cancelledAt,
    capabilities: {
      canBid,
      canBuyNow: buyNowAvailable,
      // Private offers are a separate capability; disabled until backend exposes it.
      canOffer: !!input.offersEnabled && !isSeller && !isTerminal,
      canWatch: !isSeller,
      canMessageSeller: !isSeller,
      canManage: isSeller,
    },
  };

  return { ...common, ...auctionCtx };
}

export interface CoOwnAdapterInput {
  asset: MarketCoOwnAsset;
  viewerUnits: number;
  orderBook?: { bids: CoOwnOrderBookEntry[]; asks: CoOwnOrderBookEntry[] } | null;
  issuer?: SellerTrustSummary | null;
  currentUserId?: string;
  isLiked?: boolean;
  isSavedToCollection?: boolean;
  /** Whether buyout offers are enabled by the authoritative co-own contract. */
  buyoutOffersEnabled?: boolean;
}

export function buildCoOwnViewModel(input: CoOwnAdapterInput): ProductDetailViewModel {
  const { asset, viewerUnits, orderBook, issuer, currentUserId } = input;
  const isLiked = input.isLiked ?? false;
  const isSavedToCollection = input.isSavedToCollection ?? false;
  const isIssuer = !!currentUserId && asset.issuerId === currentUserId;
  const isHolder = viewerUnits > 0;
  const availability = resolveCoOwnAvailability(asset);
  const media = mediaFromUris(asset.imageUrl ? [asset.imageUrl] : []);
  const totalUnits = asset.totalUnits > 0 ? asset.totalUnits : 0;
  const viewerOwnershipPct = totalUnits > 0 ? (viewerUnits / totalUnits) * 100 : 0;

  const common: ProductDetailCommon = {
    canonicalListingId: asset.listingId,
    family: 'co_own',
    underlyingListingId: asset.listingId,
    objectId: asset.id,
    title: asset.title,
    brand: null,
    category: null,
    subcategory: null,
    description: null,
    condition: null,
    conditionLabel: null,
    size: null,
    media,
    seller: null,
    issuer: issuer ?? {
      id: asset.issuerId,
      username: asset.issuerId.slice(0, 12),
      avatar: null,
      verified: false,
    },
    engagement: {},
    recommendationSeedId: asset.listingId,
    shareUrl: coOwnShareUrl(asset.id),
    viewerRole: resolveCoOwnRole(asset, viewerUnits, currentUserId),
    availability,
    isLiked,
    isSavedToCollection,
    canReport: !isIssuer,
    attributes: buildCoOwnAttributes(asset),
  };

  const orderBookSummary: CoOwnOrderBookSummary | null = orderBook
    ? {
        bestBid: orderBook.bids.length > 0 ? orderBook.bids[0] : null,
        bestAsk: orderBook.asks.length > 0 ? orderBook.asks[0] : null,
        bidDepth: orderBook.bids.length,
        askDepth: orderBook.asks.length,
      }
    : null;

  const marketOpen = asset.isOpen;
  const canBuyUnits = !isIssuer && marketOpen && asset.availableUnits > 0;
  const canSellUnits = isHolder && marketOpen;

  const coOwnCtx: CoOwnFamilyContext = {
    family: 'co_own',
    assetId: asset.id,
    unitPriceGbp: asset.unitPriceGbp,
    unitPriceStable: asset.unitPriceStable ?? null,
    availableUnits: Math.max(0, asset.availableUnits),
    totalUnits,
    viewerUnits,
    viewerOwnershipPct,
    holders: asset.holders,
    settlementMode: asset.settlementMode,
    marketMovePct24h: asset.marketMovePct24h ?? 0,
    volume24hGbp: asset.volume24hGbp ?? 0,
    isOpen: marketOpen,
    orderBook: orderBookSummary,
    capabilities: {
      canBuyUnits,
      canSellUnits,
      canOffer: !!input.buyoutOffersEnabled && !isIssuer && marketOpen,
      canMessageIssuer: !isIssuer,
      canManage: isIssuer,
    },
  };

  return { ...common, ...coOwnCtx };
}

// ── Route resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the canonical detail route for a given family. Used by entry points
 * (cards, feeds, notifications) to guarantee every listing opens the correct
 * family screen — no client heuristics on price or fields.
 */
export interface DetailRouteResolution {
  route: 'ItemDetail' | 'AuctionDetail' | 'AssetDetail';
  params: { itemId: string } | { auctionId: string } | { assetId: string };
}

export function resolveDetailRoute(
  family: ListingFamily,
  objectId: string
): DetailRouteResolution {
  switch (family) {
    case 'direct':
      return { route: 'ItemDetail', params: { itemId: objectId } };
    case 'auction':
      return { route: 'AuctionDetail', params: { auctionId: objectId } };
    case 'co_own':
      return { route: 'AssetDetail', params: { assetId: objectId } };
  }
}
