/**
 * Listing purchase-capability resolution — mirrors the mobile
 * CommerceActionDock capability chain (frontend/src/components/pdp/
 * CommerceActionDock.tsx). This is the single place purchase/offer
 * affordances are decided: the PDP BuyPanel, the PdpBuyDock and
 * direct-checkout guards all consume it so a listing can never expose a
 * purchase control the backend would reject (409 SELLER_AWAY, sold,
 * paused, suspended seller, …).
 *
 * Truth rules:
 *  - Availability is explicit — the unlisted/draft/deleted/unknown
 *    branches below are the only statuses a buyer may purchase from.
 *  - Seller state is a hard gate: holidayMode and a suspended reach
 *    suppress purchase AND offer affordances (messaging stays available —
 *    a buyer can still ask a question about an away seller's item).
 *  - Missing seller or missing price is never buyable — the order cannot
 *    be trusted without both.
 */
import type { Listing } from '@/lib/contracts/domain';
import { formatDate } from '@/lib/utils/format';

/**
 * Seller availability from a fresher source than the listing payload —
 * the GET /sellers/:id trust summary (services/sellers.ts). The listing
 * detail payload's seller block doesn't always project holidayMode /
 * reachState, so the PDP feeds this summary in when it has one. Its
 * fields win over `listing.seller` because the endpoint resolves
 * effective-away server-side (a lapsed return date can't read as
 * still-away). Null/undefined — query loading or failed — falls back to
 * the listing's own seller fields; a failed read never blocks purchase
 * (the backend's 409 remains the enforcer, same as mobile).
 */
export interface SellerAvailability {
  holidayMode?: boolean | null;
  reachState?: 'normal' | 'limited' | 'suspended' | null;
  /** Seller-published return instant — used by listingStateCopy for the
   *  "back {date}" subtitle, never for the gate itself. */
  holidayModeUntil?: string | null;
  /** Seller-authored away note — rendered verbatim as the state subtitle
   *  when no return date was published (native parity). */
  awayMessage?: string | null;
}

/** Why a listing cannot be purchased right now, if it can't. */
export type ListingUnavailableReason =
  | 'sold'
  | 'reserved'
  | 'paused'
  | 'draft'
  | 'removed'
  | 'missing_price'
  | 'missing_seller'
  | 'status_unknown';

export interface ListingCapabilities {
  /** Viewer may buy/checkout with this listing. */
  canBuy: boolean;
  /** Viewer may place an offer (offer sheet, bid-adjacent affordances). */
  canOffer: boolean;
  /** Viewer may message the seller — stays true when the seller is away. */
  canMessage: boolean;
  /** The listing belongs to the viewer. */
  isOwner: boolean;
  /** The listing has sold (own dedicated state upstream). */
  isSold: boolean;
  /**
   * The listing is purchasable on listing terms alone — before viewer
   * identity and seller availability are considered. Exposed separately so
   * callers can gate ?item= checkout guards identically.
   */
  isAvailable: boolean;
  /** Seller holiday mode — purchase and offer calls will 409. */
  sellerAway: boolean;
  /** Seller account restricted — purchase and offer calls will fail. */
  sellerSuspended: boolean;
  /** Non-null whenever isAvailable is false. */
  unavailableReason: ListingUnavailableReason | null;
}

/** The purchase-eligible status vocabulary (normalized lowercase). */
const PURCHASABLE_STATUSES = new Set(['active', 'live', 'listed', 'available']);
const PAUSED_STATUSES = new Set(['paused', 'inactive', 'on hold', 'on_hold']);
const DRAFT_STATUSES = new Set(['draft', 'unlisted', 'scheduled']);
const REMOVED_STATUSES = new Set(['removed', 'deleted', 'archived', 'ended', 'rejected']);

