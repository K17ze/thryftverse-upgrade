/**
 * Backend → web contract mappers. Ports of the mobile mapping layer
 * (frontend/src/services/listingMapper.ts, chatApi.ts, commerceApi.ts,
 * marketApi.ts, coOwnPortfolio.ts, notificationsApi.ts) projected onto the
 * web domain contracts in lib/contracts/*.
 *
 * Honesty rule (same as mobile): missing commercial facts stay missing.
 * Rows that fail the display floor — no id, title, recognisable condition,
 * price, sellerId or category — return `null` from the single-row mapper
 * and are filtered out of list mappers rather than filled with invented
 * values.
 */

import type {
  AppNotification,
  CommerceOrder,
  Conversation,
  ConversationParticipant,
  Listing,
  ListingCondition,
  ListingMediaRecord,
  ListingReturnPolicy,
  ListingSeller,
  Message,
  MessageReaction,
  NotificationEntry,
  NotificationKind,
  Order,
  Review,
  User,
} from '@/lib/contracts/domain';
import type {
  AuctionBid,
  AuctionMarketItem,
} from '@/lib/contracts/auction';
import type {
  ActivityEvent,
  CoOwnAsset,
  CoOwnBuyoutOffer,
  CoOwnOrder,
  CoOwnPosition,
  CoOwnRecourse,
  CorporateAction,
  Distribution,
  OrderBookSnapshot,
  StoredPriceAlert,
  TradeLedgerEntry,
} from '@/lib/contracts/coown';
import { timeAgo } from '@/lib/utils/format';

// ============================================================================
// Listings
// ============================================================================

/** Canonical condition vocabulary — mirrors contracts/taxonomy.ts. */
const CONDITION_NAMES = [
  'New with tags',
  'New without tags',
  'Very good',
  'Good',
  'Satisfactory',
] as const;

export interface BackendListingRow {
  id: string;
  sellerId?: string | null;
  title?: string | null;
  description?: string | null;
  priceGbp?: number | string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  media?: ListingMediaRecord[] | null;
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
  /** Detail payload's row timestamp — PATCH sends it back as
   *  expectedUpdatedAt for optimistic concurrency. */
  updatedAt?: string | null;
  auctionEndsAt?: string | null;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
  /** Flat delivery/returns fields — present when a payload projects the
   *  commerce block onto the row; the /listings/:id detail path also merges
   *  the nested `commerce` block in services/listings.ts. */
  shippingPrice?: number | string | null;
  shippingPriceGbp?: number | string | null;
  estimatedDeliveryStart?: string | null;
  estimatedDeliveryEnd?: string | null;
  estimated_delivery_start?: string | null;
  estimated_delivery_end?: string | null;
  returnPolicy?: unknown;
  return_policy?: unknown;
  dispatchSlaDays?: number | string | null;
  dispatch_sla_days?: number | string | null;
  seller?: ListingSeller | null;
  likes?: number | null;
  views?: number | null;
  /** Detail-payload rollup (spec 04_DIRECT §5): likes/wishlistCount/
   *  collectionSaveCount/activeOfferCount/questionCount. The PDP's
   *  demand line and owner offer-to-likers gate read these — without the
   *  map they collapse to zero in live mode. */
  engagement?: {
    likes?: number | null;
    wishlistCount?: number | null;
    collectionSaveCount?: number | null;
    activeOfferCount?: number | null;
    questionCount?: number | null;
    answeredQuestionCount?: number | null;
  } | null;
  materialComposition?: string | null;
  weightKg?: number | null;
  featured?: boolean | null;
  promoted?: boolean | null;
  disclosure?: string | null;
  promotionId?: string | null;
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
}

function nonBlank(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/** Normalize a wire return-policy object (camelCase commerce block, or
 *  snake_case `returns_*` fields) to the ListingReturnPolicy contract.
 *  Returns null when the payload can't be read as a policy. */
export function normalizeReturnPolicy(value: unknown): ListingReturnPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const acceptedRaw = v.accepted ?? v.returnsAccepted ?? v.returns_accepted;
  const accepted =
    typeof acceptedRaw === 'boolean'
      ? acceptedRaw
      : acceptedRaw === 'true'
        ? true
        : acceptedRaw === 'false'
          ? false
          : null;
  const windowRaw = v.windowDays ?? v.returnsWindowDays ?? v.returns_window_days;
  const windowDays = toFinitePrice(windowRaw);
  const conditions =
    nonBlank(v.conditions) ?? nonBlank(v.returnsConditions) ?? nonBlank(v.returns_conditions);
  const summary = nonBlank(v.summary);
  if (accepted === null && windowDays === null && conditions === null && summary === null) {
    return null;
  }
  return {
    accepted,
    windowDays: windowDays !== null ? Math.round(windowDays) : null,
    conditions,
    summary,
  };
}

/** Normalize an ISO timestamp field — keep only parseable dates so a
 *  malformed string can't render a fabricated ETA. */
function toIsoDate(value: unknown): string | null {
  const s = nonBlank(value);
  if (!s) return null;
  return Number.isFinite(Date.parse(s)) ? s : null;
}

function toFinitePrice(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeCondition(value: unknown): ListingCondition | null {
  if (typeof value === 'string' && value.length > 0) {
    const match = CONDITION_NAMES.find(
      (c) => c.toLowerCase() === value.toLowerCase(),
    );
    if (match) return match;
  }
  return null;
}

function normalizeStatus(value: unknown): Listing['status'] {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'draft':
    case 'active':
    case 'paused':
    case 'reserved':
    case 'sold':
    case 'deleted':
    case 'removed':
      return normalized;
    default:
      return 'unknown';
  }
}

function collectMedia(row: BackendListingRow): string[] {
  const fromArray = Array.isArray(row.images)
    ? row.images.filter((uri) => typeof uri === 'string' && uri.trim().length > 0)
    : [];
  if (fromArray.length > 0) return fromArray;

  const fromSingle = nonBlank(row.imageUrl);
  if (fromSingle) return [fromSingle];

  if (Array.isArray(row.media)) {
    return row.media
      .map((m) => (typeof m?.uri === 'string' ? m.uri : typeof m?.url === 'string' ? m.url : ''))
      .filter((uri) => uri.trim().length > 0);
  }

  return [];
}

function collectMediaRecords(row: BackendListingRow): ListingMediaRecord[] | undefined {
  if (!Array.isArray(row.media)) return undefined;
  const records: ListingMediaRecord[] = [];
  for (const raw of row.media) {
    if (!raw || typeof raw !== 'object') continue;
    const uri =
      typeof raw.uri === 'string' && raw.uri.trim().length > 0
        ? raw.uri
        : typeof raw.url === 'string' && raw.url.trim().length > 0
          ? raw.url
          : null;
    if (!uri) continue;
    records.push({
      ...raw,
      uri,
      url: typeof raw.url === 'string' && raw.url.trim().length > 0 ? raw.url : uri,
      kind: raw.kind === 'video' ? 'video' : 'image',
      width: typeof raw.width === 'number' ? raw.width : null,
      height: typeof raw.height === 'number' ? raw.height : null,
      focalPoint: raw.focalPoint ?? null,
      poster: typeof raw.poster === 'string' ? raw.poster : null,
      blurhash: typeof raw.blurhash === 'string' ? raw.blurhash : null,
      lqip: typeof raw.lqip === 'string' ? raw.lqip : null,
      derivatives: Array.isArray(raw.derivatives) ? raw.derivatives : [],
    });
  }
  return records.length > 0 ? records : undefined;
}

function normalizeSeller(row: BackendListingRow): ListingSeller | null {
  const seller = row.seller;
  if (seller && typeof seller === 'object' && seller.id) {
    return {
      id: seller.id,
      username: nonBlank(seller.username),
      avatar: nonBlank(seller.avatar),
      rating: typeof seller.rating === 'number' && Number.isFinite(seller.rating) ? seller.rating : null,
      reviewCount:
        typeof seller.reviewCount === 'number' && Number.isFinite(seller.reviewCount)
          ? seller.reviewCount
          : null,
      location: nonBlank(seller.location),
      verified: typeof seller.verified === 'boolean' ? seller.verified : null,
      // Buyer-side availability — honour it whenever a payload does carry
      // it (the PDP also refreshes it via the /sellers/:id trust summary).
      holidayMode:
        typeof seller.holidayMode === 'boolean' ? seller.holidayMode : undefined,
      reachState:
        seller.reachState === 'normal' ||
        seller.reachState === 'limited' ||
        seller.reachState === 'suspended'
          ? seller.reachState
          : undefined,
    };
  }
  return null;
}

/**
 * Backend row → web `Listing`. Returns `null` when the row lacks the
 * universal display floor (id, title, recognisable condition, price,
 * sellerId, category) — surfaces must treat that as "unavailable", never
 * back-fill invented values.
 */
