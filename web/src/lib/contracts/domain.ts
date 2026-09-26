/**
 * Domain contracts — 1:1 port of frontend/src/domain/* for the web app.
 * Kept structurally identical so fixtures and live API payloads map cleanly.
 */

export type ListingCondition =
  | 'New with tags'
  | 'New without tags'
  | 'Very good'
  | 'Good'
  | 'Satisfactory';

export interface ListingMediaDerivative {
  width: number;
  uri: string;
}

export interface ListingMediaRecord {
  kind: 'image' | 'video';
  uri: string;
  url?: string;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  lqip?: string | null;
  focalPoint?: { x: number; y: number } | null;
  poster?: string | null;
  derivatives?: ListingMediaDerivative[];
}

export interface ListingSeller {
  id: string;
  username: string | null;
  avatar: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  location?: string | null;
  verified?: boolean | null;
}

export interface Listing {
  id: string;
  title: string;
  brand: string | null;
  size: string | null;
  condition: ListingCondition;
  price: number;
  originalPrice?: number;
  priceWithProtection?: number;
  images: string[];
  media?: ListingMediaRecord[];
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  likes: number;
  views?: number;
  isBumped?: boolean;
  promoted?: boolean;
  disclosure?: string | null;
  promotionId?: string | null;
  isSold?: boolean;
  status?: 'draft' | 'active' | 'paused' | 'reserved' | 'sold' | 'deleted' | 'removed' | 'unknown';
  sellerId: string;
  seller?: ListingSeller | null;
  category: string;
  subcategory?: string | null;
  description: string;
  createdAt?: string;
  auctionEndsAt?: string | null;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
  featured?: boolean | null;
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
}

/** Production discovery-tile contract — mirrors contracts/DiscoveryListingSummary.ts. */
export interface DiscoverySellerSummary {
  id: string;
  username: string | null;
  avatar: string | null;
  verified?: boolean | null;
}

export interface DiscoveryListingSummary {
  id: string;
  title: string;
  brand: string | null;
  size: string | null;
  condition: ListingCondition | null;
  price: number | null;
  originalPrice?: number;
  priceWithProtection?: number;
  images: string[];
  media?: ListingMediaRecord[];
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  likes: number | null;
  views?: number;
  isBumped?: boolean;
  promoted?: boolean;
  disclosure?: string | null;
  promotionId?: string | null;
  isSold?: boolean;
  status?: Listing['status'];
  sellerId: string;
  seller?: DiscoverySellerSummary | null;
  category: string;
  subcategory?: string | null;
  createdAt?: string;
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
}