export function listingCapabilities(
  listing: Pick<
    Listing,
    'sellerId' | 'seller' | 'isSold' | 'price' | 'status'
  >,
  viewerId?: string | null,
  sellerAvailability?: SellerAvailability | null,
): ListingCapabilities {
  const isSold = listing.isSold || listing.status === 'sold';
  const isOwner =
    !!viewerId && (listing.sellerId === viewerId || listing.seller?.id === viewerId);

  let unavailableReason: ListingUnavailableReason | null = null;
  if (isSold) {
    unavailableReason = 'sold';
  } else if (listing.status === 'reserved') {
    unavailableReason = 'reserved';
  } else if (listing.status && PAUSED_STATUSES.has(listing.status)) {
    unavailableReason = 'paused';
  } else if (listing.status && DRAFT_STATUSES.has(listing.status)) {
    unavailableReason = 'draft';
  } else if (listing.status && REMOVED_STATUSES.has(listing.status)) {
    unavailableReason = 'removed';
  } else if (!(listing.price > 0)) {
    unavailableReason = 'missing_price';
  } else if (!listing.sellerId && !listing.seller) {
    unavailableReason = 'missing_seller';
  } else if (
    listing.status &&
    !PURCHASABLE_STATUSES.has(listing.status) &&
    listing.status !== 'sold'
  ) {
    // Any status outside the purchasable vocabulary is treated as
    // unpurchasable — never let an unrecognised state leak buy affordances.
    unavailableReason = 'status_unknown';
  }

  const sellerAway =
    (sellerAvailability?.holidayMode ?? listing.seller?.holidayMode) === true;
  const sellerSuspended =
    (sellerAvailability?.reachState ?? listing.seller?.reachState) === 'suspended';
  const isAvailable = unavailableReason == null;
  const purchasable = isAvailable && !isOwner && !sellerAway && !sellerSuspended;

  return {
    canBuy: purchasable,
    canOffer: purchasable,
    canMessage: !isOwner && (!!listing.sellerId || !!listing.seller),
    isOwner,
    isSold,
    isAvailable,
    sellerAway,
    sellerSuspended,
    unavailableReason,
  };
}

/** Factual state copy for an unpurchasable listing — mirrors the mobile
 *  state-dock copy. `sellerState` rows win over listing reasons when both
 *  apply (a suspended seller beats a paused listing in messaging order,
 *  matching mobile's seller-first check order). */
export function listingStateCopy(
  caps: ListingCapabilities,
  seller?: SellerAvailability | null,
): { label: string; subtitle: string } | null {
  if (caps.isOwner) return null;
  if (caps.sellerSuspended) {
    return {
      label: 'Unavailable',
      subtitle: "This seller's account is currently restricted",
    };
  }
  if (caps.sellerAway) {
    // Native grammar: a published return date wins, then the seller's own
    // away note, then the factual default — never a fabricated estimate.
    const until = seller?.holidayModeUntil;
    const backOn =
      until && Number.isFinite(Date.parse(until)) ? formatDate(until) : null;
    const note = seller?.awayMessage?.trim() || null;
    return {
      label: 'Seller away',
      subtitle: backOn
        ? `Purchases resume when they return — back ${backOn}`
        : note ?? 'Purchases resume when they return',
    };
  }
  switch (caps.unavailableReason) {
    case 'reserved':
      return { label: 'Reserved', subtitle: "Pending another buyer's payment" };
    case 'paused':
      return { label: 'Unavailable', subtitle: 'Paused by the seller' };
    case 'draft':
      return { label: 'Not published', subtitle: "This listing isn't available to buy" };
    case 'removed':
      return { label: 'Unavailable', subtitle: 'This listing is no longer available' };
    case 'missing_price':
      return { label: 'Price unavailable', subtitle: "The seller hasn't set a price" };
    case 'missing_seller':
      return { label: 'Seller unavailable', subtitle: "Seller details couldn't be verified" };
    case 'status_unknown':
      return { label: 'Unavailable', subtitle: "Purchase availability couldn't be verified" };
    default:
      return null;
  }
}