export function mapBackendListingToListing(row: BackendListingRow): Listing | null {
  const id = nonBlank(row.id);
  const title = nonBlank(row.title);
  const condition = normalizeCondition(row.condition);
  const price = toFinitePrice(row.priceGbp);
  const sellerId = nonBlank(row.sellerId);
  const category = nonBlank(row.category);
  if (!id || !title || !condition || price === null || !sellerId || !category) {
    return null;
  }

  const status = normalizeStatus(row.status);
  const originalPrice = toFinitePrice(row.originalPriceGbp);

  return {
    id,
    title,
    brand: nonBlank(row.brand),
    size: nonBlank(row.size),
    condition,
    price,
    originalPrice: originalPrice ?? undefined,
    images: collectMedia(row),
    media: collectMediaRecords(row),
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
    // Demand counters — flat likes/views first, then the detail payload's
    // engagement rollup (wishlistCount IS the like count on the wire).
    likes:
      typeof row.likes === 'number' && row.likes > 0
        ? row.likes
        : typeof row.engagement?.wishlistCount === 'number'
          ? row.engagement.wishlistCount
          : typeof row.engagement?.likes === 'number'
            ? row.engagement.likes
            : 0,
    views:
      typeof row.views === 'number' && row.views > 0 ? row.views : 0,
    activeOfferCount:
      typeof row.engagement?.activeOfferCount === 'number'
        ? row.engagement.activeOfferCount
        : undefined,
    collectionSaveCount:
      typeof row.engagement?.collectionSaveCount === 'number'
        ? row.engagement.collectionSaveCount
        : undefined,
    questionCount:
      typeof row.engagement?.questionCount === 'number'
        ? row.engagement.questionCount
        : undefined,
    materialComposition: row.materialComposition ?? null,
    weightKg:
      typeof row.weightKg === 'number' && Number.isFinite(row.weightKg)
        ? row.weightKg
        : null,
    isSold: status === 'sold',
    sellerId,
    seller: normalizeSeller(row),
    category,
    subcategory: nonBlank(row.subcategory),
    description: nonBlank(row.description) ?? '',
    createdAt: nonBlank(row.createdAt) ?? undefined,
    updatedAt: toIsoDate(row.updatedAt) ?? undefined,
    auctionEndsAt: nonBlank(row.auctionEndsAt),
    status,
    shippingMethod: row.shippingMethod ?? null,
    shippingPayer: row.shippingPayer ?? null,
    shippingPrice: toFinitePrice(row.shippingPrice ?? row.shippingPriceGbp),
    estimatedDeliveryStart: toIsoDate(row.estimatedDeliveryStart ?? row.estimated_delivery_start),
    estimatedDeliveryEnd: toIsoDate(row.estimatedDeliveryEnd ?? row.estimated_delivery_end),
    returnPolicy: normalizeReturnPolicy(row.returnPolicy ?? row.return_policy),
    dispatchSlaDays: toFinitePrice(row.dispatchSlaDays ?? row.dispatch_sla_days),
    featured: row.featured === true ? true : null,
    promoted: row.promoted === true ? true : undefined,
    disclosure: row.promoted === true ? nonBlank(row.disclosure) : undefined,
    promotionId: row.promoted === true ? nonBlank(row.promotionId) : undefined,
    sustainabilityGrade: row.sustainabilityGrade ?? null,
  };
}

/** Map a list payload — non-conforming rows drop out, same as mobile's
 *  `mapBackendListings` display-readiness filter. */
export function mapBackendListings(rows: unknown[] | null | undefined): Listing[] {
  if (!Array.isArray(rows)) return [];
  const out: Listing[] = [];
  for (const row of rows) {
    if (row == null || typeof row !== 'object') continue;
    const mapped = mapBackendListingToListing(row as BackendListingRow);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Seller-inventory mapping — owner-scoped rows (drafts, paused, sold)
 *  legitimately lack the buyer display floor (condition, price, category).
 *  A draft is a real row, not an unavailable listing: only id + sellerId +
 *  status are required; missing display fields stay empty/0 so the
 *  management surface's own missing-field vocabulary ("Needs: photos,
 *  price") renders instead of invented values. */
export function mapInventoryListings(rows: unknown[] | null | undefined): Listing[] {
  if (!Array.isArray(rows)) return [];
  const out: Listing[] = [];
  for (const row of rows) {
    if (row == null || typeof row !== 'object') continue;
    const raw = row as BackendListingRow;
    const mapped = mapBackendListingToListing(raw);
    if (mapped) {
      out.push(mapped);
      continue;
    }
    const id = nonBlank(raw.id);
    const sellerId = nonBlank(raw.sellerId);
    const status = normalizeStatus(raw.status);
    if (!id || !sellerId) continue;
    // Terminal rows aren't inventory — the backend's own totals exclude
    // them (status != 'deleted'), and nothing on the shelf can act on them.
    if (status === 'deleted' || status === 'removed') continue;
    const price = toFinitePrice(raw.priceGbp);
    out.push({
      id,
      title: nonBlank(raw.title) ?? '',
      brand: nonBlank(raw.brand),
      size: nonBlank(raw.size),
      // Empty-string condition is the draft contract's "missing" signal —
      // draftMissingFields reports it, never faked to a legal value.
      condition: (normalizeCondition(raw.condition) ?? '') as Listing['condition'],
      price: price ?? 0,
      images: collectMedia(raw),
      media: collectMediaRecords(raw),
      likes: 0,
      views: typeof raw.views === 'number' ? raw.views : 0,
      isSold: status === 'sold',
      sellerId,
      seller: normalizeSeller(raw),
      category: nonBlank(raw.category) ?? 'uncategorised',
      subcategory: nonBlank(raw.subcategory),
      description: nonBlank(raw.description) ?? '',
      createdAt: nonBlank(raw.createdAt) ?? undefined,
      updatedAt: toIsoDate(raw.updatedAt) ?? undefined,
      status,
    });
  }
  return out;
}

/**
 * Friendly, premium-toned error copy — port of mobile `friendlyBackendError`.
 * Never exposes raw fetch URLs or stack text to the UI.
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

// ============================================================================
// Users / profiles
// ============================================================================

/** Backend `/users/:id/profile` aggregate — the response envelope is
 *  FLAT (`{ ok, user, stats, viewer, trader, away, storefront }`),
 *  matching frontend/src/services/profileApi.ts. Earlier web code read
 *  `payload.profile`, which made every live-mode profile resolve to
 *  null. */
export interface PublicProfileAggregateApi {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    avatar: string | null;
    coverPhoto: string | null;
    coverVideo?: string | null;
    pronouns?: string | null;
    emailVerified: boolean;
    identityVerified?: boolean;
    sellerVerified?: boolean;
    createdAt: string;
  };
  stats: {
    activeListingCount: number;
    soldListingCount: number;
    publishedLookCount?: number;
    followerCount: number;
    followingCount: number;
    reviewCount: number;
    ratingAverage: number | null;
  };
  viewer?: {
    isSelf: boolean;
    isFollowing: boolean;
    /** Viewer blocked the target — profile renders but social actions
     *  should degrade to an Unblock state. */
    isBlocked?: boolean;
    isBlockedByTarget?: boolean;
    isMuted?: boolean;
    isRestricted?: boolean;
    canMessage: boolean;
    canViewSocialContent?: boolean;
    canViewShop?: boolean;
  };
  /** DSA Art. 30 trader disclosure — present only when the seller is
   *  classified; legal details only for verified traders. */
  trader?: {
    classification: 'trader' | 'non_trader';
    legalName: string | null;
    contactEmail: string | null;
    registrationNumber: string | null;
    address: string | null;
    vatNumber: string | null;
  };
  /** Authoritative away state — present only while effectively away. */
  away?: {
    holidayMode: boolean;
    awayMessage: string | null;
    holidayModeUntil: string | null;
  };
  storefront?: {
    announcement: string | null;
    policies: {
      shipping: string | null;
      returns: string | null;
      additional: string | null;
    };
    sections: { kind: string; title: string; sortOrder: number }[];
    featuredListingIds: string[];
  };
}

/** Backend `/users/me` row (profileApi ProfileUser). */
export interface ProfileUserApi {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  bio: string | null;
  pronouns?: string | null;
  location: string | null;
  website: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  role: string;
  emailVerified: boolean;
  /** TOTP enrolment state — drives the security surface's 2FA switch. */
  twoFactorEnabled?: boolean;
  identityVerified?: boolean;
  sellerVerified?: boolean;
  createdAt: string;
}

function deriveTrustLevel(u: {
  identityVerified?: boolean | null;
  sellerVerified?: boolean | null;
  emailVerified?: boolean | null;
}): User['trustLevel'] {
  if (u.sellerVerified) return 'seller';
  if (u.identityVerified) return 'identity';
  if (u.emailVerified) return 'email';
  return 'none';
}

export function mapPublicProfileToUser(agg: PublicProfileAggregateApi): User {
  const u = agg.user;
  const s = agg.stats;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName ?? undefined,
    avatar: u.avatar ?? '',
    coverPhoto: u.coverPhoto ?? undefined,
    coverVideo: u.coverVideo ?? undefined,
    createdAt: u.createdAt ?? undefined,
    rating: s.ratingAverage ?? 0,
    reviewCount: s.reviewCount ?? 0,
    location: u.location ?? '',
    followers: s.followerCount ?? 0,
    following: s.followingCount ?? 0,
    isVerified: u.identityVerified === true || u.sellerVerified === true,
    badges: [],
    lastSeen: '',
    listingCount: s.activeListingCount ?? 0,
    bio: u.bio ?? undefined,
    website: u.website ?? undefined,
    pronouns: u.pronouns ?? undefined,
    identityVerified: u.identityVerified,
    sellerVerified: u.sellerVerified,
    trustLevel: deriveTrustLevel(u),
  };
}

