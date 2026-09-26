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
  CorporateAction,
  Distribution,
  OrderBookSnapshot,
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
  auctionEndsAt?: string | null;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
  seller?: ListingSeller | null;
  likes?: number | null;
  views?: number | null;
  featured?: boolean | null;
  promoted?: boolean | null;
  disclosure?: string | null;
  promotionId?: string | null;
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
}

function nonBlank(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
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
    likes: typeof row.likes === 'number' && row.likes > 0 ? row.likes : 0,
    views: typeof row.views === 'number' && row.views > 0 ? row.views : 0,
    isSold: status === 'sold',
    sellerId,
    seller: normalizeSeller(row),
    category,
    subcategory: nonBlank(row.subcategory),
    description: nonBlank(row.description) ?? '',
    createdAt: nonBlank(row.createdAt) ?? undefined,
    auctionEndsAt: nonBlank(row.auctionEndsAt),
    status,
    shippingMethod: row.shippingMethod ?? null,
    shippingPayer: row.shippingPayer ?? null,
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

/** Backend `/users/:id/profile` aggregate (mirrors profileApi.ts). */
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
    pronouns?: string | null;
    emailVerified: boolean;
    identityVerified?: boolean;
    sellerVerified?: boolean;
    createdAt: string;
  };
  stats: {
    activeListingCount: number;
    soldListingCount: number;
    followerCount: number;
    followingCount: number;
    reviewCount: number;
    ratingAverage: number | null;
  };
  viewer?: {
    isSelf: boolean;
    isFollowing: boolean;
    canMessage: boolean;
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
    avatar: u.avatar ?? '',
    coverPhoto: u.coverPhoto ?? undefined,
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

/** `/sellers/:id/reviews` row → `Review`. */
export function mapReviewRow(row: {
  id: string | number;
  userId?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewerUsername?: string;
  reviewerAvatar?: string | null;
  rating?: number;
  text?: string | null;
  body?: string | null;
  createdAt?: string;
  isAutomatic?: boolean;
}): Review {
  return {
    id: String(row.id),
    userId: row.userId ?? '',
    reviewerId: row.reviewerId ?? '',
    reviewerName: row.reviewerName ?? row.reviewerUsername ?? 'Member',
    reviewerAvatar: row.reviewerAvatar ?? '',
    rating: typeof row.rating === 'number' ? row.rating : 0,
    text: row.text ?? row.body ?? '',
    date: row.createdAt ?? '',
    isAutomatic: row.isAutomatic === true,
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
  const isVoice = meta.mediaType === 'voice' || meta.voiceMessage === true;
  const isMine = Boolean(currentUserId) && senderId === currentUserId;

  const type: Message['type'] =
    payload.senderType === 'system'
      ? 'system'
      : isOffer
        ? 'offer'
        : isListingShare
          ? 'listing_share'
          : isDocument || isVoice
            ? 'text'
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
    systemTitle: payload.senderType === 'system' ? 'System' : undefined,
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
  route?: {
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
  saved_search_match: 'saved_search_match',
};

function eventKind(eventType: string | undefined): NotificationKind {
  if (!eventType) return 'system';
  const direct = EVENT_KIND_MAP[eventType];
  if (direct) return direct;
  if (eventType.startsWith('offer')) return 'offer';
  if (eventType.startsWith('order')) return 'order';
  if (eventType.startsWith('auction')) return 'system';
  if (eventType.includes('follow')) return 'follow';
  if (eventType.includes('like') || eventType.includes('fav')) return 'like';
  if (eventType.includes('review')) return 'review';
  return 'system';
}

function eventHref(route: NotificationEventApi['route']): string | undefined {
  if (!route) return undefined;
  if (typeof route.href === 'string') return route.href;
  if (typeof route.path === 'string') return route.path;
  const params = route.params ?? {};
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
        : typeof params.userId === 'string' || typeof params.id === 'string'
          ? `/u/${params.userId ?? params.id}`
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
      return undefined;
  }
}

const ACTOR_KINDS: ReadonlySet<NotificationKind> = new Set(['follow', 'like', 'review']);

export function mapNotificationEventToEntry(event: NotificationEventApi): NotificationEntry {
  const kind = eventKind(event.eventType);
  const isActor = ACTOR_KINDS.has(kind) && Boolean(event.actorAvatar);
  return {
    id: event.id,
    kind,
    text: event.body || event.title,
    time: timeAgo(event.createdAt),
    image: isActor ? (event.actorAvatar ?? undefined) : (event.imageUrl ?? event.actorAvatar ?? undefined),
    isActor,
    href: eventHref(event.route),
    unread: event.readAt == null,
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
  totalGbp: number;
  trackingNumber: string | null;
  shippingProvider?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  buyerUsername?: string | null;
  sellerUsername?: string | null;
  shipByDate?: string | null;
  estimatedDeliveryAt?: string | null;
  estimatedReleaseAt?: string | null;
  inspectionDeadlineAt?: string | null;
  verificationRequested?: boolean;
  fulfilmentSnapshot?: CommerceOrder['fulfilmentSnapshot'];
  dispatchExtension?: CommerceOrder['dispatchExtension'];
  hasReview?: boolean;
  hasOpenResolution?: boolean;
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
    estimatedReleaseAt: o.estimatedReleaseAt,
    inspectionDeadlineAt: o.inspectionDeadlineAt,
    verificationRequested: o.verificationRequested,
    fulfilmentSnapshot: o.fulfilmentSnapshot ?? null,
    dispatchExtension: o.dispatchExtension ?? null,
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
  bidderUsername: string;
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
    title: a.title,
    image: a.imageUrl ?? '',
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    startingBid: a.startingBidGbp,
    currentBid: a.currentBidGbp,
    bidCount: a.bidCount,
    buyNowPrice: a.buyNowPriceGbp ?? undefined,
  };
}

export function mapAuctionBidActivity(b: AuctionBidActivityApi, auctionId: string): AuctionBid {
  return {
    id: String(b.id),
    auctionId,
    bidderId: b.bidderId,
    bidderName: b.bidderUsername,
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
    custodyNote: a.custodyNote ?? null,
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
      payload.reconciliationState === 'reconciled' ? 'reconciled' : 'stale',
  };
}

export interface CoOwnExecutionApi {
  id: number;
  assetId: string;
  units: number;
  unitPriceGbp: number;
  notionalGbp: number;
  executedAt: string;
  side?: 'buy' | 'sell';
}

export function mapCoOwnExecution(e: CoOwnExecutionApi): TradeLedgerEntry {
  return {
    id: String(e.id),
    assetId: e.assetId,
    side: e.side ?? 'buy',
    units: e.units,
    unitPriceGbp: e.unitPriceGbp,
    executedAt: e.executedAt,
  };
}

export interface CoOwnDistributionApi {
  id: string;
  assetId: string;
  amountGbpMinor: number;
  perUnitGbpMinor: number;
  distributionType: string;
  status: string;
  createdAt: string;
  settledAt: string | null;
  projectedPayableDate?: string | null;
  exDate?: string | null;
}

export function mapCoOwnDistribution(d: CoOwnDistributionApi): Distribution {
  const kind: Distribution['kind'] =
    d.distributionType === 'resale_gain' || d.distributionType === 'licensing'
      ? d.distributionType
      : 'rental_income';
  return {
    id: d.id,
    assetId: d.assetId,
    kind,
    amountPerUnitGbp: d.perUnitGbpMinor / 100,
    totalPotGbp: d.amountGbpMinor / 100,
    status: d.status === 'paid' || d.settledAt ? 'paid' : 'scheduled',
    paidAt: d.settledAt,
    scheduledFor: d.projectedPayableDate ?? d.exDate ?? d.createdAt,
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

export function mapCoOwnCorporateAction(a: CoOwnCorporateActionApi): CorporateAction {
  const kindMap: Record<string, CorporateAction['kind']> = {
    sale_vote: 'sale_vote',
    insurance_renewal: 'insurance_renewal',
    authentication: 'authentication',
    exit: 'exit',
  };
  const status: CorporateAction['status'] =
    a.status === 'passed' || a.status === 'rejected'
      ? a.status
      : a.status === 'open' || a.status === 'active'
        ? 'open'
        : 'pending_tally';
  const meta = a.metadata ?? {};
  return {
    id: a.id,
    assetId: a.assetId,
    kind: kindMap[a.actionType] ?? 'sale_vote',
    title: a.title,
    description: a.description ?? '',
    closesAt: a.payableDate ?? a.recordDate ?? a.exDate ?? a.createdAt,
    status,
    yourVote: meta.yourVote === 'for' || meta.yourVote === 'against' ? meta.yourVote : null,
    votesFor: typeof meta.votesFor === 'number' ? meta.votesFor : 0,
    votesAgainst: typeof meta.votesAgainst === 'number' ? meta.votesAgainst : 0,
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

export interface CoOwnPortfolioHoldingApi {
  assetId: string;
  title?: string;
  totalUnits: number;
  sellableUnits?: number;
  unitPriceGbp: number | null;
  costBasisGbp: number;
  unrealisedPnlGbp?: number | null;
}

/** `/co-own/portfolio` holding → web `CoOwnPosition`. `realizedProfitGbp`
 *  stays 0 — the projection reports unrealised only (same honesty rule as
 *  the mobile adapter). */
export function mapCoOwnPortfolioHolding(h: CoOwnPortfolioHoldingApi): CoOwnPosition {
  const avgEntry = h.totalUnits > 0 ? h.costBasisGbp / h.totalUnits : 0;
  return {
    assetId: h.assetId,
    units: h.totalUnits,
    avgEntryPriceGbp: avgEntry,
    realizedProfitGbp: 0,
  };
}

/** `/co-own/assets/:id/executions` event → feed `ActivityEvent`. */
export function mapCoOwnExecutionToActivity(e: {
  id: number | string;
  assetId: string;
  units?: number | null;
  unitPriceGbp?: number | null;
  eventType?: string;
  actorUsername?: string | null;
  note?: string | null;
  executedAt?: string;
  createdAt?: string;
}): ActivityEvent {
  const kindMap: Record<string, ActivityEvent['kind']> = {
    buy: 'buy',
    sell: 'sell',
    listing: 'listing',
    distribution: 'distribution',
    corporate_action: 'corporate_action',
    trade_settled: 'buy',
  };
  return {
    id: String(e.id),
    assetId: e.assetId,
    kind: kindMap[e.eventType ?? ''] ?? 'buy',
    actorUsername: e.actorUsername ?? null,
    units: e.units ?? null,
    unitPriceGbp: e.unitPriceGbp ?? null,
    note: e.note ?? null,
    at: e.executedAt ?? e.createdAt ?? '',
  };
}