export function mapListingToDiscoverySummary(source: Listing): DiscoveryListingSummary {
  return {
    id: source.id,
    title: source.title,
    brand: source.brand ?? null,
    size: source.size ?? null,
    condition: source.condition ?? null,
    price: source.price ?? null,
    originalPrice: source.originalPrice,
    priceWithProtection: source.priceWithProtection,
    images: source.images,
    media: source.media,
    mediaAspectRatio: source.mediaAspectRatio ?? null,
    mediaWidth: source.mediaWidth ?? null,
    mediaHeight: source.mediaHeight ?? null,
    likes: source.likes ?? null,
    views: source.views,
    isBumped: source.isBumped,
    promoted: source.promoted === true ? true : undefined,
    disclosure: source.promoted === true ? (source.disclosure ?? null) : undefined,
    promotionId: source.promoted === true ? (source.promotionId ?? null) : undefined,
    isSold: source.isSold,
    status: source.status,
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

// ============================================================================
// DISCOVERY FEED UNITS — mirrors contracts/discoveryFeedUnit.ts
// ============================================================================

interface FeedUnitBase {
  id: string;
  span?: number;
}

export interface ListingFeedUnit extends FeedUnitBase {
  type: 'listing';
  listing: DiscoveryListingSummary;
}

export interface LookFeedUnit extends FeedUnitBase {
  type: 'look';
  lookId: string;
  coverImageUri: string;
  coverAspectRatio?: number | null;
  creatorUsername?: string | null;
  creatorAvatarUri?: string | null;
  itemCount?: number | null;
}

export interface PosterFeedUnit extends FeedUnitBase {
  type: 'poster';
  storyId: string;
  coverUri: string;
  aspectRatio?: number | null;
  authorUsername?: string | null;
  authorAvatarUri?: string | null;
}

export interface MoodboardFeedUnit extends FeedUnitBase {
  type: 'moodboard';
  moodboardId: string;
  coverUri: string;
  aspectRatio?: number | null;
  title?: string | null;
  ownerUsername?: string | null;
}

export interface EditorialFeedUnit extends FeedUnitBase {
  type: 'editorial';
  mediaUri: string;
  aspectRatio?: number | null;
  headline?: string | null;
  kicker?: string | null;
  href?: string | null;
}

export interface RecommendationBreakFeedUnit extends FeedUnitBase {
  type: 'recommendation_break';
  headline: string;
  listings: DiscoveryListingSummary[];
}

export type DiscoveryFeedUnit =
  | ListingFeedUnit
  | LookFeedUnit
  | PosterFeedUnit
  | MoodboardFeedUnit
  | EditorialFeedUnit
  | RecommendationBreakFeedUnit;

// ============================================================================
// USER / SOCIAL
// ============================================================================

export interface User {
  id: string;
  username: string;
  avatar: string;
  coverPhoto?: string;
  rating: number;
  reviewCount: number;
  location: string;
  followers: number;
  following: number;
  isVerified: boolean;
  badges: string[];
  lastSeen: string;
  listingCount: number;
  bio?: string;
  website?: string;
  pronouns?: string;
  identityVerified?: boolean;
  sellerVerified?: boolean;
  trustLevel?: 'none' | 'email' | 'identity' | 'seller';
}

export interface Review {
  id: string;
  /** The user this review is about (the seller being rated). */
  userId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatar: string;
  rating: number;
  text: string;
  date: string;
  isAutomatic: boolean;
}

// ============================================================================
// CHAT / INBOX
// ============================================================================

export interface MessageReaction {
  emoji: string;
  userIds: string[];
  count?: number;
  reactedByMe?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  text?: string;
  offerPrice?: number;
  originalPrice?: number;
  offerStatus?: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled';
  isSystem?: boolean;
  systemTitle?: string;
  timestamp: string;
  itemImage?: string;
  type?: 'text' | 'offer' | 'offer_declined' | 'purchase_status' | 'system' | 'commerce_state' | 'media' | 'listing_share';
  sender?: 'me' | 'other' | 'system';
  listing?: {
    id: string;
    title: string;
    price: number;
    originalPrice?: number;
    images?: string[];
    image?: string;
    brand?: string | null;
    sellerId?: string | null;
    size?: string;
    condition?: string;
    sellerUsername?: string;
    isSold?: boolean;
  };
  mediaUri?: string;
  /** Media flavour for mediaUri — drives the '📷 Photo' / '🎥 Video'
   *  preview grammar and bubble treatment (mirrors mobile mediaType). */
  mediaType?: 'image' | 'video';
  /** Display label for the sender in group threads — hydrated from
   *  participantProfiles (displayName ?? username). */
  senderLabel?: string;
  reactions?: MessageReaction[];
  replyToMessageId?: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  readStatus?: 'sending' | 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar: string;
  participantVerified?: boolean;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  isOnline?: boolean;
  listing?: {
    id: string;
    title: string;
    price: number;
    image?: string;
    isSold?: boolean;
  };
  messages: Message[];
  isRequest?: boolean;
  /** Thread kind — absent on legacy fixtures means 'dm'. */
  type?: ConversationType;
  /** Group title (type === 'group'). */
  title?: string;
  /** Group description — renders as the dismissible info bar in-thread. */
  description?: string;
  /** Group photo — takes precedence over the member mosaic. */
  avatar?: string;
  /** Wide cover photo banner (group info surface). */
  coverPhoto?: string;
  /** All participant ids including the viewer ('me'). */
  participantIds?: string[];
  /** Lightweight member profiles — drives the mosaic, sender labels and
   *  member counts without a per-user fetch. */
  participantProfiles?: ConversationParticipant[];
  /** Server-derived unread count — renders as a count badge when > 1. */
  unreadCount?: number;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export interface AppNotification {
  id: string;
  itemImage: string;
  text: string;
  time: string;
  type: 'new_item' | 'favourite' | 'system' | 'offer' | 'order' | 'follow';
}

/**
 * Richer notification contract — mirrors the mobile NotificationCard:
 * per-kind grammar, actor-aware leading visual, deep-link route and an
 * explicit read cursor (no client-side unread seeding).
 */
export type NotificationKind =
  | 'like'
  | 'offer'
  | 'price_drop'
  | 'follow'
  | 'order'
  | 'review'
  | 'new_item'
  | 'saved_search_match'
  | 'system';

export interface NotificationEntry {
  id: string;
  kind: NotificationKind;
  /** Full sentence — "dankdunksuk sent you a counter-offer on …". */
  text: string;
  /** Compact relative-time label ('2m', 'Yesterday', '3d', '2w'). */
  time: string;
  /** Leading visual — actor avatar or item thumbnail. */
  image?: string;
  /** True when the leading visual is an actor avatar (follows, reviews). */
  isActor?: boolean;
  /** Deep link — item, order, profile or surface route. */
  href?: string;
  /** Explicit read cursor — fixtures carry it honestly. */
  unread?: boolean;
}

// ============================================================================
// COMMERCE
// ============================================================================

export interface Address {
  id: string;
  name: string;
  street: string;
  city: string;
  postcode: string;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand?: 'visa' | 'mastercard' | 'amex';
  bankName?: string;
  expiry?: string;
  isDefault: boolean;
}

export interface Order {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  totalPrice: number;
  trackingNumber?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'sale' | 'purchase' | 'withdrawal' | 'refund';
  amount: number;
  status: 'completed' | 'pending';
  date: string;
  description: string;
}

// ============================================================================
// ORDER WORKFLOW — port of the mobile order vocabulary
// (frontend/src/components/orders/orderCapabilities.ts + commerceApi
// contracts). The base Order.status union stays narrow for legacy surfaces;
// CommerceOrder carries the full server vocabulary the capability resolver
// understands ('created' | 'paid' | 'shipped' | 'in transit' | ...).
// ============================================================================

/**
 * Full order status vocabulary — mirrors the backend/mobile states. Web
 * fixture orders may still carry the legacy 'pending' (alias of 'paid').
 */
export type OrderWorkflowStatus =
  | 'created'
  | 'paid'
  | 'pending' // legacy web fixture vocabulary — treated as 'paid'
  | 'processing'
  | 'preparing'
  | 'shipped'
  | 'in transit'
  | 'out for delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'refunding'
  | 'delivery failed'
  | 'returned';

/**
 * Immutable purchased-shipping snapshot — survives the seller's later
 * shipping-settings changes (mobile P0.2). The seller's dispatch flow shows
 * the exact service the buyer paid for.
 */
export interface FulfilmentSnapshot {
  quoteId: string | null;
  quoteHash: string | null;
  carrierId: string | null;
  serviceCode: string | null;
  serviceName: string | null;
  deliveryMode: 'integrated' | 'manual' | 'local' | 'unknown';
  etaMinDays: number | null;
  etaMaxDays: number | null;
  trackingIncluded: boolean;
  shipByDate: string | null;
  destinationSummary: string | null;
  parcelProfile: { maxWeightKg: number | null; maxLengthCm: number | null } | null;
  dispatchSlaDays?: number | null;
}

/**
 * Seller-proposed dispatch extension — only 'pending' extensions surface on
 * the order payload; accepted/declined ones are folded into shipByDate.
 */
export interface DispatchExtension {
  id: string;
  days: number;
  proposedShipBy: string;
  proposedBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

/** One carrier-scan event on the parcel trail — authored evidence, not a
 *  fabricated promise. `tone` marks failure/exception events. */
export interface OrderTrackingEvent {
  id: string;
  at: string;
  label: string;
  detail?: string | null;
  location?: string | null;
  tone?: 'normal' | 'warning' | 'danger';
}

export type OrderAuthenticationStatus =
  | 'not_requested'
  | 'request_pending'
  | 'pending_ai_triage'
  | 'ai_triage_complete'
  | 'pending_expert_review'
  | 'expert_review_complete'
  | 'pending_lab_analysis'
  | 'lab_analysis_complete'
  | 'authenticated'
  | 'counterfeit'
  | 'inconclusive'
  | 'cancelled';

export interface OrderAuthenticationBadge {
  type: 'AI_VERIFIED' | 'EXPERT_VERIFIED' | 'LAB_CERTIFIED' | string;
  method: string;
  certificateId: string;
}

/** Live verification-pipeline record — mirrors mobile OrderAuthentication. */
export interface OrderAuthentication {
  orderId: string;
  status: OrderAuthenticationStatus;
  badge?: OrderAuthenticationBadge | null;
  updatedAt?: string;
}

export type ReturnRemedy =
  | 'full_refund'
  | 'partial_refund'
  | 'replacement'
  | 'repair'
  | 'reject';

export type ReturnCaseStatus =
  | 'requested'
  | 'evidence_review'
  | 'approved'
  | 'rejected'
  | 'reverse_shipped'
  | 'received'
  | 'inspected'
  | 'remedy_proposed'
  | 'remedy_accepted'
  | 'appealed'
  | 'refund_confirmed'
  | 'closed';

/** Structured return/refund case attached to an order — mirrors the mobile
 *  returnsApi state machine. Only legal transitions render as actions. */
export interface ReturnCase {
  id: string;
  orderId: string;
  status: ReturnCaseStatus;
  reasonCategory: string;
  reasonLabel: string;
  /** Null = full refund requested. */
  requestedAmountGbp: number | null;
  proposedRemedy?: ReturnRemedy | null;
  remedyAmountGbp?: number | null;
  remedyNotes?: string | null;
  returnCarrier?: string | null;
  returnTrackingNumber?: string | null;
  returnLabelUrl?: string | null;
  /** Server-computed moment the buyer may ask Thryft to step in. */
  stepInEligibleAt?: string | null;
  appealedAt?: string | null;
  createdAt: string;
}

/**
 * Order record with the full workflow vocabulary and the server-derived
 * logistics fields the capability model consumes. Base Order stays
 * untouched — richer records widen status to string.
 */
export interface CommerceOrder extends Omit<Order, 'status'> {
  status: OrderWorkflowStatus | string;
  /** Server-stamped dispatch + delivery timestamps (ISO). */
  shippedAt?: string | null;
  deliveredAt?: string | null;
  /** Server-computed ship-by deadline (already folds accepted extensions). */
  shipByDate?: string | null;
  /** Server-derived estimated delivery (ISO). */
  estimatedDeliveryAt?: string | null;
  /** Server-derived escrow release estimate (ISO). */
  estimatedReleaseAt?: string | null;
  /** Server-derived inspection-window deadline for the buyer (ISO). */
  inspectionDeadlineAt?: string | null;
  /** Durable flag — the buyer paid for physical verification at checkout. */
  verificationRequested?: boolean;
  dispatchExtension?: DispatchExtension | null;
  fulfilmentSnapshot?: FulfilmentSnapshot | null;
}

// ============================================================================
// CONTENT ENTITIES
// ============================================================================

export interface Look {
  id: string;
  creatorId: string;
  coverImageUri: string;
  coverAspectRatio?: number | null;
  title?: string | null;
  itemIds: string[];
  likeCount?: number | null;
  createdAt?: string;
}

export interface Poster {
  id: string;
  authorId: string;
  coverUri: string;
  aspectRatio?: number | null;
  caption?: string | null;
  createdAt?: string;
}

export interface Moodboard {
  id: string;
  ownerId: string;
  title: string;
  coverUri: string;
  aspectRatio?: number | null;
  itemCount?: number | null;
  createdAt?: string;
}

export interface Category {
  slug: string;
  name: string;
  image?: string;
  subcategories?: { slug: string; name: string }[];
}

// ============================================================================
// PDP EVIDENCE — public Q&A, editorial collections, size guides
// ============================================================================

/** Seller answer on a public listing question. Mirrors the mobile
 *  ListingQuestion.answer contract — only the seller can answer. */
export interface ListingQuestionAnswer {
  text: string;
  responderName: string;
  createdAt?: string;
}

/** A buyer question thread on a listing. createdAt stays optional — an
 *  unparseable/missing timestamp omits the time line rather than
 *  fabricating "just now" (mobile P3 honesty nit). */
export interface ListingQuestion {
  id: string;
  listingId: string;
  askerId?: string;
  askerName: string;
  askerAvatar?: string;
  text: string;
  createdAt?: string;
  answer?: ListingQuestionAnswer | null;
}

/** Editorial metadata for a curated collection featured on the PDP.
 *  Contents stay owned by the collection itself — this is rail chrome only. */
export interface CuratedCollectionMeta {
  /** Collection id — must resolve on /collection/[id]. */
  id: string;
  subtitle: string;
  coverImageUri: string;
}

export interface SizeGuideRow {
  size: string;
  measurements: Record<string, string>;
}

/** Standard retail measurement table per category — a buyer reference
 *  chart, not listing data (mirrors mobile SIZE_GUIDES). */
export interface SizeGuide {
  key: string;
  title: string;
  columns: string[];
  rows: SizeGuideRow[];
}

// ============================================================================
// GROUP CONVERSATIONS — mirrors mobile domain/conversation.ts
// ============================================================================

export type ConversationType = 'dm' | 'group';

/** Lightweight member record on a conversation — displayName falls back to
 *  username; identityVerified drives the verified badge, not email. */
export interface ConversationParticipant {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
  identityVerified?: boolean;
}

/** Input for creating a thread — memberIds excludes the viewer (added by
 *  the creator). One member = DM; two or more = group (requires title). */
export interface NewConversationInput {
  memberIds: string[];
  title?: string;
  description?: string;
}