export function mapProfileUserToUser(u: ProfileUserApi): User {
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar ?? '',
    coverPhoto: u.coverPhoto ?? undefined,
    rating: 0,
    reviewCount: 0,
    location: u.location ?? '',
    followers: 0,
    following: 0,
    isVerified: u.identityVerified === true || u.sellerVerified === true,
    badges: [],
    lastSeen: '',
    listingCount: 0,
    bio: u.bio ?? undefined,
    website: u.website ?? undefined,
    pronouns: u.pronouns ?? undefined,
    identityVerified: u.identityVerified,
    sellerVerified: u.sellerVerified,
    trustLevel: deriveTrustLevel(u),
  };
}

/** `/users/search` row → lightweight `User` for the member directory. */
export function mapUserSearchRowToUser(row: {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
  identityVerified?: boolean;
  emailVerified?: boolean;
}): User {
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar ?? '',
    rating: 0,
    reviewCount: 0,
    location: '',
    followers: 0,
    following: 0,
    isVerified: row.identityVerified === true,
    badges: [],
    lastSeen: '',
    listingCount: 0,
    identityVerified: row.identityVerified,
    trustLevel: deriveTrustLevel(row),
  };
}

/** `/sellers/:id/reviews` row → `Review`. The wire shape is nested —
 *  `{ reviewer:{id,username,displayName,avatar}, rating, comment, isAuto,
 *  autoReason, createdAt, photoUrls, sellerResponse, listing }` —
 *  (sellers.ts). Flat legacy fields stay as fallbacks so older payloads
 *  and test rows still map. */
export function mapReviewRow(row: {
  id: string | number;
  userId?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewerUsername?: string;
  reviewerAvatar?: string | null;
  reviewer?: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    avatar?: string | null;
  };
  rating?: number;
  comment?: string | null;
  text?: string | null;
  body?: string | null;
  createdAt?: string;
  isAuto?: boolean;
  autoReason?: string | null;
  isAutomatic?: boolean;
  photoUrls?: string[];
  sellerResponse?: { text: string; createdAt: string } | null;
  listing?: { id: string; title: string; imageUrl: string | null } | null;
}): Review {
  const reviewer = row.reviewer;
  return {
    id: String(row.id),
    userId: row.userId ?? '',
    reviewerId: reviewer?.id ?? row.reviewerId ?? '',
    reviewerName:
      reviewer?.displayName ??
      reviewer?.username ??
      row.reviewerName ??
      row.reviewerUsername ??
      'Member',
    reviewerAvatar: reviewer?.avatar ?? row.reviewerAvatar ?? '',
    rating: typeof row.rating === 'number' ? row.rating : 0,
    text: row.comment ?? row.text ?? row.body ?? '',
    date: row.createdAt ?? '',
    isAutomatic: row.isAuto === true || row.isAutomatic === true,
    autoReason: row.autoReason ?? null,
    photoUrls: row.photoUrls?.length ? row.photoUrls : undefined,
    sellerResponse: row.sellerResponse ?? null,
    listing: row.listing ?? null,
  };
}

// ============================================================================
// Chat / inbox — mirrors chatApi.ts ApiConversationPayload / ApiMessagePayload
// ============================================================================

export interface ApiConversationPayload {
  id: string;
  type: 'dm' | 'group';
  title: string | null;
  ownerId: string | null;
  itemId: string | null;
  description?: string | null;
  avatar?: string | null;
  coverPhoto?: string | null;
  participantIds: string[];
  participantProfiles?: Array<{
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    emailVerified?: boolean;
    identityVerified?: boolean;
  }>;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  memberRoles?: Record<string, string>;
  isMuted?: boolean;
  isBlocked?: boolean;
  isRestricted?: boolean;
  isArchived?: boolean;
  requestStatus?: 'pending' | 'accepted' | 'declined';
  markedUnread?: boolean;
  unreadCount?: number;
}

export interface ApiMessagePayload {
  id: string;
  senderType: 'user' | 'bot' | 'system';
  senderUserId: string | null;
  senderBotId?: string | null;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  replyToMessageId?: string;
  deletedForEveryoneAt?: string;
  editedAt?: string;
  editVersion?: number;
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  readBy?: string[];
  isReadByMe?: boolean;
  offer?: Record<string, unknown>;
  /** Embedded poll — `chat_polls` joined at serialize time; votes are
   *  already the viewer's (`myVotes`) and public (`voteCounts`). */
  poll?: {
    id: string;
    question: string;
    options: string[];
    allowMultiple: boolean;
    isAnonymous: boolean;
    closesAt?: string;
    voteCounts: number[];
    myVotes: number[];
  };
  /** Canonical voice receipt — duration/waveform stamped server-side;
   *  the metadata mediaUri stays the playback source. */
  voice?: {
    durationMs?: number;
    waveform?: { samples?: number[] };
    container?: string;
    codec?: string;
    moderationState?: string;
  };
}

export function mapApiMessageToWebMessage(
  payload: ApiMessagePayload,
  currentUserId?: string,
): Message {
  const senderId =
    payload.senderType === 'bot'
      ? payload.senderBotId ?? 'system'
      : payload.senderType === 'user'
        ? payload.senderUserId ?? 'system'
        : 'system';

  const meta = payload.metadata || {};
  const offerSource =
    payload.offer ?? (meta.offerPayload as Record<string, unknown> | undefined);
  const isOffer = Boolean(payload.offer || meta.offerPayload);
  const listingShare = meta.listingShare as Record<string, unknown> | undefined;
  const isListingShare = Boolean(listingShare && typeof listingShare.listingId === 'string');
  const isDocument = meta.mediaType === 'document';
  // Voice: the backend voice receipt is the truth; the metadata flags are
  // the backwards-compatible markers (mirrors the mobile mapper).
  const isVoice =
    Boolean(payload.voice) || meta.voiceMessage === true || meta.mediaType === 'voice';
  const isMine = Boolean(currentUserId) && senderId === currentUserId;

  const type: Message['type'] =
    payload.senderType === 'system'
      ? 'system'
      : isOffer
        ? 'offer'
        : isListingShare
          ? 'listing_share'
          : isVoice
            ? 'voice'
            : isDocument
              ? 'document'
              : typeof meta.mediaUri === 'string'
                ? 'media'
                : 'text';

  const reactions: MessageReaction[] | undefined = payload.reactions?.map((r) => ({
    emoji: r.emoji,
    userIds: r.userIds,
    count: r.userIds.length,
    reactedByMe: currentUserId ? r.userIds.includes(currentUserId) : false,
  }));

  return {
    id: payload.id,
    senderId,
    text: payload.body,
    timestamp: payload.createdAt,
    isSystem: payload.senderType === 'system',
    // The caption IS the body — never a generic 'System' placeholder.
    systemTitle: payload.senderType === 'system' ? payload.body : undefined,
    type,
    sender: payload.senderType === 'system' ? 'system' : isMine ? 'me' : 'other',
    isEdited: Boolean(payload.editedAt) || (payload.editVersion ?? 0) > 0,
    isDeleted: Boolean(payload.deletedForEveryoneAt),
    readStatus:
      isMine && (payload.readBy ?? []).some((uid) => uid !== currentUserId)
        ? 'read'
        : 'sent',
    mediaUri:
      typeof meta.mediaUri === 'string' && !isDocument && !isVoice
        ? meta.mediaUri
        : undefined,
    mediaType:
      meta.mediaType === 'image' || meta.mediaType === 'video' ? meta.mediaType : undefined,
    posterUri: typeof meta.posterUri === 'string' ? meta.posterUri : undefined,
    voiceUri: isVoice && typeof meta.mediaUri === 'string' ? meta.mediaUri : undefined,
    voiceDurationMs:
      payload.voice?.durationMs ??
      (typeof meta.durationMs === 'number' ? meta.durationMs : undefined),
    voiceWaveform: payload.voice?.waveform?.samples,
    documentUri: isDocument
      ? typeof meta.documentUri === 'string'
        ? meta.documentUri
        : typeof meta.mediaUri === 'string'
          ? meta.mediaUri
          : undefined
      : undefined,
    documentName:
      isDocument && typeof meta.documentName === 'string' ? meta.documentName : undefined,
    documentMimeType:
      isDocument && typeof meta.documentMimeType === 'string'
        ? meta.documentMimeType
        : undefined,
    offerPrice:
      isOffer && offerSource && typeof offerSource.offerPrice === 'number'
        ? offerSource.offerPrice
        : undefined,
    originalPrice:
      isOffer && offerSource && typeof offerSource.originalPrice === 'number'
        ? offerSource.originalPrice
        : undefined,
    offerStatus:
      isOffer && offerSource
        ? (offerSource.status as Message['offerStatus'])
        : undefined,
    listing:
      isListingShare && listingShare
        ? {
            id: listingShare.listingId as string,
            title: typeof listingShare.title === 'string' ? listingShare.title : '',
            price: typeof listingShare.price === 'number' ? listingShare.price : 0,
            originalPrice:
              typeof listingShare.originalPrice === 'number'
                ? listingShare.originalPrice
                : undefined,
            image: typeof listingShare.image === 'string' ? listingShare.image : undefined,
            brand: typeof listingShare.brand === 'string' ? listingShare.brand : null,
            size: typeof listingShare.size === 'string' ? listingShare.size : undefined,
            condition:
              typeof listingShare.condition === 'string' ? listingShare.condition : undefined,
            sellerId:
              typeof listingShare.sellerId === 'string' ? listingShare.sellerId : null,
            sellerUsername:
              typeof listingShare.sellerUsername === 'string'
                ? listingShare.sellerUsername
                : undefined,
            isSold: listingShare.isSold === true,
          }
        : undefined,
    replyToMessageId: payload.replyToMessageId,
    reactions,
    poll: payload.poll
      ? {
          id: payload.poll.id,
          question: payload.poll.question,
          options: payload.poll.options,
          allowMultiple: payload.poll.allowMultiple,
          isAnonymous: payload.poll.isAnonymous,
          closesAt: payload.poll.closesAt,
          voteCounts: payload.poll.voteCounts,
          myVotes: payload.poll.myVotes,
        }
      : undefined,
  };
}

