/**
 * Commerce fixtures — owned by the commerce department.
 * Offers, per-order detail (timeline/carrier/breakdown), and the fee
 * helpers the bag/checkout/order surfaces share.
 *
 * Fixture-mode mutations (sendOffer, recordOrder) write into these arrays
 * the same way data.sendMessage mutates CONVERSATIONS — session-local
 * truth, honest about what the backend would own in live mode.
 */

import type { Listing, ListingCondition, Order, User } from '@/lib/contracts/domain';
import {
  BUNDLE_RULE,
  LISTINGS,
  MY_LISTINGS,
  ORDERS,
  USERS,
  listingById,
  sellerGroups,
  userById,
} from '@/lib/data/fixtures';

const ALL_LISTINGS = [...LISTINGS, ...MY_LISTINGS];

// ============================================================================
// OFFERS — mirrors mobile ListingOffer (services/listingOffersApi.ts)
// ============================================================================

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled';

export interface CommerceOffer {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  /** The current amount on the table — the buyer's offer, or the seller's
   *  counter once status === 'countered'. */
  amount: number;
  originalPrice: number;
  status: OfferStatus;
  /** Who placed the standing offer — counterparty counters flip this. */
  offeredByUserId: string;
  counterRound: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export const OFFERS: CommerceOffer[] = [
  {
    // Received — buyer 'u4' offered on my Stüssy tee (ml3 is sold; use ml1)
    id: 'of-1',
    listingId: 'ml1',
    buyerId: 'u4',
    sellerId: 'me',
    amount: 22,
    originalPrice: 28,
    status: 'pending',
    offeredByUserId: 'u4',
    counterRound: 0,
    createdAt: '2026-09-25T08:10:00Z',
    updatedAt: '2026-09-25T08:10:00Z',
    expiresAt: '2026-09-27T08:10:00Z',
  },
  {
    // Received — already countered by me, waiting on the buyer
    id: 'of-2',
    listingId: 'ml2',
    buyerId: 'u2',
    sellerId: 'me',
    amount: 32,
    originalPrice: 35,
    status: 'countered',
    offeredByUserId: 'me',
    counterRound: 1,
    createdAt: '2026-09-23T15:40:00Z',
    updatedAt: '2026-09-24T09:05:00Z',
    expiresAt: '2026-09-26T09:05:00Z',
  },
  {
    // Received — accepted, became a completed sale (ord-1021)
    id: 'of-3',
    listingId: 'ml3',
    buyerId: 'u4',
    sellerId: 'me',
    amount: 32,
    originalPrice: 32,
    status: 'accepted',
    offeredByUserId: 'u4',
    counterRound: 0,
    createdAt: '2026-08-27T18:20:00Z',
    updatedAt: '2026-08-28T09:00:00Z',
  },
  {
    // Sent — my offer on the Jordans, countered by the seller
    id: 'of-4',
    listingId: 'l4',
    buyerId: 'me',
    sellerId: 'u3',
    amount: 135,
    originalPrice: 145,
    status: 'countered',
    offeredByUserId: 'u3',
    counterRound: 1,
    createdAt: '2026-09-25T09:20:00Z',
    updatedAt: '2026-09-25T09:22:00Z',
    expiresAt: '2026-09-27T09:22:00Z',
  },
  {
    // Sent — still pending
    id: 'of-5',
    listingId: 'l5',
    buyerId: 'me',
    sellerId: 'u5',
    amount: 34,
    originalPrice: 38,
    status: 'pending',
    offeredByUserId: 'me',
    counterRound: 0,
    createdAt: '2026-09-25T11:45:00Z',
    updatedAt: '2026-09-25T11:45:00Z',
    expiresAt: '2026-09-27T11:45:00Z',
  },
  {
    // Sent — declined
    id: 'of-6',
    listingId: 'l10',
    buyerId: 'me',
    sellerId: 'u3',
    amount: 210,
    originalPrice: 260,
    status: 'declined',
    offeredByUserId: 'me',
    counterRound: 0,
    createdAt: '2026-09-21T13:00:00Z',
    updatedAt: '2026-09-21T19:30:00Z',
  },
];

/** Offer direction is derived — 'me' is the fixture session user. */
export function offerDirection(offer: CommerceOffer, viewerId = 'me'): 'received' | 'sent' {
  return offer.sellerId === viewerId ? 'received' : 'sent';
}

/** Fixture-mode send — appends a pending sent offer (session-local truth). */
export function recordSentOffer(listing: Listing, amount: number): CommerceOffer {
  const offer: CommerceOffer = {
    id: `of-local-${Date.now()}`,
    listingId: listing.id,
    buyerId: 'me',
    sellerId: listing.sellerId,
    amount,
    originalPrice: listing.price,
    status: 'pending',
    offeredByUserId: 'me',
    counterRound: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
  };
  OFFERS.push(offer);
  return offer;
}

/** Counter a standing offer — flips the author and bumps the round. */
export function counterOffer(offer: CommerceOffer, amount: number, byUserId = 'me') {
  offer.amount = amount;
  offer.status = 'countered';
  offer.offeredByUserId = byUserId;
  offer.counterRound += 1;
  offer.updatedAt = new Date().toISOString();
}

// ============================================================================
// FEES — buyer protection + shipping, one source for bag/checkout/orders
// ============================================================================

/** Flat fixture postage — mirrors the mobile "single persisted quote" path. */
export const SHIPPING_FEE = 3.49;

/**
 * Buyer-protection fee for a listing. Prefers the server-computed
 * priceWithProtection when present; otherwise the same 5% + £0.70 shape
 * the fixtures were authored with.
 */
export function protectionFeeFor(listing: Pick<Listing, 'price' | 'priceWithProtection'>): number {
  if (typeof listing.priceWithProtection === 'number') {
    return Math.max(0, listing.priceWithProtection - listing.price);
  }
  return Math.round((listing.price * 0.05 + 0.7) * 100) / 100;
}

export interface OrderTotals {
  items: number;
  protectionFee: number;
  shippingFee: number;
  total: number;
}

export function orderTotals(listings: Pick<Listing, 'price' | 'priceWithProtection'>[]): OrderTotals {
  const items = listings.reduce((sum, l) => sum + l.price, 0);
  const protectionFee = listings.reduce((sum, l) => sum + protectionFeeFor(l), 0);
  const shippingFee = listings.length > 0 ? SHIPPING_FEE : 0;
  return {
    items,
    protectionFee,
    shippingFee,
    total: items + protectionFee + shippingFee,
  };
}

// ============================================================================
// ORDER DETAIL — timeline, carrier and money breakdown per order id
// ============================================================================

export interface OrderTimelineStep {
  key: 'ordered' | 'paid' | 'shipped' | 'delivered';
  label: string;
  at: string | null;
}

export interface OrderDetailInfo {
  orderId: string;
  carrier: string | null;
  service: string | null;
  itemPrice: number;
  protectionFee: number;
  shippingFee: number;
  timeline: OrderTimelineStep[];
}

export const ORDER_DETAILS: Record<string, OrderDetailInfo> = {
  // Breakdowns always sum to Order.totalPrice — the ledger stays honest.
  'ord-1042': {
    orderId: 'ord-1042',
    carrier: 'Royal Mail',
    service: 'Tracked 48',
    itemPrice: 95,
    protectionFee: 5.3,
    shippingFee: 0,
    timeline: [
      { key: 'ordered', label: 'Order placed', at: '2026-09-24T18:00:00Z' },
      { key: 'shipped', label: 'Shipped by ellawears', at: '2026-09-25T08:30:00Z' },
      { key: 'delivered', label: 'Delivered', at: null },
    ],
  },
  'ord-1038': {
    orderId: 'ord-1038',
    carrier: 'Royal Mail',
    service: 'Tracked 48',
    itemPrice: 175,
    protectionFee: 9.1,
    shippingFee: 0,
    timeline: [
      { key: 'ordered', label: 'Order placed', at: '2026-09-10T11:00:00Z' },
      { key: 'shipped', label: 'Shipped by ellawears', at: '2026-09-11T09:15:00Z' },
      { key: 'delivered', label: 'Delivered', at: '2026-09-13T14:20:00Z' },
    ],
  },
  'ord-1021': {
    orderId: 'ord-1021',
    carrier: 'Evri',
    service: 'Standard',
    itemPrice: 32,
    protectionFee: 2.9,
    shippingFee: 0,
    timeline: [
      { key: 'ordered', label: 'Order placed', at: '2026-08-28T09:00:00Z' },
      { key: 'shipped', label: 'You shipped this order', at: '2026-08-29T10:00:00Z' },
      { key: 'delivered', label: 'Delivered', at: '2026-09-01T16:40:00Z' },
    ],
  },
};

/**
 * Resolve the detail view-model for an order. Fixture entries win; a
 * checkout-created order derives its breakdown from the listing totals so
 * the detail page always resolves.
 */
export function orderDetailFor(order: Order): OrderDetailInfo {
  const fixture = ORDER_DETAILS[order.id];
  if (fixture) return fixture;
  const listing = listingById(order.listingId);
  const itemPrice = listing?.price ?? order.totalPrice;
  const protectionFee = listing ? protectionFeeFor(listing) : 0;
  const shippingFee = Math.max(0, order.totalPrice - itemPrice - protectionFee);
  const isSale = order.sellerId === 'me';
  return {
    orderId: order.id,
    carrier: 'Royal Mail',
    service: 'Tracked 48',
    itemPrice,
    protectionFee,
    shippingFee,
    timeline: [
      { key: 'ordered', label: 'Order placed', at: order.createdAt },
      {
        key: 'shipped',
        label: isSale ? 'You shipped this order' : 'Shipped by seller',
        at: order.status === 'shipped' || order.status === 'delivered' ? order.createdAt : null,
      },
      {
        key: 'delivered',
        label: 'Delivered',
        at: order.status === 'delivered' ? order.createdAt : null,
      },
    ],
  };
}

/** Fixture-mode purchase — appends the order the checkout just "paid". */
export function recordOrder(listings: Listing[]): Order {
  const first = listings[0];
  const totals = orderTotals(listings);
  const order: Order = {
    id: `ord-${Date.now()}`,
    listingId: first?.id ?? '',
    buyerId: 'me',
    sellerId: first?.sellerId ?? '',
    status: 'pending',
    totalPrice: Math.round(totals.total * 100) / 100,
    createdAt: new Date().toISOString(),
  };
  ORDERS.push(order);
  ORDER_DETAILS[order.id] = {
    orderId: order.id,
    carrier: 'Royal Mail',
    service: 'Tracked 48',
    itemPrice: totals.items,
    protectionFee: totals.protectionFee,
    shippingFee: totals.shippingFee,
    timeline: [{ key: 'ordered', label: 'Order placed', at: order.createdAt }],
  };
  return order;
}

/** Fixture-mode publish — the sell flow's draft becomes a real listing in
 *  MY_LISTINGS so the PDP, profile closet and my-listings surfaces resolve it. */
export interface NewListingInput {
  title: string;
  brand: string | null;
  size: string | null;
  condition: ListingCondition;
  price: number;
  images: string[];
  category: string;
  subcategory: string | null;
  description: string;
  /** Discovery tags authored in the sell flow — carried on the record. */
  tags?: string[];
}

export function recordListing(input: NewListingInput, seller: User): Listing {
  const listing: Listing & { tags?: string[] } = {
    id: `local-${Date.now()}`,
    title: input.title,
    brand: input.brand,
    size: input.size,
    condition: input.condition,
    price: input.price,
    images: [...input.images],
    likes: 0,
    views: 0,
    sellerId: seller.id,
    seller: {
      id: seller.id,
      username: seller.username,
      avatar: seller.avatar,
      rating: seller.rating,
      reviewCount: seller.reviewCount,
      verified: seller.isVerified,
    },
    category: input.category,
    subcategory: input.subcategory,
    description: input.description,
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  if (input.tags?.length) listing.tags = [...input.tags];
  MY_LISTINGS.unshift(listing);
  return listing;
}

/**
 * Fixture-mode edit — the sell flow's ?edit=<id> path updates an own-listing
 * in place so the PDP, profile closet and seller surfaces keep resolving it.
 * Returns null when the id isn't one of the session user's listings.
 */
export function updateListing(id: string, input: NewListingInput): Listing | null {
  const listing = MY_LISTINGS.find((l) => l.id === id) as
    | (Listing & { tags?: string[] })
    | undefined;
  if (!listing) return null;
  listing.title = input.title;
  listing.brand = input.brand;
  listing.size = input.size;
  listing.condition = input.condition;
  listing.price = input.price;
  if (input.images.length) listing.images = [...input.images];
  listing.category = input.category;
  listing.subcategory = input.subcategory;
  listing.description = input.description;
  listing.tags = input.tags?.length ? [...input.tags] : undefined;
  // Keep the derived protection total consistent with the new price.
  if (listing.priceWithProtection != null) {
    listing.priceWithProtection =
      Math.round((input.price + input.price * 0.05 + 0.7) * 100) / 100;
  }
  return listing;
}

// ============================================================================
// RECOMMENDATIONS — seller rail + similar items band
// ============================================================================

/** Other active listings from the same seller — the "More from" rail. */
export function moreFromSeller(listing: Listing, count = 8): Listing[] {
  return ALL_LISTINGS.filter(
    (l) => l.sellerId === listing.sellerId && l.id !== listing.id && !l.isSold,
  ).slice(0, count);
}

/**
 * Similar items — same category first, then same brand, deduped and
 * excluding the current listing and the seller rail's content.
 */
export function similarListings(listing: Listing, count = 10): Listing[] {
  const scored = ALL_LISTINGS.filter((l) => l.id !== listing.id)
    .map((l) => {
      let score = 0;
      if (l.category === listing.category) score += 2;
      if (l.subcategory && l.subcategory === listing.subcategory) score += 2;
      if (l.brand && l.brand === listing.brand) score += 3;
      return { l, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.l.likes - a.l.likes);
  return scored.map((x) => x.l).slice(0, count);
}

/** Other active items a bag seller lists — the bundle-discount hint rail. */
export function bundleSuggestions(sellerId: string, excludeIds: Set<string>, count = 4): Listing[] {
  return ALL_LISTINGS.filter(
    (l) => l.sellerId === sellerId && !excludeIds.has(l.id) && !l.isSold,
  ).slice(0, count);
}

/** Bundle progress for a same-seller set — count, shortfall, discount. */
export interface BundleProgress {
  /** Items counted toward the bundle (same seller, active, in-bag or staged). */
  count: number;
  /** Items still needed before BUNDLE_RULE unlocks — 0 once qualified. */
  missing: number;
  qualifies: boolean;
  /** £ off the set's item subtotal — 0 until it qualifies. */
  discount: number;
}

/**
 * One honest reading of BUNDLE_RULE for a same-seller set — the PDP
 * bundle rail and the bag both derive "how many more for the discount"
 * from this so the numbers can't drift between surfaces.
 */
export function bundleProgressFor(listings: Listing[]): BundleProgress {
  const group = sellerGroups(listings)[0];
  const count = listings.length;
  return {
    count,
    missing: Math.max(0, BUNDLE_RULE.minItems - count),
    qualifies: group?.qualifies ?? false,
    discount: group?.discount ?? 0,
  };
}

export function counterpartyFor(order: Order, viewerId = 'me') {
  const isBuyer = order.buyerId === viewerId;
  const id = isBuyer ? order.sellerId : order.buyerId;
  return { isBuyer, user: userById(id) ?? USERS.find((u) => u.id === id) ?? null };
}

// ============================================================================
// ORDER WORKFLOW — commerce-owned depth: enriched order records, per-order
// enrichment (tracking trail, authentication, return cases) and the
// fixture-mode mutations the detail surface drives. Mirrors the mobile
// OrderDetailScreen data shape (useOrderDetail + returnsApi + commerceApi).
// ============================================================================

import type {
  CommerceOrder,
  DispatchExtension,
  FulfilmentSnapshot,
  OrderAuthentication,
  OrderTrackingEvent,
  ReturnCase,
  ReturnCaseStatus,
  ReturnRemedy,
} from '@/lib/contracts/domain';
import { REVIEWS } from '@/lib/data/fixtures';

/** Fixture-clock helpers — deadlines are relative to the session so the
 *  dispatch countdown / ETA / step-in windows stay honest on any date. */
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const inDays = (d: number) => inHours(d * 24);
const daysAgo = (d: number) => hoursAgo(d * 24);

/** Physical-verification floor — orders at/above this item value carry an
 *  authentication record (the buyer paid for verification at checkout). */
export const AUTHENTICATION_THRESHOLD_GBP = 150;

/**
 * Enriched order records beyond the base ORDERS fixture — they exercise the
 * full workflow vocabulary (paid / in transit / delivery failed / delivered
 * awaiting confirmation / completed / cancelled / created) the capability
 * resolver understands. Total prices stay ledger-honest:
 * item + protectionFeeFor(listing) + postage.
 */
export const COMMERCE_ORDER_EXTRAS: CommerceOrder[] = [
  {
    // Seller needs action — paid, dispatch countdown running.
    id: 'ord-1050',
    listingId: 'ml1', // Oversized Denim Shirt, £28 — mine
    buyerId: 'u4',
    sellerId: 'me',
    status: 'paid',
    totalPrice: 33.59,
    createdAt: hoursAgo(20),
    shipByDate: inHours(30),
    estimatedReleaseAt: inDays(7),
    fulfilmentSnapshot: {
      quoteId: 'q-1050', quoteHash: 'qh-1050',
      carrierId: 'Royal Mail', serviceCode: 'tracked48',
      serviceName: 'Royal Mail Tracked 48',
      deliveryMode: 'integrated',
      etaMinDays: 2, etaMaxDays: 3, trackingIncluded: true,
      shipByDate: inHours(30),
      destinationSummary: 'Manchester, UK',
      parcelProfile: { maxWeightKg: 2, maxLengthCm: 45 },
    },
  },
  {
    // Buyer, paid — seller proposed a dispatch extension awaiting response.
    id: 'ord-1051',
    listingId: 'l20', // Denim Trucker Jacket, £140 — u5
    buyerId: 'me',
    sellerId: 'u5',
    status: 'paid',
    totalPrice: 151.19,
    createdAt: daysAgo(1),
    shipByDate: inDays(2),
    estimatedReleaseAt: inDays(9),
    fulfilmentSnapshot: {
      quoteId: 'q-1051', quoteHash: 'qh-1051',
      carrierId: 'Evri', serviceCode: 'standard',
      serviceName: 'Evri Standard',
      deliveryMode: 'integrated',
      etaMinDays: 3, etaMaxDays: 5, trackingIncluded: true,
      shipByDate: inDays(2),
      destinationSummary: 'London, UK',
      parcelProfile: { maxWeightKg: 5, maxLengthCm: 60 },
    },
    dispatchExtension: {
      id: 'ext-1051',
      days: 3,
      proposedShipBy: inDays(5),
      proposedBy: 'u5',
      status: 'pending',
      createdAt: hoursAgo(4),
    },
  },
  {
    // Buyer, in transit — premium item under physical verification.
    id: 'ord-1052',
    listingId: 'l8', // Quilted Leather Shoulder Bag, £2450 — u1
    buyerId: 'me',
    sellerId: 'u1',
    status: 'in transit',
    totalPrice: 2573.2,
    trackingNumber: 'DHL882390114GB',
    createdAt: daysAgo(2),
    shipByDate: hoursAgo(40),
    estimatedDeliveryAt: inHours(30),
    estimatedReleaseAt: inDays(6),
    inspectionDeadlineAt: inDays(4),
    verificationRequested: true,
    fulfilmentSnapshot: {
      quoteId: 'q-1052', quoteHash: 'qh-1052',
      carrierId: 'DHL', serviceCode: 'express',
      serviceName: 'DHL Express — verified handling',
      deliveryMode: 'integrated',
      etaMinDays: 1, etaMaxDays: 2, trackingIncluded: true,
      shipByDate: hoursAgo(40),
      destinationSummary: 'London, UK',
      parcelProfile: { maxWeightKg: 3, maxLengthCm: 40 },
    },
  },
  {
    // Buyer, carrier failure — delivery attempted and failed.
    id: 'ord-1053',
    listingId: 'l15', // Tailored Wool Blazer, £140 — u2
    buyerId: 'me',
    sellerId: 'u2',
    status: 'delivery failed',
    totalPrice: 151.19,
    trackingNumber: 'RM771203665GB',
    createdAt: daysAgo(6),
    estimatedReleaseAt: inDays(4),
    fulfilmentSnapshot: {
      quoteId: 'q-1053', quoteHash: 'qh-1053',
      carrierId: 'Royal Mail', serviceCode: 'tracked48',
      serviceName: 'Royal Mail Tracked 48',
      deliveryMode: 'integrated',
      etaMinDays: 2, etaMaxDays: 3, trackingIncluded: true,
      shipByDate: daysAgo(5),
      destinationSummary: 'London, UK',
      parcelProfile: { maxWeightKg: 2, maxLengthCm: 45 },
    },
  },
  {
    // Buyer, delivered — inspection window open, escrow awaiting confirm.
    id: 'ord-1054',
    listingId: 'l9', // Oversized Wool Coat, £320 — u6
    buyerId: 'me',
    sellerId: 'u6',
    status: 'delivered',
    totalPrice: 336.7,
    trackingNumber: 'EV3009128445',
    createdAt: daysAgo(5),
    estimatedReleaseAt: inDays(2),
    inspectionDeadlineAt: inDays(2),
    verificationRequested: true,
    fulfilmentSnapshot: {
      quoteId: 'q-1054', quoteHash: 'qh-1054',
      carrierId: 'Evri', serviceCode: 'nextday',
      serviceName: 'Evri Next Day',
      deliveryMode: 'integrated',
      etaMinDays: 1, etaMaxDays: 1, trackingIncluded: true,
      shipByDate: daysAgo(4),
      destinationSummary: 'London, UK',
      parcelProfile: { maxWeightKg: 5, maxLengthCm: 60 },
    },
  },
  {
    // Seller, delivered — sale awaiting buyer confirmation/completion.
    id: 'ord-1055',
    listingId: 'ml2', // Pleated Trousers, £35 — mine
    buyerId: 'u2',
    sellerId: 'me',
    status: 'delivered',
    totalPrice: 40.94,
    trackingNumber: 'RM556702981GB',
    createdAt: daysAgo(4),
    fulfilmentSnapshot: {
      quoteId: 'q-1055', quoteHash: 'qh-1055',
      carrierId: 'Royal Mail', serviceCode: 'tracked48',
      serviceName: 'Royal Mail Tracked 48',
      deliveryMode: 'integrated',
      etaMinDays: 2, etaMaxDays: 3, trackingIncluded: true,
      shipByDate: daysAgo(3),
      destinationSummary: 'Bristol, UK',
      parcelProfile: { maxWeightKg: 2, maxLengthCm: 45 },
    },
  },
  {
    // Buyer, completed — no review yet (Leave review capability).
    id: 'ord-1056',
    listingId: 'l13', // New Balance 550, £55 — u3
    buyerId: 'me',
    sellerId: 'u3',
    status: 'completed',
    totalPrice: 61.94,
    trackingNumber: 'RM883451209GB',
    createdAt: daysAgo(12),
    fulfilmentSnapshot: {
      quoteId: 'q-1056', quoteHash: 'qh-1056',
      carrierId: 'Royal Mail', serviceCode: 'tracked48',
      serviceName: 'Royal Mail Tracked 48',
      deliveryMode: 'integrated',
      etaMinDays: 2, etaMaxDays: 3, trackingIncluded: true,
      shipByDate: daysAgo(11),
      destinationSummary: 'London, UK',
      parcelProfile: { maxWeightKg: 2, maxLengthCm: 45 },
    },
  },
  {
    // Buyer, cancelled — quiet terminal row.
    id: 'ord-1057',
    listingId: 'l22', // Canvas Tote Bag, £22 — u4
    buyerId: 'me',
    sellerId: 'u4',
    status: 'cancelled',
    totalPrice: 54.59,
    createdAt: daysAgo(9),
  },
  {
    // Buyer, delivered with an open return case (not as described).
    id: 'ord-1058',
    listingId: 'l17', // Cat-Eye Sunglasses, £190 — u1
    buyerId: 'me',
    sellerId: 'u1',
    status: 'delivered',
    totalPrice: 203.69,
    trackingNumber: 'RM441209876GB',
    createdAt: daysAgo(3),
    estimatedReleaseAt: inDays(4),
    inspectionDeadlineAt: inDays(1),
    verificationRequested: true,
    fulfilmentSnapshot: {
      quoteId: 'q-1058', quoteHash: 'qh-1058',
      carrierId: 'Royal Mail', serviceCode: 'tracked24',
      serviceName: 'Royal Mail Tracked 24',
      deliveryMode: 'integrated',
      etaMinDays: 1, etaMaxDays: 2, trackingIncluded: true,
      shipByDate: daysAgo(2),
      destinationSummary: 'London, UK',
      parcelProfile: { maxWeightKg: 1, maxLengthCm: 30 },
    },
  },
  {
    // Buyer, created — payment incomplete (Pay capability).
    id: 'ord-1059',
    listingId: 'l18', // Straight Leg Cargo Trousers, £48 — u2
    buyerId: 'me',
    sellerId: 'u2',
    status: 'created',
    totalPrice: 54.59,
    createdAt: hoursAgo(3),
  },
];

/**
 * Per-order enrichment — the "detail read" the mobile app gets from
 * GET /orders/:id (+/tracking, +/authentication, returns case). Keyed by
 * order id; absent keys fall back to the derived detail.
 */
export interface OrderEnrichment {
  carrier?: string | null;
  service?: string | null;
  /** Carrier-scan trail — authored evidence, rendered as the parcel timeline. */
  trackingEvents?: OrderTrackingEvent[];
  shipByDate?: string | null;
  estimatedDeliveryAt?: string | null;
  estimatedReleaseAt?: string | null;
  inspectionDeadlineAt?: string | null;
  verificationRequested?: boolean;
  authentication?: OrderAuthentication | null;
  returnCase?: ReturnCase | null;
  hasReview?: boolean;
  reviewIsAuto?: boolean;
  reviewRating?: number;
  reviewText?: string;
  dispatchExtension?: DispatchExtension | null;
  fulfilmentSnapshot?: FulfilmentSnapshot | null;
  /** Authored timeline override — wins over the derived steps. */
  timeline?: OrderTimelineStep[];
}

export const ORDER_ENRICHMENT: Record<string, OrderEnrichment> = {
  'ord-1042': {
    estimatedDeliveryAt: inDays(2),
    estimatedReleaseAt: inDays(5),
    inspectionDeadlineAt: inDays(4),
    fulfilmentSnapshot: {
      quoteId: 'q-1042', quoteHash: 'qh-1042',
      carrierId: 'Royal Mail', serviceCode: 'tracked48',
      serviceName: 'Royal Mail Tracked 48',
      deliveryMode: 'integrated',
      etaMinDays: 2, etaMaxDays: 3, trackingIncluded: true,
      shipByDate: hoursAgo(24),
      destinationSummary: 'London, UK',
      parcelProfile: { maxWeightKg: 2, maxLengthCm: 45 },
    },
    trackingEvents: [
      { id: 'e-1042-1', at: daysAgo(1) , label: 'Label created', detail: 'Shipping information received', location: 'London' },
      { id: 'e-1042-2', at: hoursAgo(30), label: 'Parcel collected', location: 'ellawears drop-off, London' },
      { id: 'e-1042-3', at: hoursAgo(14), label: 'Arrived at delivery office', location: 'South East DO' },
      { id: 'e-1042-4', at: hoursAgo(5), label: 'Out for delivery', tone: 'normal' },
    ],
  },
  'ord-1038': {
    verificationRequested: true,
    hasReview: true,
    reviewIsAuto: false,
    reviewRating: 5,
    reviewText: 'Beautiful boots, exactly as described — packaged with real care.',
    authentication: {
      orderId: 'ord-1038',
      status: 'authenticated',
      badge: { type: 'EXPERT_VERIFIED', method: 'Expert inspection', certificateId: 'TV-AUTH-4412' },
      updatedAt: '2026-09-11T12:00:00Z',
    },
  },
  'ord-1021': {
    hasReview: true,
    reviewIsAuto: false,
    reviewRating: 5,
    reviewText: 'Great tee, fast dispatch. Would buy again.',
  },
  'ord-1050': {
    carrier: 'Royal Mail',
    service: 'Tracked 48',
  },
  'ord-1051': {
    carrier: 'Evri',
    service: 'Standard',
  },
  'ord-1052': {
    authentication: {
      orderId: 'ord-1052',
      status: 'pending_expert_review',
      updatedAt: hoursAgo(18),
    },
    trackingEvents: [
      { id: 'e-1052-1', at: hoursAgo(40), label: 'Parcel collected', detail: 'Verified handling chain opened', location: 'Chelsea, London' },
      { id: 'e-1052-2', at: hoursAgo(22), label: 'Authentication hub', detail: 'Item logged for expert review', location: 'Thryft Verify, London' },
      { id: 'e-1052-3', at: hoursAgo(6), label: 'Departed hub', location: 'London East Gateway' },
    ],
  },
  'ord-1053': {
    trackingEvents: [
      { id: 'e-1053-1', at: daysAgo(5), label: 'Label created', location: 'Leeds' },
      { id: 'e-1053-2', at: daysAgo(4), label: 'In transit', location: 'National hub' },
      { id: 'e-1053-3', at: daysAgo(2), label: 'Out for delivery', location: 'London East DO' },
      { id: 'e-1053-4', at: daysAgo(2).slice(0, 11) + '14:30:00Z', label: 'Delivery failed', detail: 'No access to the building — card left', location: 'Delivery address', tone: 'danger' },
    ],
  },
  'ord-1054': {
    authentication: {
      orderId: 'ord-1054',
      status: 'authenticated',
      badge: { type: 'EXPERT_VERIFIED', method: 'Expert inspection', certificateId: 'TV-AUTH-5107' },
      updatedAt: daysAgo(4),
    },
    trackingEvents: [
      { id: 'e-1054-1', at: daysAgo(4), label: 'Parcel collected', location: 'Brighton' },
      { id: 'e-1054-2', at: daysAgo(3), label: 'Verification passed', detail: 'Expert inspection complete — certificate issued', tone: 'normal' },
      { id: 'e-1054-3', at: daysAgo(1), label: 'Delivered', detail: 'Signed for at the delivery address' },
    ],
  },
  'ord-1056': {},
  'ord-1058': {
    hasReview: false,
    returnCase: {
      id: 'rc-1058',
      orderId: 'ord-1058',
      status: 'requested',
      reasonCategory: 'not_as_described',
      reasonLabel: 'Item not as described',
      requestedAmountGbp: null,
      stepInEligibleAt: inDays(2),
      createdAt: daysAgo(1),
    },
  },
};

export function orderEnrichmentFor(orderId: string): OrderEnrichment {
  return ORDER_ENRICHMENT[orderId] ?? {};
}

// ─── Order record overlay — session-local mutation truth ─────────────────────
//
// Fixture-mode mutations write overrides keyed by order id (the same pattern
// recordOrder uses on ORDERS). commerceOrderOf applies enrichment + overrides
// so every consumer re-reads the mutated truth after invalidation.

const ORDER_OVERRIDES: Record<string, Partial<CommerceOrder>> = {};

function enrichmentEntry(orderId: string): OrderEnrichment {
  if (!ORDER_ENRICHMENT[orderId]) ORDER_ENRICHMENT[orderId] = {};
  return ORDER_ENRICHMENT[orderId];
}

/** Merge a base Order with its enrichment scalar fields + session overrides. */
export function commerceOrderOf(order: Order): CommerceOrder {
  const enr = ORDER_ENRICHMENT[order.id] ?? {};
  const override = ORDER_OVERRIDES[order.id] ?? {};
  return {
    ...order,
    shipByDate: enr.shipByDate ?? null,
    estimatedDeliveryAt: enr.estimatedDeliveryAt ?? null,
    estimatedReleaseAt: enr.estimatedReleaseAt ?? null,
    inspectionDeadlineAt: enr.inspectionDeadlineAt ?? null,
    verificationRequested:
      enr.verificationRequested === true || enr.authentication != null,
    dispatchExtension: enr.dispatchExtension ?? null,
    fulfilmentSnapshot: enr.fulfilmentSnapshot ?? null,
    ...override,
  };
}

/**
 * The commerce order list — base fixture orders enriched, plus the
 * commerce-owned extras covering the full workflow vocabulary.
 */
export function allCommerceOrders(base: Order[] = ORDERS): CommerceOrder[] {
  const merged = base.map((o) => commerceOrderOf(o));
  const extras = COMMERCE_ORDER_EXTRAS.map((o) => ({
    ...o,
    dispatchExtension:
      ORDER_ENRICHMENT[o.id]?.dispatchExtension !== undefined
        ? ORDER_ENRICHMENT[o.id]?.dispatchExtension
        : o.dispatchExtension,
    ...ORDER_OVERRIDES[o.id],
  }));
  const known = new Set(merged.map((o) => o.id));
  return [...merged, ...extras.filter((o) => !known.has(o.id))];
}

const SHIPPED_OR_LATER = new Set([
  'shipped', 'in transit', 'out for delivery',
  'delivered', 'completed', 'delivery failed', 'returned',
]);
const DELIVERED_SET = new Set(['delivered', 'completed']);
const STATUS_NORMALISE = (s: string) =>
  s.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

/**
 * Detail resolver for the full-vocabulary order — richer than
 * orderDetailFor: enrichment timeline/carrier wins, and the derived
 * fallback understands every workflow status (not just the legacy three).
 */
export function commerceOrderDetailFor(order: CommerceOrder): OrderDetailInfo {
  const enr = ORDER_ENRICHMENT[order.id] ?? {};
  const base = ORDER_DETAILS[order.id];
  const key = STATUS_NORMALISE(order.status === 'pending' ? 'paid' : order.status);
  const listing = listingById(order.listingId);
  const itemPrice = base?.itemPrice ?? listing?.price ?? order.totalPrice;
  const protectionFee = base?.protectionFee ?? (listing ? protectionFeeFor(listing) : 0);
  const shippingFee =
    base?.shippingFee ?? Math.max(0, Math.round((order.totalPrice - itemPrice - protectionFee) * 100) / 100);
  const isSale = order.sellerId === 'me';
  return {
    orderId: order.id,
    carrier: enr.carrier ?? base?.carrier ?? 'Royal Mail',
    service: enr.service ?? base?.service ?? 'Tracked 48',
    itemPrice,
    protectionFee,
    shippingFee,
    timeline: enr.timeline ?? base?.timeline ?? [
      { key: 'ordered' as const, label: 'Order placed', at: order.createdAt },
      // Payment is captured at order placement — a 'created' order is the
      // only state where the paid milestone is still in the future.
      {
        key: 'paid' as const,
        label: 'Paid',
        at: key === 'created' ? null : order.createdAt,
      },
      {
        key: 'shipped' as const,
        label: isSale ? 'You shipped this order' : 'Shipped by seller',
        at: SHIPPED_OR_LATER.has(key) ? order.createdAt : null,
      },
      {
        key: 'delivered' as const,
        label: 'Delivered',
        at: DELIVERED_SET.has(key) ? order.createdAt : null,
      },
    ],
  };
}

// ─── Fixture-mode order mutations ────────────────────────────────────────────
// Mirrors the mobile mutations (commerceApi / returnsApi): each writes the
// overlay/enrichment store so a react-query invalidation re-reads new truth.

function touchTimeline(orderId: string, stepKey: OrderTimelineStep['key'], at: string) {
  const enr = enrichmentEntry(orderId);
  const steps = enr.timeline ?? ORDER_DETAILS[orderId]?.timeline;
  if (steps) {
    const step = steps.find((s) => s.key === stepKey);
    if (step) step.at = at;
    return;
  }
  enr.timeline = [{ key: stepKey, label: stepKey === 'delivered' ? 'Delivered' : 'Shipped', at }];
}

/** Buyer confirmed receipt — releases escrow, lands 'completed'. */
export function confirmOrderReceipt(orderId: string): void {
  ORDER_OVERRIDES[orderId] = { ...ORDER_OVERRIDES[orderId], status: 'completed' };
  touchTimeline(orderId, 'delivered', new Date().toISOString());
}

/** Seller marked the order dispatched — ships with the purchased service. */
export function markOrderDispatched(orderId: string, trackingNumber?: string): void {
  ORDER_OVERRIDES[orderId] = {
    ...ORDER_OVERRIDES[orderId],
    status: 'shipped',
    trackingNumber: trackingNumber ?? `RM${Math.floor(100000000 + Math.random() * 899999999)}GB`,
  };
  touchTimeline(orderId, 'shipped', new Date().toISOString());
}

/** Buyer cancelled an unpaid ('created') order. */
export function cancelCommerceOrder(orderId: string): void {
  ORDER_OVERRIDES[orderId] = { ...ORDER_OVERRIDES[orderId], status: 'cancelled' };
}

/** Buyer responded to a pending dispatch extension. */
export function respondToDispatchExtension(orderId: string, accept: boolean): void {
  const enr = enrichmentEntry(orderId);
  const ext = enr.dispatchExtension ?? allCommerceOrders().find((o) => o.id === orderId)?.dispatchExtension;
  if (!ext || ext.status !== 'pending') return;
  if (accept) {
    // Server-side semantics: the accepted deadline folds into shipByDate and
    // the extension drops off the payload.
    ORDER_OVERRIDES[orderId] = { ...ORDER_OVERRIDES[orderId], shipByDate: ext.proposedShipBy };
    enr.shipByDate = ext.proposedShipBy;
  }
  enr.dispatchExtension = { ...ext, status: accept ? 'accepted' : 'declined' };
}

/** Buyer review — writes the REVIEWS record and marks the order reviewed. */
export function submitOrderReview(orderId: string, rating: number, text: string): void {
  const order = allCommerceOrders().find((o) => o.id === orderId);
  if (!order) return;
  const enr = enrichmentEntry(orderId);
  enr.hasReview = true;
  enr.reviewIsAuto = false;
  enr.reviewRating = rating;
  enr.reviewText = text;
  REVIEWS.unshift({
    id: `rv-${Date.now().toString(36)}`,
    userId: order.sellerId,
    reviewerId: 'me',
    reviewerName: 'you',
    reviewerAvatar: '',
    rating,
    text: text || 'Rated after order completion.',
    date: new Date().toISOString().slice(0, 10),
    isAutomatic: false,
  });
}

// ─── Return cases ────────────────────────────────────────────────────────────

export const RETURN_REASONS: { id: string; label: string; description: string }[] = [
  { id: 'not_as_described', label: 'Item not as described', description: 'Differs from the listing photos or description' },
  { id: 'damaged', label: 'Arrived damaged', description: 'Broken or damaged in transit' },
  { id: 'wrong_item', label: 'Wrong item sent', description: 'A different item arrived' },
  { id: 'authenticity', label: 'Authenticity concern', description: 'The item may not be genuine' },
  { id: 'missing_contents', label: 'Missing contents', description: 'Something is missing from the parcel' },
  { id: 'changed_mind', label: 'Other reason', description: 'Anything else — tell us what happened' },
];

/** Buyer opened a return/refund request on the order. */
export function requestReturnCase(
  orderId: string,
  input: { reasonId: string; reasonLabel: string; note: string; amountGbp: number | null },
): ReturnCase {
  const enr = enrichmentEntry(orderId);
  const rc: ReturnCase = {
    id: `rc-${Date.now().toString(36)}`,
    orderId,
    status: 'requested',
    reasonCategory: input.reasonId,
    reasonLabel: input.reasonLabel,
    requestedAmountGbp: input.amountGbp,
    stepInEligibleAt: inDays(2),
    createdAt: new Date().toISOString(),
  };
  enr.returnCase = rc;
  return rc;
}

/** Buyer asked the platform to step in — mirrors requestReturnStepIn. */
export function requestReturnStepIn(orderId: string): void {
  const rc = enrichmentEntry(orderId).returnCase;
  if (!rc || rc.status === 'appealed') return;
  rc.status = 'appealed';
  rc.appealedAt = new Date().toISOString();
}

/**
 * Legal state-machine transitions for a return case — mirrors
 * ReturnCaseActions / backend VALID_TRANSITIONS. Fixture-mode: writes the
 * next status directly; the server still owns legality in live mode.
 */
export type ReturnCaseTransition =
  | { type: 'decision'; decision: 'approved' | 'rejected'; reason: string }
  | { type: 'reverse_shipment'; carrier: string; trackingNumber: string; labelUrl?: string }
  | { type: 'receipt' }
  | { type: 'inspection'; notes: string; condition: string }
  | { type: 'remedy'; remedy: ReturnRemedy; amountGbp?: number; notes?: string }
  | { type: 'remedy_accept' }
  | { type: 'remedy_reject'; reason: string }
  | { type: 'appeal'; reason: string };

export function applyReturnCaseTransition(orderId: string, action: ReturnCaseTransition): void {
  const rc = enrichmentEntry(orderId).returnCase;
  if (!rc) return;
  switch (action.type) {
    case 'decision':
      rc.status = action.decision === 'approved' ? 'approved' : 'rejected';
      break;
    case 'reverse_shipment':
      rc.status = 'reverse_shipped';
      rc.returnCarrier = action.carrier;
      rc.returnTrackingNumber = action.trackingNumber;
      rc.returnLabelUrl = action.labelUrl ?? null;
      break;
    case 'receipt':
      rc.status = 'received';
      break;
    case 'inspection':
      rc.status = 'inspected';
      rc.remedyNotes = action.notes;
      break;
    case 'remedy':
      rc.status = 'remedy_proposed';
      rc.proposedRemedy = action.remedy;
      rc.remedyAmountGbp = action.amountGbp ?? null;
      rc.remedyNotes = action.notes ?? null;
      break;
    case 'remedy_accept':
      rc.status = 'remedy_accepted';
      break;
    case 'remedy_reject':
    case 'appeal':
      rc.status = 'appealed';
      rc.appealedAt = new Date().toISOString();
      break;
  }
}

export type StepInState = 'not_applicable' | 'pending' | 'eligible' | 'escalated';

/** Port of mobile getStepInState — stepInEligibleAt is authoritative. */
export function getStepInState(
  returnCase: Pick<ReturnCase, 'status' | 'stepInEligibleAt'>,
  now: Date = new Date(),
): { state: StepInState; eligibleAt: string | null } {
  if (returnCase.status === 'appealed') return { state: 'escalated', eligibleAt: null };
  if (!returnCase.stepInEligibleAt) return { state: 'not_applicable', eligibleAt: null };
  const at = new Date(returnCase.stepInEligibleAt).getTime();
  if (!Number.isFinite(at)) return { state: 'not_applicable', eligibleAt: null };
  return now.getTime() >= at
    ? { state: 'eligible', eligibleAt: returnCase.stepInEligibleAt }
    : { state: 'pending', eligibleAt: returnCase.stepInEligibleAt };
}

export const RETURN_CASE_STATUS_LABELS: Record<ReturnCaseStatus, string> = {
  requested: 'Return requested — waiting for the seller',
  evidence_review: 'Return under review',
  approved: 'Return approved',
  rejected: 'Return declined',
  reverse_shipped: 'Return on its way to the seller',
  received: 'Return received by the seller',
  inspected: 'Return inspected',
  remedy_proposed: 'Remedy proposed',
  remedy_accepted: 'Remedy accepted',
  refund_confirmed: 'Refund confirmed',
  appealed: 'Thryft is reviewing this case',
  closed: 'Case closed',
};

const REFUND_REMEDIES: ReadonlySet<ReturnRemedy | null | undefined> = new Set([
  'full_refund', 'partial_refund',
]);

/** Truthful status line — remedy_accepted with a refund remedy means the
 *  proposal is accepted, not that money moved (that's refund_confirmed). */
export function getReturnCaseStatusLabel(
  returnCase: Pick<ReturnCase, 'status' | 'proposedRemedy'>,
): string {
  if (
    returnCase.status === 'remedy_accepted' &&
    REFUND_REMEDIES.has(returnCase.proposedRemedy)
  ) {
    return 'Refund approved — processing';
  }
  return RETURN_CASE_STATUS_LABELS[returnCase.status] ?? returnCase.status;
}

// ============================================================================
// LISTING MANAGEMENT — bump + status writes for /seller-hub/listings
// ============================================================================

/** One bump per listing per 24 hours — the marketplace resurface rule. */
export const LISTING_BUMP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Fixture-mode bump — resurfaces the listing by refreshing its createdAt
 * so age and newest-sort reflect the resurface, the same way a real bump
 * re-enters the top of feeds. Session-local truth like updateListing();
 * the cooldown timestamp itself is persisted by the session store.
 * Returns null for sold/unfindable listings — you can't resurface a sale.
 */
export function bumpListing(id: string): Listing | null {
  const listing = MY_LISTINGS.find((l) => l.id === id);
  if (!listing || listing.isSold || listing.status === 'sold') return null;
  listing.isBumped = true;
  listing.createdAt = new Date().toISOString();
  return listing;
}

/**
 * Fixture-mode status write — mirrors mobile patchListingOnApi({status}).
 * 'sold' takes the listing off the public shelf; 'active' relists it.
 */
export function setListingStatus(id: string, status: 'active' | 'sold'): Listing | null {
  const listing = MY_LISTINGS.find((l) => l.id === id);
  if (!listing) return null;
  listing.status = status;
  listing.isSold = status === 'sold';
  return listing;
}