/**
 * ApiConversationPayload → web `Conversation`. The web contract expects a
 * resolved counterparty (participantId/Name/Avatar) for DMs — derived from
 * participantProfiles minus the viewer, exactly like the mobile inbox row.
 */
export function mapApiConversationToWeb(
  payload: ApiConversationPayload,
  currentUserId?: string,
  messages: Message[] = [],
): Conversation {
  const isGroup = payload.type === 'group';
  const profiles: ConversationParticipant[] = (payload.participantProfiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    avatar: p.avatar,
    identityVerified: p.identityVerified,
  }));

  const counterparty = !isGroup
    ? profiles.find((p) => p.id !== currentUserId) ?? profiles[0]
    : undefined;

  const lastMessage = payload.lastMessage || messages[messages.length - 1]?.text || '';
  const lastMessageTime =
    payload.lastMessageTime || messages[messages.length - 1]?.timestamp || '';

  return {
    id: payload.id,
    type: payload.type,
    title: payload.title ?? undefined,
    description: payload.description ?? undefined,
    avatar: payload.avatar ?? undefined,
    coverPhoto: payload.coverPhoto ?? undefined,
    participantIds: payload.participantIds,
    participantProfiles: profiles.length > 0 ? profiles : undefined,
    participantId: counterparty?.id ?? payload.ownerId ?? '',
    participantName:
      counterparty?.displayName ?? counterparty?.username ?? payload.title ?? 'Group',
    participantAvatar: counterparty?.avatar ?? payload.avatar ?? '',
    participantVerified: counterparty?.identityVerified,
    lastMessage,
    lastMessageTime,
    unread:
      (payload.unreadCount ?? 0) > 0 || payload.unread || payload.markedUnread === true,
    unreadCount: payload.unreadCount ?? 0,
    isRequest: payload.requestStatus === 'pending',
    isMuted: typeof payload.isMuted === 'boolean' ? payload.isMuted : undefined,
    isArchived: typeof payload.isArchived === 'boolean' ? payload.isArchived : undefined,
    messages,
  };
}

// ============================================================================
// Notifications — mirrors notificationsApi.ts NotificationEvent
// ============================================================================

export interface NotificationEventApi {
  id: string;
  userId?: string;
  channel?: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  status?: string;
  createdAt: string;
  sentAt?: string | null;
  eventType?: string;
  actorUserId?: string | null;
  actorUsername?: string | null;
  actorDisplayName?: string | null;
  actorAvatar?: string | null;
  readAt?: string | null;
  imageUrl?: string | null;
  /** V2 wire flag — the backend's own attention computation. */
  requiresAction?: boolean;
  /** V2 aggregation key (registry `aggregationTemplate` — e.g.
   *  "listing:l5"). Events sharing it collapse into one card within the
   *  24h window; null means the event never aggregates. */
  aggregationKey?: string | null;
  /** V2 structured object reference (registry `objectExtractor`) — the
   *  grouped sentence's object label and the fallback group entity. */
  objectRef?: {
    type: string;
    id: string;
    label?: string;
    imageUrl?: string;
  } | null;
  route?: {
    /** Native screen name — the backend's real emit shape
     *  (`{ screen: 'OrderDetail', params: { orderId } }`). */
    screen?: string;
    name?: string;
    params?: Record<string, unknown>;
    href?: string;
    path?: string;
  } | null;
}

const EVENT_KIND_MAP: Record<string, NotificationKind> = {
  listing_liked: 'like',
  like: 'like',
  offer_received: 'offer',
  offer_countered: 'offer',
  offer_accepted: 'offer',
  offer_declined: 'offer',
  offer: 'offer',
  price_drop: 'price_drop',
  followed: 'follow',
  follow: 'follow',
  order_update: 'order',
  order: 'order',
  review_received: 'review',
  review: 'review',
  new_item: 'new_item',
  new_listing_from_followed: 'new_item',
  // Native card grammar (EVENT_TYPE_CARD_MAP): a followed seller's new
  // listing and a live-start are item news, not a follow event — the
  // 'follow' substring check below would otherwise mis-file them.
  new_listing_from_followed_seller: 'new_item',
  live_started: 'new_item',
  // Money/fulfilment events file under Orders in the native filter tabs.
  payout_processed: 'order',
  payout_failed: 'order',
  refund_completed: 'order',
  payment_failed: 'order',
  smart_sell_decision: 'order',
  saved_search_match: 'saved_search_match',
};

function eventKind(eventType: string | undefined): NotificationKind {
  if (!eventType) return 'system';
  const direct = EVENT_KIND_MAP[eventType];
  if (direct) return direct;
  if (eventType.startsWith('offer')) return 'offer';
  if (eventType.startsWith('order')) return 'order';
  if (eventType.startsWith('auction')) return 'auction';
  if (
    eventType.startsWith('payout') ||
    eventType.startsWith('refund') ||
    eventType.startsWith('payment') ||
    eventType.startsWith('dispatch_extension') ||
    eventType.startsWith('coown_') ||
    eventType.startsWith('smart_sell')
  )
    return 'order';
  if (eventType.includes('follow')) return 'follow';
  if (eventType.includes('like') || eventType.includes('fav')) return 'like';
  if (eventType.includes('review')) return 'review';
  return 'system';
}

/** Native screen name → web href. The backend emits
 *  `{ screen, params }` at every notification write site — earlier web
 *  code only read `route.name`, so every live deep link resolved to
 *  undefined and rows degraded to mark-read-only buttons. */
function screenHref(
  screen: string,
  params: Record<string, unknown>,
  actorUsername?: string | null,
): string | undefined {
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : undefined);
  switch (screen) {
    case 'OrderDetail':
      return str('orderId') ? `/orders/${str('orderId')}` : undefined;
    case 'ItemDetail': {
      const id = str('itemId') ?? str('listingId') ?? str('id');
      return id ? `/item/${id}` : undefined;
    }
    case 'AuctionDetail': {
      const id = str('auctionId') ?? str('id');
      return id ? `/auctions/${id}` : undefined;
    }
    case 'Chat': {
      const id = str('conversationId') ?? str('id');
      return id ? `/inbox/${id}` : undefined;
    }
    case 'UserProfile':
      // /u/* resolves usernames only — a bare userId 404s. The event's
      // actorUsername is the web-resolvable handle.
      return actorUsername ? `/u/${actorUsername}` : undefined;
    case 'Offers':
      return '/offers';
    case 'SellerFulfilment':
      return '/seller-hub/fulfilment';
    case 'SupportCaseDetail':
    case 'support_case':
      return str('caseId') ? `/support/${str('caseId')}` : '/support';
    case 'SupportTicketDetail':
      return str('ticketId') ? `/support/${str('ticketId')}` : '/support';
    case 'Wallet':
      return '/wallet';
    case 'BalanceHistory':
      return '/wallet/history';
    case 'AssetDetail':
      return str('assetId') ? `/co-own/${str('assetId')}` : undefined;
    case 'CoOwnHub':
      return '/co-own';
    case 'Portfolio':
      return '/co-own/portfolio';
    case 'VerificationResponse':
      return str('demandId') ? `/verification/demands/${str('demandId')}` : '/verification';
    case 'CollectionDetail':
      return str('collectionId') ? `/collection/${str('collectionId')}` : '/collections';
    case 'Browse': {
      const q = str('searchQuery');
      const cat = str('categoryId');
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (cat) qs.set('category', cat);
      const suffix = qs.toString();
      return `/browse${suffix ? `?${suffix}` : ''}`;
    }
    case 'AuctionHome':
      return '/auctions';
    case 'MyBids':
      return '/auctions/my-bids';
    case 'LiveStreamViewer':
    case 'LiveStreamReplay':
      return str('sessionId') ? `/live/host/${str('sessionId')}` : '/live';
    case 'CreatorDraftList':
      return '/seller-hub/listings';
    case 'NotificationsList':
      return '/notifications';
    default:
      return undefined;
  }
}

/** Payload fallback — chat events and several emit sites persist without
 *  a route block; the entity id in the payload is the destination
 *  (frontend/src/utils/notificationRouting.ts parity). */
function payloadHref(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  const str = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : undefined);
  const orderId = str('orderId');
  if (orderId) return `/orders/${orderId}`;
  const ticketId = str('ticketId');
  if (ticketId) return `/support/${ticketId}`;
  const caseId = str('caseId');
  if (caseId) return `/support/${caseId}`;
  const auctionId = str('auctionId');
  if (auctionId) return `/auctions/${auctionId}`;
  const assetId = str('assetId');
  if (assetId) return `/co-own/${assetId}`;
  const listingId = str('listingId') ?? str('itemId');
  if (listingId) return `/item/${listingId}`;
  const conversationId = str('conversationId');
  if (conversationId) return `/inbox/${conversationId}`;
  const collectionId = str('collectionId');
  if (collectionId) return `/collection/${collectionId}`;
  const sessionId = str('sessionId');
  if (sessionId) return `/live/host/${sessionId}`;
  return undefined;
}

function eventHref(
  route: NotificationEventApi['route'],
  payload: Record<string, unknown> | undefined,
  actorUsername?: string | null,
): string | undefined {
  if (route) {
    if (typeof route.href === 'string') return route.href;
    if (typeof route.path === 'string') return route.path;
    const params = route.params ?? {};
    const screen = route.screen ?? route.name;
    if (screen) {
      const viaScreen = screenHref(screen, params, actorUsername);
      if (viaScreen) return viaScreen;
    }
    // Legacy web `name` emitters — kept for rows written before the
    // screen contract existed.
    switch (route.name) {
      case 'listing':
      case 'item':
      case 'pdp':
        return typeof params.listingId === 'string' || typeof params.id === 'string'
          ? `/item/${params.listingId ?? params.id}`
          : undefined;
      case 'order':
      case 'orderDetail':
        return typeof params.orderId === 'string' || typeof params.id === 'string'
          ? `/orders/${params.orderId ?? params.id}`
          : undefined;
      case 'profile':
      case 'user':
        return typeof params.username === 'string'
          ? `/u/${params.username}`
          : actorUsername
            ? `/u/${actorUsername}`
            : undefined;
      case 'conversation':
      case 'chat':
        return typeof params.conversationId === 'string' || typeof params.id === 'string'
          ? `/inbox/${params.conversationId ?? params.id}`
          : undefined;
      case 'auction':
        return typeof params.auctionId === 'string' || typeof params.id === 'string'
          ? `/auctions/${params.auctionId ?? params.id}`
          : undefined;
      default:
        break;
    }
  }
  return payloadHref(payload);
}

const ACTOR_KINDS: ReadonlySet<NotificationKind> = new Set(['follow', 'like', 'review']);

export function mapNotificationEventToEntry(event: NotificationEventApi): NotificationEntry {
  const kind = eventKind(event.eventType);
  const isActor = ACTOR_KINDS.has(kind) && Boolean(event.actorAvatar);
  return {
    id: event.id,
    kind,
    // Native composes title + body; body-only drops the event's headline
    // (e.g. "Offer received" never renders when the body carries detail).
    text: event.body && event.title && event.body !== event.title
      ? `${event.title} — ${event.body}`
      : event.body || event.title,
    time: timeAgo(event.createdAt),
    image: isActor ? (event.actorAvatar ?? undefined) : (event.imageUrl ?? event.actorAvatar ?? undefined),
    isActor,
    href: eventHref(event.route, event.payload, event.actorUsername),
    unread: event.readAt == null,
    // Aggregation inputs — the V2 wire fields plus the actor identity and
    // timestamp the 24h grouping pass needs (native
    // aggregateNotifications parity).
    aggregationKey: event.aggregationKey ?? undefined,
    objectRef: event.objectRef ?? undefined,
    actorDisplayName: event.actorDisplayName ?? undefined,
    actorUsername: event.actorUsername ?? undefined,
    actorUserId: event.actorUserId ?? undefined,
    createdAt: event.createdAt,
    savedSearchId:
      typeof event.payload?.savedSearchId === 'string'
        ? event.payload.savedSearchId
        : undefined,
  };
}

/** Legacy AppNotification shape — kept for surfaces still on the base row. */
export function mapNotificationEventToAppNotification(
  event: NotificationEventApi,
): AppNotification {
  const kind = eventKind(event.eventType);
  const type: AppNotification['type'] =
    kind === 'offer'
      ? 'offer'
      : kind === 'order'
        ? 'order'
        : kind === 'follow'
          ? 'follow'
          : kind === 'like'
            ? 'favourite'
            : kind === 'new_item' || kind === 'saved_search_match'
              ? 'new_item'
              : 'system';
  return {
    id: event.id,
    itemImage: event.imageUrl ?? event.actorAvatar ?? '',
    text: event.body || event.title,
    time: event.createdAt,
    type,
  };
}

// ============================================================================
// Commerce — orders (mirrors commerceApi.ts CommerceUserOrder)
// ============================================================================

export interface CommerceUserOrderApi {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  listingTitle?: string | null;
  listingImageUrl?: string | null;
  status: string;
  subtotalGbp: number;
  postageFeeGbp: number;
  /** Buyer-protection fee — detail read only; the list projection omits it. */
  buyerProtectionFeeGbp?: number;
  /** Same value under the settlement-ledger name — detail read only. */
  platformChargeGbp?: number;
  totalGbp: number;
  trackingNumber: string | null;
  shippingProvider?: string | null;
  /** Hosted carrier label URL — present once the label path provisioned it. */
  shippingLabelUrl?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  /** Payment-capture instant — anchors the paid milestone + dispatch SLA. */
  paidAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  buyerUsername?: string | null;
  sellerUsername?: string | null;
  shipByDate?: string | null;
  estimatedDeliveryAt?: string | null;
  estimatedReleaseAt?: string | null;
  inspectionDeadlineAt?: string | null;
  verificationRequested?: boolean;
  /** Checkout instrument refs — detail read only (GET /orders/:id emits
   *  them; the list projection omits them). The order-bound checkout
   *  resume hydrates selections from these, mirroring the native
   *  CommerceOrder fields. */
  addressId?: number | null;
  paymentMethodId?: number | null;
  /** The carrier id the bound shipping quote charged — detail read. */
  shippingCarrierId?: string | null;
  fulfilmentSnapshot?: CommerceOrder['fulfilmentSnapshot'];
  dispatchExtension?: CommerceOrder['dispatchExtension'];
  hasReview?: boolean;
  hasOpenResolution?: boolean;
  /** Seller SLA defect record (migration 284) — detail read only. */
  slaBreach?: CommerceOrder['slaBreach'];
  /** Escrow projection — detail read carries release schedule + settlement. */
  moneyProjection?: CommerceOrder['moneyProjection'];
  /** Checkout-reservation deadline — emitted on the checkout payloads. */
  checkoutExpiresAt?: string | null;
}

export function mapCommerceUserOrder(o: CommerceUserOrderApi): CommerceOrder {
  return {
    id: o.id,
    listingId: o.listingId,
    buyerId: o.buyerId,
    sellerId: o.sellerId,
    status: o.status as CommerceOrder['status'],
    totalPrice: o.totalGbp,
    trackingNumber: o.trackingNumber ?? undefined,
    createdAt: o.createdAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    shipByDate: o.shipByDate,
    estimatedDeliveryAt: o.estimatedDeliveryAt,
    // The list carries no escrow projection — the detail's moneyProjection
    // is the authoritative source for the release estimate.
    estimatedReleaseAt: o.estimatedReleaseAt ?? o.moneyProjection?.estimatedReleaseAt ?? null,
    releasedAt: o.moneyProjection?.releasedAt ?? null,
    inspectionDeadlineAt: o.inspectionDeadlineAt,
    verificationRequested: o.verificationRequested,
    addressId: o.addressId ?? null,
    paymentMethodId: o.paymentMethodId ?? null,
    shippingCarrierId: o.shippingCarrierId ?? null,
    fulfilmentSnapshot: o.fulfilmentSnapshot ?? null,
    dispatchExtension: o.dispatchExtension ?? null,
    // Fee split + fulfilment timestamps — detail read carries them; the
    // summary resolves these first and only derives when absent.
    subtotalGbp: o.subtotalGbp,
    postageFeeGbp: o.postageFeeGbp,
    buyerProtectionFeeGbp: o.buyerProtectionFeeGbp ?? o.platformChargeGbp,
    shippingProvider: o.shippingProvider ?? null,
    shippingLabelUrl: o.shippingLabelUrl ?? null,
    paidAt: o.paidAt ?? null,
    slaBreach: o.slaBreach ?? null,
    moneyProjection: o.moneyProjection ?? null,
    checkoutExpiresAt: o.checkoutExpiresAt ?? null,
    // Server verdicts — keep the tri-state: `undefined` means the read
    // didn't project the flag (detail omits hasReview), `false` is a real
    // negative the capability model can act on.
    hasReview: o.hasReview,
    hasOpenResolution: o.hasOpenResolution,
  };
}

/** Base `Order` projection for narrow-status consumers. */
export function mapToBaseOrder(o: CommerceUserOrderApi): Order {
  const status: Order['status'] =
    o.status === 'delivered' || o.status === 'completed'
      ? 'delivered'
      : o.status === 'cancelled' || o.status === 'refunded' || o.status === 'returned'
        ? 'cancelled'
        : o.status === 'shipped' || o.status === 'in transit' || o.status === 'out for delivery'
          ? 'shipped'
          : 'pending';
  return {
    id: o.id,
    listingId: o.listingId,
    buyerId: o.buyerId,
    sellerId: o.sellerId,
    status,
    totalPrice: o.totalGbp,
    trackingNumber: o.trackingNumber ?? undefined,
    createdAt: o.createdAt,
  };
}

export interface UserTransactionApi {
  id: string;
  type: string;
  lineType?: string;
  amount: number;
  currency?: string;
  direction?: string;
  /** Ledger source_id — the entity the entry settles against (order id,
   *  payout request id, ...). Lets detail surfaces link the real record. */
  sourceId?: string;
  status: string;
  createdAt: string;
  description?: string | null;
}

// ============================================================================
// Auctions — mirrors marketApi.ts MarketAuction / AuctionBidActivity
// ============================================================================

export interface MarketAuctionApi {
  id: string;
  listingId: string;
  seller: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  title: string;
  imageUrl: string | null;
  brand?: string | null;
  category?: string | null;
  conditionLabel?: string | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp?: number;
  buyNowPriceGbp: number | null;
  reservePriceGbp?: number | null;
  bidCount: number;
  lifecycle: string;
  viewerState?: string;
  isWatched?: boolean;
  winnerBidderId?: string | null;
  createdAt?: string;
}

export interface AuctionBidActivityApi {
  id: number;
  bidderId: string;
  /** Detail's bidActivity carries the username; the standalone
   *  /auctions/:id/bids route does not — treat it as optional on the wire. */
  bidderUsername?: string;
  bidderAvatar?: string | null;
  amountGbp: number;
  createdAt: string;
  isViewer?: boolean;
}

export function mapMarketAuctionToItem(a: MarketAuctionApi): AuctionMarketItem {
  return {
    id: a.id,
    listingId: a.listingId,
    sellerId: a.seller.id,
    seller: {
      id: a.seller.id,
      username: a.seller.username || null,
      displayName: a.seller.displayName ?? null,
      avatar: a.seller.avatarUrl ?? null,
    },
    title: a.title,
    image: a.imageUrl ?? '',
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    startingBid: a.startingBidGbp,
    currentBid: a.currentBidGbp,
    bidCount: a.bidCount,
    buyNowPrice: a.buyNowPriceGbp ?? undefined,
    isWatched: a.isWatched === true,
  };
}

export function mapAuctionBidActivity(b: AuctionBidActivityApi, auctionId: string): AuctionBid {
  return {
    id: String(b.id),
    auctionId,
    bidderId: b.bidderId,
    // The bare /bids route omits usernames — fall back to a short
    // non-identifying handle rather than producing an undefined name.
    bidderName:
      b.bidderUsername ??
      `Bidder ${b.bidderId.replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    bidderAvatar: b.bidderAvatar ?? null,
    amount: b.amountGbp,
    createdAt: b.createdAt,
  };
}

// ============================================================================
// Co-Own — mirrors marketApi.ts MarketCoOwnAsset / orders / distributions
// ============================================================================

export interface MarketCoOwnAssetApi {
  id: string;
  listingId?: string | null;
  issuerId: string;
  issuer?: {
    username: string;
    displayName: string | null;
    avatar: string | null;
    location: string | null;
  } | null;
  issuerVerification?: { tier: 'email' | 'id' | 'seller' } | null;
  title: string;
  subtitle?: string | null;
  imageUrl: string | null;
  category?: string | null;
  totalUnits: number;
  availableUnits: number;
  unitPriceGbp: number;
  /** Issuance price in the settlement stable — list + detail wire. */
  unitPriceStable?: number | null;
  /** Latest settled secondary print — the real market mark. */
  lastTradePriceGbp?: number | null;
  /** Server-computed command capabilities — list + detail wire. */
  capabilities?: {
    buy: boolean;
    sell: boolean;
    cancel: boolean;
    buyoutAccept: boolean;
    vote: boolean;
  } | null;
  /** Detail wire — freshness/provenance for the market figures. */
  marketSnapshot?: {
    version?: number;
    asOf: string;
    sourceAsOf: string;
    connectionStatus: 'live' | 'stale' | 'closed';
    lastExecutionPriceGbp: number | null;
    lastExecutionAt: string | null;
    volume24hGbp: number | null;
    marketMovePct24h: number | null;
    bestBidGbp: number | null;
    bestAskGbp: number | null;
  } | null;
  settlementMode?: string;
  issuerJurisdiction?: string | null;
  marketMovePct24h?: number | null;
  holders: number;
  volume24hGbp?: number | null;
  bestBidGbp?: number | null;
  bestAskGbp?: number | null;
  bidDepthUnits?: number;
  askDepthUnits?: number;
  isOpen?: boolean;
  offeringStatus?: 'offering' | 'allocated' | 'failed' | 'closed';
  marketStatus?: 'pre_market' | 'trading' | 'paused' | 'closed';
  custodyNote?: string | null;
  /** Detail endpoint only — the published rights sheet + risk narrative. */
  rights?: {
    version: number;
    rightsType: string;
    jurisdiction: string;
    governingLaw: string | null;
    summaryTerms: string;
    transferable: boolean;
    minHoldingUnits: number;
    economicRights: string | null;
    votingRights: string | null;
    exitRights: string | null;
    feeRights: string | null;
    tbcEtaDate?: string | null;
    tbcReason?: string | null;
  } | null;
  riskDisclosures?: {
    marketRisk: string | null;
    liquidityRisk: string | null;
    custodyRisk: string | null;
    regulatoryRisk: string | null;
    counterpartyRisk: string | null;
    otherRisks: string | null;
    publishedAt: string;
  } | null;
  /** Trust dossier fields (detail endpoint). */
  authenticityStatus?: 'unverified' | 'pending' | 'verified' | null;
  authenticityMethod?: string | null;
  authenticityVerifiedAt?: string | null;
  conditionGrade?: string | null;
  custodianName?: string | null;
  custodianLocation?: string | null;
  custodyInsured?: boolean | null;
  custodyInsurer?: string | null;
  custodyCoverageGbp?: number | null;
  appraisalValueGbp?: number | null;
  appraisalValuedAt?: string | null;
  appraisalValuer?: string | null;
  buyerProtection?: boolean | null;
  escrowPartner?: string | null;
  safeguardingPartner?: string | null;
  legalVehicleName?: string | null;
  legalVehicleType?: string | null;
  legalVehicleJurisdiction?: string | null;
  provenance?: string | null;
  escrowTermsUrl?: string | null;
  safeguardingTermsUrl?: string | null;
  safeguardingEvidenceUrl?: string | null;
  buyerProtectionTermsUrl?: string | null;
  safeguarded?: boolean | null;
  listingTier?: string | null;
  settlementEtaHours?: number | null;
  recourseAgreementSigned?: boolean | null;
  recourseStatus?: string | null;
  totalTradedValueGbp?: number | null;
  activeVerificationDemands?: number | null;
  lockupEndDate?: string | null;
  lockupMonths?: number | null;
  appraisalStaleDays?: number | null;
  staleMarkDays?: number | null;
  feeSchedule?: {
    managementFeePct?: number | null;
    performanceFeePct?: number | null;
    platformFeePct?: number | null;
    sourcingFeeGbp?: number | null;
  } | null;
  tradingFeeRate?: number | null;
  trustAuditEvents?: Array<{
    eventType: string;
    createdAt: string;
    changedByLabel?: string | null;
  }>;
  marketAuditEvents?: Array<{
    id: number | string;
    eventType: string;
    payload: unknown;
    createdAt: string;
  }>;
  createdAt: string;
}

export function mapCoOwnAsset(a: MarketCoOwnAssetApi): CoOwnAsset {
  return {
    id: a.id,
    listingId: a.listingId ?? null,
    issuer: {
      id: a.issuerId,
      username: a.issuer?.username ?? '',
      displayName: a.issuer?.displayName ?? null,
      avatar: a.issuer?.avatar ?? null,
      location: a.issuer?.location ?? null,
      verificationTier: a.issuerVerification?.tier ?? null,
    },
    title: a.title,
    subtitle: a.subtitle ?? null,
    imageUrl: a.imageUrl ?? '',
    category: a.category ?? '',
    totalUnits: a.totalUnits,
    availableUnits: a.availableUnits,
    unitPriceGbp: a.unitPriceGbp,
    unitPriceStable: a.unitPriceStable ?? null,
    lastTradePriceGbp: a.lastTradePriceGbp ?? null,
    capabilities: a.capabilities ?? null,
    marketSnapshot: a.marketSnapshot
      ? {
          asOf: a.marketSnapshot.asOf,
          sourceAsOf: a.marketSnapshot.sourceAsOf,
          connectionStatus: a.marketSnapshot.connectionStatus,
          lastExecutionPriceGbp: a.marketSnapshot.lastExecutionPriceGbp ?? null,
          lastExecutionAt: a.marketSnapshot.lastExecutionAt ?? null,
          volume24hGbp: a.marketSnapshot.volume24hGbp ?? null,
          marketMovePct24h: a.marketSnapshot.marketMovePct24h ?? null,
          bestBidGbp: a.marketSnapshot.bestBidGbp ?? null,
          bestAskGbp: a.marketSnapshot.bestAskGbp ?? null,
        }
      : null,
    settlementMode: 'ONEZE',
    issuerJurisdiction: a.issuerJurisdiction ?? null,
    marketMovePct24h: a.marketMovePct24h ?? null,
    holders: a.holders ?? 0,
    volume24hGbp: a.volume24hGbp ?? null,
    bestBidGbp: a.bestBidGbp ?? null,
    bestAskGbp: a.bestAskGbp ?? null,
    bidDepthUnits: a.bidDepthUnits ?? 0,
    askDepthUnits: a.askDepthUnits ?? 0,
    offeringStatus: a.offeringStatus ?? (a.isOpen === false ? 'closed' : 'offering'),
    marketStatus: a.marketStatus ?? 'trading',
    listingTier: a.listingTier ?? null,
    custodyNote: a.custodyNote ?? null,
    rights: a.rights
      ? {
          ...a.rights,
          tbcEtaDate: a.rights.tbcEtaDate ?? null,
          tbcReason: a.rights.tbcReason ?? null,
        }
      : null,
    riskDisclosures: a.riskDisclosures ?? null,
    dossier: {
      authenticityStatus: a.authenticityStatus ?? null,
      authenticityMethod: a.authenticityMethod ?? null,
      authenticityVerifiedAt: a.authenticityVerifiedAt ?? null,
      conditionGrade: a.conditionGrade ?? null,
      provenance: a.provenance ?? null,
      custodianName: a.custodianName ?? null,
      custodianLocation: a.custodianLocation ?? null,
      custodyInsured: a.custodyInsured ?? null,
      custodyInsurer: a.custodyInsurer ?? null,
      custodyCoverageGbp: a.custodyCoverageGbp ?? null,
      appraisalValueGbp: a.appraisalValueGbp ?? null,
      appraisalValuedAt: a.appraisalValuedAt ?? null,
      appraisalValuer: a.appraisalValuer ?? null,
      buyerProtection: a.buyerProtection ?? null,
      escrowPartner: a.escrowPartner ?? null,
      safeguardingPartner: a.safeguardingPartner ?? null,
      legalVehicleName: a.legalVehicleName ?? null,
      legalVehicleType: a.legalVehicleType ?? null,
      legalVehicleJurisdiction: a.legalVehicleJurisdiction ?? null,
      escrowTermsUrl: a.escrowTermsUrl ?? null,
      safeguardingTermsUrl: a.safeguardingTermsUrl ?? null,
      safeguardingEvidenceUrl: a.safeguardingEvidenceUrl ?? null,
      buyerProtectionTermsUrl: a.buyerProtectionTermsUrl ?? null,
      safeguarded: a.safeguarded ?? null,
      listingTier: a.listingTier ?? null,
      settlementEtaHours: a.settlementEtaHours ?? null,
      recourseAgreementSigned: a.recourseAgreementSigned ?? null,
      recourseStatus: a.recourseStatus ?? null,
      totalTradedValueGbp: a.totalTradedValueGbp ?? null,
      activeVerificationDemands: a.activeVerificationDemands ?? null,
      lockupEndDate: a.lockupEndDate ?? null,
      lockupMonths: a.lockupMonths ?? null,
      appraisalStaleDays: a.appraisalStaleDays ?? null,
      staleMarkDays: a.staleMarkDays ?? null,
      feeSchedule: a.feeSchedule
        ? {
            managementFeePct: a.feeSchedule.managementFeePct ?? null,
            performanceFeePct: a.feeSchedule.performanceFeePct ?? null,
            platformFeePct: a.feeSchedule.platformFeePct ?? null,
            sourcingFeeGbp: a.feeSchedule.sourcingFeeGbp ?? null,
          }
        : null,
      tradingFeeRate: a.tradingFeeRate ?? null,
      trustAuditEvents: (a.trustAuditEvents ?? []).map((e) => ({
        eventType: e.eventType,
        createdAt: e.createdAt,
        changedByLabel: e.changedByLabel ?? null,
      })),
      marketAuditEvents: (a.marketAuditEvents ?? []).map((e) => ({
        id: e.id,
        eventType: e.eventType,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
    },
    createdAt: a.createdAt,
  };
}

export interface MarketCoOwnOrderApi {
  id: number;
  assetId: string;
  userId?: string;
  side: 'buy' | 'sell';
  orderType?: 'market' | 'limit' | 'protected_market';
  units: number;
  filledUnits?: number;
  unitPriceGbp: number;
  feeGbp: number;
  totalGbp: number;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
  createdAt: string;
}

export function mapCoOwnOrder(o: MarketCoOwnOrderApi): CoOwnOrder {
  return {
    id: String(o.id),
    assetId: o.assetId,
    side: o.side,
    orderType: o.orderType ?? 'market',
    unitPriceGbp: o.unitPriceGbp,
    units: o.units,
    filledUnits: o.filledUnits ?? 0,
    status: o.status === 'rejected' ? 'cancelled' : o.status,
    feeGbp: o.feeGbp,
    totalGbp: o.totalGbp,
    placedAt: o.createdAt,
  };
}

export interface CoOwnOrderBookResponseApi {
  ok: true;
  bids: Array<{ side: 'buy' | 'sell'; unitPriceGbp: number; units: number; orderCount: number }>;
  asks: Array<{ side: 'buy' | 'sell'; unitPriceGbp: number; units: number; orderCount: number }>;
  serverTimestamp?: string;
  reconciliationState?: 'reconciled' | 'reconciling' | 'break';
  snapshotSequence?: number;
  eventSequence?: number;
  lastExecutionTimestamp?: string | null;
  stalenessThresholdSeconds?: number;
  /** Per-side level caps applied server-side — the ladder is truncated
   *  at these bounds (default 40). */
  depthLimits?: { bid: number; ask: number };
}

export function mapCoOwnOrderBook(
  assetId: string,
  payload: CoOwnOrderBookResponseApi,
): OrderBookSnapshot {
  return {
    assetId,
    bids: payload.bids.map((l) => ({ side: 'buy', unitPriceGbp: l.unitPriceGbp, units: l.units, orderCount: l.orderCount })),
    asks: payload.asks.map((l) => ({ side: 'sell', unitPriceGbp: l.unitPriceGbp, units: l.units, orderCount: l.orderCount })),
    serverTime: payload.serverTimestamp ?? '',
    source: 'live',
    reconciliationState:
      payload.reconciliationState === 'reconciling' ||
      payload.reconciliationState === 'break'
        ? payload.reconciliationState
        : 'reconciled',
    snapshotSequence: payload.snapshotSequence,
    eventSequence: payload.eventSequence,
    lastExecutionTimestamp: payload.lastExecutionTimestamp ?? null,
    stalenessThresholdSeconds: payload.stalenessThresholdSeconds,
    depthLimits: payload.depthLimits,
  };
}

// GET /co-own/price-alerts — server-persisted alerts. The wire carries
// `condition` + minor units; the contract works in direction + GBP.
export interface CoOwnPriceAlertApi {
  id: string;
  assetId: string;
  condition: 'above' | 'below';
  targetPriceGbpMinor: number | string;
  active: boolean;
  triggeredAt?: string | null;
  createdAt: string;
}

export function mapCoOwnPriceAlert(
  a: CoOwnPriceAlertApi,
): StoredPriceAlert & { triggeredAt: string | null } {
  return {
    id: a.id,
    assetId: a.assetId,
    direction: a.condition,
    targetPriceGbp: Number(a.targetPriceGbpMinor) / 100,
    active: a.active,
    triggeredAt: a.triggeredAt ?? null,
    createdAt: a.createdAt,
  };
}

export interface CoOwnRecourseApi {
  agreement?: {
    id: string;
    version: number;
    signedAt: string;
    maxLiabilityGbp: number | string;
    personalGuarantee: boolean;
    status: string;
    triggeredAt?: string | null;
    triggeredReason?: string | null;
    settledAt?: string | null;
    settledAmountGbp?: number | string | null;
  } | null;
  sellerLiability?: {
    totalActiveLiabilityGbp: number | string;
    activeAgreementCount: number;
    totalAgreementsSigned: number;
    totalRecourseTriggered: number;
    totalDebtRecoveredGbp: number | string;
    riskTier: string;
    backgroundCheckStatus: string;
  } | null;
  verificationDemands?: Array<{
    id: number;
    demandType: string;
    deadline: string;
    status: string;
    inspectorVerdict?: string | null;
    createdAt: string;
  }> | null;
  events?: Array<{
    id: number;
    eventType: string;
    amountGbp?: number | string | null;
    createdAt: string;
  }> | null;
}

export function mapCoOwnRecourse(
  assetId: string,
  r: CoOwnRecourseApi,
): CoOwnRecourse {
  return {
    assetId,
    agreement: r.agreement
      ? {
          id: r.agreement.id,
          version: Number(r.agreement.version),
          signedAt: r.agreement.signedAt,
          maxLiabilityGbp: Number(r.agreement.maxLiabilityGbp),
          personalGuarantee: r.agreement.personalGuarantee,
          status: r.agreement.status,
          triggeredAt: r.agreement.triggeredAt ?? null,
          triggeredReason: r.agreement.triggeredReason ?? null,
          settledAt: r.agreement.settledAt ?? null,
          settledAmountGbp:
            r.agreement.settledAmountGbp != null
              ? Number(r.agreement.settledAmountGbp)
              : null,
        }
      : null,
    sellerLiability: r.sellerLiability
      ? {
          totalActiveLiabilityGbp: Number(r.sellerLiability.totalActiveLiabilityGbp),
          activeAgreementCount: r.sellerLiability.activeAgreementCount,
          totalAgreementsSigned: r.sellerLiability.totalAgreementsSigned,
          totalRecourseTriggered: r.sellerLiability.totalRecourseTriggered,
          totalDebtRecoveredGbp: Number(r.sellerLiability.totalDebtRecoveredGbp),
          riskTier: r.sellerLiability.riskTier,
          backgroundCheckStatus: r.sellerLiability.backgroundCheckStatus,
        }
      : null,
    verificationDemands: (r.verificationDemands ?? []).map((d) => ({
      id: d.id,
      demandType: d.demandType,
      deadline: d.deadline,
      status: d.status,
      inspectorVerdict: d.inspectorVerdict ?? null,
      createdAt: d.createdAt,
    })),
    events: (r.events ?? []).map((e) => ({
      id: e.id,
      eventType: e.eventType,
      amountGbp: e.amountGbp != null ? Number(e.amountGbp) : null,
      createdAt: e.createdAt,
    })),
  };
}

/** GET /co-own/assets/:id/executions + /co-own/executions — the public
 *  tape rows straight off coOwn_trades. The wire deliberately carries no
 *  aggressor side (a print is a match between both sides); it does
 *  carry the settlement outcome, which the per-asset route extends with
 *  failureReason/recoveryAction. */
export interface CoOwnExecutionApi {
  id: number;
  assetId: string;
  units: number;
  unitPriceGbp: number;
  notionalGbp: number;
  executedAt: string;
  settlementStatus?: string;
  failureReason?: string | null;
  recoveryAction?: string | null;
}

export function mapCoOwnExecution(e: CoOwnExecutionApi): TradeLedgerEntry {
  return {
    id: String(e.id),
    assetId: e.assetId,
    // The executions wire prints no aggressor side — null, never guessed.
    side: null,
    units: e.units,
    unitPriceGbp: e.unitPriceGbp,
    executedAt: e.executedAt,
    settlementStatus: e.settlementStatus,
    notionalGbp: e.notionalGbp,
    failureReason: e.failureReason ?? null,
  };
}

export interface CoOwnDistributionApi {
  id: string;
  assetId: string;
  amountGbpMinor: number;
  unitsAtRecord?: number | null;
  perUnitGbpMinor: number;
  /** Free-text wire column — 'revenue_share' is the schema default. */
  distributionType: string;
  /** Free-text wire column — migration 279 permits scheduled/pending/
   *  settled/reversed/reinvested/reinvest_failed/retained_cash. */
  status: string;
  createdAt: string;
  settledAt: string | null;
  projectedPayableDate?: string | null;
  recordDate?: string | null;
  exDate?: string | null;
}

const DISTRIBUTION_KINDS: ReadonlySet<string> = new Set([
  'rental_income',
  'resale_gain',
  'licensing',
  'revenue_share',
  'dividend',
]);

export function mapCoOwnDistribution(d: CoOwnDistributionApi): Distribution {
  return {
    id: d.id,
    assetId: d.assetId,
    // Known wire types map 1:1; anything else is 'other' with the raw
    // type kept for the label — never silently re-labelled rental income.
    kind: DISTRIBUTION_KINDS.has(d.distributionType)
      ? (d.distributionType as Distribution['kind'])
      : 'other',
    rawType: d.distributionType,
    amountPerUnitGbp: d.perUnitGbpMinor / 100,
    totalPotGbp: d.amountGbpMinor / 100,
    unitsAtRecord: d.unitsAtRecord ?? undefined,
    // The wire status passes through verbatim — settled/reversed/
    // reinvested states render as what they are, never collapsed to
    // paid/scheduled.
    status: d.status,
    paidAt: d.settledAt,
    scheduledFor: d.projectedPayableDate ?? d.exDate ?? d.createdAt,
    exDate: d.exDate ?? null,
    // The stage-date trio rides through verbatim — the calendar renders
    // only the dates the wire actually carries.
    recordDate: d.recordDate ?? null,
    projectedPayableDate: d.projectedPayableDate ?? null,
  };
}

export interface CoOwnCorporateActionApi {
  id: string;
  assetId: string;
  actionType: string;
  title: string;
  description: string | null;
  status: string;
  payableDate: string | null;
  recordDate?: string | null;
  exDate?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

const CORPORATE_ACTION_KINDS: ReadonlySet<string> = new Set([
  'sale_vote',
  'insurance_renewal',
  'authentication',
  'exit',
  'governance',
  'buyback',
  'dividend',
  'split',
]);

export function mapCoOwnCorporateAction(a: CoOwnCorporateActionApi): CorporateAction {
  const meta = a.metadata ?? {};
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 ? v : null;
  const top = a as unknown as Record<string, unknown>;
  return {
    id: a.id,
    assetId: a.assetId,
    // Known wire action types map 1:1 — 'sale_vote' is the ballot a
    // sale offer raises, 'governance' the generic vote. Anything else
    // is 'other' with the raw actionType kept so a buyback or split
    // never renders as "Sale offer".
    kind: CORPORATE_ACTION_KINDS.has(a.actionType)
      ? (a.actionType as CorporateAction['kind'])
      : 'other',
    actionType: a.actionType,
    title: a.title,
    description: a.description ?? '',
    // The voting deadline is the contract's own field; payable/record
    // dates only stand in for older projections.
    closesAt:
      str(top.votingDeadline) ??
      str(meta.votingDeadline) ??
      a.payableDate ??
      a.recordDate ??
      a.exDate ??
      a.createdAt,
    // The wire status passes through verbatim — announced/executing/
    // executed/cancelled/completed are all real backend states.
    status: a.status,
    yourVote:
      meta.yourVote === 'for' || meta.yourVote === 'against' || meta.yourVote === 'abstain'
        ? meta.yourVote
        : null,
    votesFor: num(meta.votesFor) ?? 0,
    votesAgainst: num(meta.votesAgainst) ?? 0,
    votesAbstain: num(meta.votesAbstain) ?? 0,
    // Wave 10/11 top-level fields preferred; metadata JSONB is the
    // fallback for older projections — both fail closed to null.
    quorumUnits: num(top.quorumUnits) ?? num(meta.quorumUnits),
    passThresholdPct: num(top.passThresholdPct) ?? num(meta.passThresholdPct),
    perUnitValueGbp:
      num(top.perUnitValueGbpMinor) != null
        ? num(top.perUnitValueGbpMinor)! / 100
        : num(meta.perUnitValueGbpMinor) != null
          ? num(meta.perUnitValueGbpMinor)! / 100
          : null,
    totalValueGbp:
      num(top.totalValueGbpMinor) != null
        ? num(top.totalValueGbpMinor)! / 100
        : num(meta.totalValueGbpMinor) != null
          ? num(meta.totalValueGbpMinor)! / 100
          : null,
  };
}

export interface CoOwnBuyoutOfferApi {
  id: string;
  assetId: string;
  bidderUserId: string;
  bidderUsername?: string;
  offerPriceGbp: number;
  targetUnits: number;
  acceptedUnits: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export function mapCoOwnBuyoutOffer(o: CoOwnBuyoutOfferApi, viewerId?: string): CoOwnBuyoutOffer {
  return {
    id: o.id,
    assetId: o.assetId,
    bidderUsername: o.bidderUsername ?? '',
    mine: viewerId != null && o.bidderUserId === viewerId,
    offerPriceGbp: o.offerPriceGbp,
    targetUnits: o.targetUnits,
    acceptedUnits: o.acceptedUnits,
    status:
      o.status === 'filled' || o.status === 'withdrawn' ? o.status : 'open',
    expiresAt: o.expiresAt,
    createdAt: o.createdAt,
  };
}

/** `/co-own/portfolio` holding row — the projection's full wire shape
 *  (coOwnPortfolioProjection.ts). No `holderCount`, no realised-P&L
 *  column: the projection reports unrealised only. */
export interface CoOwnPortfolioHoldingApi {
  assetId: string;
  title?: string;
  imageUrl?: string | null;
  totalUnits: number;
  sellableUnits?: number;
  unitPriceGbp: number | null;
  markBasis?: 'last_trade' | 'reference' | 'offering' | 'none';
  markTimestamp?: string | null;
  markAgeSeconds?: number | null;
  marketValueGbp?: number | null;
  costBasisGbp: number;
  unrealisedPnlGbp?: number | null;
  marketStatus?: string;
  offeringStatus?: string;
  bestBidGbp?: number | null;
  bestAskGbp?: number | null;
  partialLiquidity?: boolean;
  lockupEndDate?: string | null;
}

/** `/co-own/portfolio` holding → web `CoOwnPosition`. The projection has
 *  no realised-P&L column — `realizedProfitGbp` stays null, surfaces
 *  render '—' rather than a fabricated 0. */
export function mapCoOwnPortfolioHolding(h: CoOwnPortfolioHoldingApi): CoOwnPosition {
  const avgEntry = h.totalUnits > 0 ? h.costBasisGbp / h.totalUnits : 0;
  return {
    assetId: h.assetId,
    units: h.totalUnits,
    avgEntryPriceGbp: avgEntry,
    realizedProfitGbp: null,
    title: h.title,
    imageUrl: h.imageUrl ?? null,
    sellableUnits: h.sellableUnits,
    markPriceGbp: h.unitPriceGbp,
    markBasis: h.markBasis,
    markTimestamp: h.markTimestamp ?? null,
    markAgeSeconds: h.markAgeSeconds ?? null,
    marketValueGbp: h.marketValueGbp ?? null,
    costBasisGbp: h.costBasisGbp,
    unrealisedPnlGbp: h.unrealisedPnlGbp ?? null,
    marketStatus: h.marketStatus,
    offeringStatus: h.offeringStatus,
    partialLiquidity: h.partialLiquidity,
    lockupEndDate: h.lockupEndDate ?? null,
  };
}

/** `/co-own/assets/:id/executions` print → feed `ActivityEvent`. The
 *  wire carries trade facts only — no event type, actor, side or note —
 *  so kind is honestly 'trade' for every live print. A non-settled
 *  execution is named for what it is rather than passed off as a trade
 *  that cleared. Nothing is invented. */
export function mapCoOwnExecutionToActivity(e: CoOwnExecutionApi): ActivityEvent {
  return {
    id: String(e.id),
    assetId: e.assetId,
    kind: 'trade',
    actorUsername: null,
    units: e.units ?? null,
    unitPriceGbp: e.unitPriceGbp ?? null,
    note:
      e.settlementStatus != null && e.settlementStatus !== 'settled'
        ? `Settlement ${e.settlementStatus}`
        : null,
    at: e.executedAt ?? '',
  };
}
