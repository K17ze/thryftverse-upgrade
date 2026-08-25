import { fetchJson } from '../lib/apiClient';

export type PushProvider = 'expo';
export type PushPlatform = 'ios' | 'android' | 'web';

export type NotificationEventType =
  | 'order_created'
  | 'order_paid'
  | 'order_cancelled'
  | 'order_dispatched'
  | 'order_in_transit'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_refunded'
  | 'resolution_opened'
  | 'resolution_status_changed'
  | 'review_received'
  | 'chat_message'
  | 'payout_processed'
  | 'refund_completed'
  | 'auction_outbid'
  | 'auction_won'
  | 'auction_ending_soon'
  | 'new_follower'
  | 'price_drop'
  | 'new_listing_from_followed_seller'
  | 'safety_outcome'
  | 'generic';

export type NotificationPushCategory =
  | 'messages'
  | 'offers'
  | 'wishlist'
  | 'followers'
  | 'orderUpdates'
  | 'priceDrops'
  | 'auctionAlerts'
  | 'news';

export interface NotificationRoute {
  screen: string;
  params?: Record<string, unknown>;
}

interface RegisterNotificationDeviceResponse {
  ok: true;
  device: {
    id: number;
    userId: string;
    provider: PushProvider;
    platform: PushPlatform;
    token: string;
    isActive: boolean;
    appVersion: string | null;
    createdAt: string;
    lastSeenAt: string;
  };
}

interface ListNotificationDevicesResponse {
  ok: true;
  devices: Array<{
    id: number;
    provider: PushProvider;
    platform: PushPlatform;
    token: string;
    isActive: boolean;
    appVersion: string | null;
    createdAt: string;
    lastSeenAt: string;
  }>;
}

export type NotificationPriority = 'urgent' | 'normal' | 'low';

export interface NotificationEvent {
  id: string;
  userId: string;
  channel: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'sent' | 'failed';
  providerMessageId: string | null;
  providerError: string | null;
  createdAt: string;
  sentAt: string | null;
  eventType: NotificationEventType;
  actorUserId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorAvatar: string | null;
  readAt: string | null;
  imageUrl: string | null;
  route: NotificationRoute | null;
  priority?: NotificationPriority;
}

// ============================================================================
// Notification V2 — structured semantic contract
// ----------------------------------------------------------------------------
// The V2 contract replaces text-based category inference (deriveCardType,
// parsePayloadEvent, regex object extraction) with a structured event
// registry. The semantic role, attention level, and action requirement are
// looked up from the event type — never derived from title/body text. This
// makes the contract localizable, testable, and art-directable.
// ============================================================================

export type NotificationSemanticRole = 'social' | 'commerce' | 'auction' | 'financial' | 'system';

export type NotificationAttentionLevel = 'critical' | 'action' | 'important' | 'info';

export interface NotificationObjectRef {
  type: 'listing' | 'order' | 'auction' | 'look' | 'poster' | 'conversation' | 'wallet';
  id: string;
  label?: string;
  imageUrl?: string;
}

export interface NotificationActorRef {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface NotificationEventV2 extends NotificationEvent {
  /** Structured semantic role — never derived from title/body text */
  semanticRole: NotificationSemanticRole;
  /** Whether this event requires user action (outbid, ship order, dispute) */
  requiresAction: boolean;
  /** Structured aggregation key — e.g. "social.look_liked:look123" */
  aggregationKey: string | null;
  /** Attention priority — critical/action/important/info */
  attention: NotificationAttentionLevel;
  /** Structured object reference for presentation */
  objectRef?: NotificationObjectRef;
  /** Structured actor reference */
  actorRef?: NotificationActorRef;
}

interface NotificationEventRegistryEntry {
  semanticRole: NotificationSemanticRole;
  attention: NotificationAttentionLevel;
  requiresAction: boolean;
  aggregationTemplate: (payload: Record<string, unknown>) => string | null;
  objectExtractor: (payload: Record<string, unknown>) => NotificationObjectRef | undefined;
}

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const v = payload[key];
  return typeof v === 'number' ? v : undefined;
}

/** Extract a listing object reference from common payload shapes. */
function listingObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const listingId = payloadString(payload, 'listingId');
  if (listingId) {
    return {
      type: 'listing',
      id: listingId,
      label: payloadString(payload, 'listingTitle') ?? payloadString(payload, 'itemTitle'),
      imageUrl: payloadString(payload, 'listingImageUrl') ?? payloadString(payload, 'imageUrl'),
    };
  }
  return undefined;
}

/** Extract an order object reference from common payload shapes. */
function orderObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const orderId = payloadString(payload, 'orderId');
  if (orderId) {
    return {
      type: 'order',
      id: orderId,
      label: payloadString(payload, 'orderNumber') ?? payloadString(payload, 'orderLabel'),
      imageUrl: payloadString(payload, 'itemImageUrl'),
    };
  }
  return undefined;
}

/** Extract an auction object reference from common payload shapes. */
function auctionObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const auctionId = payloadString(payload, 'auctionId');
  if (auctionId) {
    return {
      type: 'auction',
      id: auctionId,
      label: payloadString(payload, 'auctionTitle') ?? payloadString(payload, 'itemTitle'),
      imageUrl: payloadString(payload, 'auctionImageUrl') ?? payloadString(payload, 'imageUrl'),
    };
  }
  return undefined;
}

/** Extract a look object reference from common payload shapes. */
function lookObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const lookId = payloadString(payload, 'lookId');
  if (lookId) {
    return {
      type: 'look',
      id: lookId,
      label: payloadString(payload, 'lookTitle'),
      imageUrl: payloadString(payload, 'lookImageUrl'),
    };
  }
  // Fall back to listing if the payload only carries a listingId (legacy).
  return listingObjectExtractor(payload);
}

/** Extract a conversation object reference from common payload shapes. */
function conversationObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const conversationId = payloadString(payload, 'conversationId');
  if (conversationId) {
    return {
      type: 'conversation',
      id: conversationId,
      label: payloadString(payload, 'conversationLabel'),
    };
  }
  return undefined;
}

/** Extract a wallet object reference from common payload shapes. */
function walletObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  // Wallet events don't always carry an id; use a sentinel so the row can
  // still present a structured object type.
  const hasWallet = payloadString(payload, 'payoutId') || payloadString(payload, 'refundId') || payloadString(payload, 'walletId');
  if (hasWallet) {
    return {
      type: 'wallet',
      id: (payloadString(payload, 'payoutId') ?? payloadString(payload, 'refundId') ?? payloadString(payload, 'walletId'))!,
      label: payloadString(payload, 'amountLabel'),
    };
  }
  return undefined;
}

/** Extract a poster object reference from common payload shapes. */
function posterObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const posterId = payloadString(payload, 'posterId');
  if (posterId) {
    return {
      type: 'poster',
      id: posterId,
      label: payloadString(payload, 'posterTitle'),
      imageUrl: payloadString(payload, 'posterImageUrl'),
    };
  }
  return undefined;
}

/** No aggregation — each event stands alone. */
function noAggregation(): null {
  return null;
}

/** Aggregate by listing id within a semantic role. */
function listingAggregation(payload: Record<string, unknown>): string | null {
  const listingId = payloadString(payload, 'listingId');
  return listingId ?? null;
}

/** Aggregate by auction id within a semantic role. */
function auctionAggregation(payload: Record<string, unknown>): string | null {
  const auctionId = payloadString(payload, 'auctionId');
  return auctionId ?? null;
}

/** Aggregate by order id within a semantic role. */
function orderAggregation(payload: Record<string, unknown>): string | null {
  const orderId = payloadString(payload, 'orderId');
  return orderId ?? null;
}

/** Aggregate by look id within a semantic role. */
function lookAggregation(payload: Record<string, unknown>): string | null {
  const lookId = payloadString(payload, 'lookId');
  return lookId ?? null;
}

/** Aggregate by conversation id within a semantic role. */
function conversationAggregation(payload: Record<string, unknown>): string | null {
  const conversationId = payloadString(payload, 'conversationId');
  return conversationId ?? null;
}

/**
 * Notification Event Registry — the single source of truth for semantic
 * role, attention level, action requirement, aggregation key, and object
 * reference extraction. Category is NEVER derived from title/body text.
 */
export const NotificationEventRegistry: Record<NotificationEventType, NotificationEventRegistryEntry> = {
  order_created: {
    semanticRole: 'commerce',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  order_paid: {
    semanticRole: 'commerce',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  order_cancelled: {
    semanticRole: 'commerce',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  order_dispatched: {
    semanticRole: 'commerce',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  order_in_transit: {
    semanticRole: 'commerce',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  order_out_for_delivery: {
    semanticRole: 'commerce',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  order_delivered: {
    semanticRole: 'commerce',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  order_refunded: {
    semanticRole: 'financial',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  resolution_opened: {
    semanticRole: 'system',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: noAggregation,
    objectExtractor: (payload) => {
      const ticketId = payloadString(payload, 'ticketId');
      if (ticketId) {
        return { type: 'conversation', id: ticketId, label: payloadString(payload, 'ticketSubject') };
      }
      return undefined;
    },
  },
  resolution_status_changed: {
    semanticRole: 'system',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: (payload) => {
      const ticketId = payloadString(payload, 'ticketId');
      if (ticketId) {
        return { type: 'conversation', id: ticketId, label: payloadString(payload, 'ticketSubject') };
      }
      return undefined;
    },
  },
  review_received: {
    semanticRole: 'social',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: listingAggregation,
    objectExtractor: listingObjectExtractor,
  },
  chat_message: {
    semanticRole: 'social',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: conversationAggregation,
    objectExtractor: conversationObjectExtractor,
  },
  payout_processed: {
    semanticRole: 'financial',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: walletObjectExtractor,
  },
  refund_completed: {
    semanticRole: 'financial',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: walletObjectExtractor,
  },
  auction_outbid: {
    semanticRole: 'auction',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  auction_won: {
    semanticRole: 'auction',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  auction_ending_soon: {
    semanticRole: 'auction',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  new_follower: {
    semanticRole: 'social',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: (payload) => {
      const followerId = payloadString(payload, 'followerId') ?? payloadString(payload, 'actorUserId');
      if (followerId) {
        return { type: 'poster', id: followerId, label: payloadString(payload, 'followerUsername') };
      }
      return undefined;
    },
  },
  price_drop: {
    semanticRole: 'commerce',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: listingAggregation,
    objectExtractor: listingObjectExtractor,
  },
  new_listing_from_followed_seller: {
    semanticRole: 'social',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: listingAggregation,
    objectExtractor: listingObjectExtractor,
  },
  generic: {
    semanticRole: 'system',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: (payload) => {
      // Try the most common shapes for generic events.
      return (
        listingObjectExtractor(payload) ??
        orderObjectExtractor(payload) ??
        auctionObjectExtractor(payload) ??
        lookObjectExtractor(payload) ??
        posterObjectExtractor(payload) ??
        conversationObjectExtractor(payload) ??
        walletObjectExtractor(payload)
      );
    },
  },
  safety_outcome: {
    semanticRole: 'system',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: (payload) => payloadString(payload, 'caseId') ?? null,
    objectExtractor: () => undefined,
  },
};

/**
 * Upgrade a raw NotificationEvent to the V2 structured contract.
 *
 * The semantic role, attention level, and action requirement are looked up
 * from the event registry — never derived from title/body text. This is the
 * contract boundary: changing English copy must leave the category unchanged.
 */
export function upgradeToV2(event: NotificationEvent): NotificationEventV2 {
  const registry = NotificationEventRegistry[event.eventType] ?? NotificationEventRegistry.generic;
  const rawAggregationKey = registry.aggregationTemplate(event.payload);
  const objectRef = registry.objectExtractor(event.payload);

  return {
    ...event,
    semanticRole: registry.semanticRole,
    requiresAction: registry.requiresAction,
    attention: registry.attention,
    aggregationKey: rawAggregationKey ? `${event.eventType}:${rawAggregationKey}` : null,
    objectRef,
    actorRef: event.actorUserId
      ? {
          userId: event.actorUserId,
          displayName: event.actorDisplayName || event.actorUsername || 'Someone',
          avatarUrl: event.actorAvatar ?? undefined,
        }
      : undefined,
  };
}

/** Read a numeric payload value safely (exposed for row presenters). */
export function readPayloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  return payloadNumber(payload, key);
}

/** Read a string payload value safely (exposed for row presenters). */
export function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  return payloadString(payload, key);
}

const URGENT_EVENT_TYPES: NotificationEventType[] = [
  'order_created',
  'order_paid',
  'order_dispatched',
  'order_delivered',
  'order_cancelled',
  'order_refunded',
  'resolution_opened',
  'resolution_status_changed',
  'auction_outbid',
  'auction_won',
  'payout_processed',
  'refund_completed',
];

const LOW_EVENT_TYPES: NotificationEventType[] = [
  'generic',
];

export function resolveNotificationPriority(eventType: NotificationEventType): NotificationPriority {
  if (URGENT_EVENT_TYPES.includes(eventType)) return 'urgent';
  if (LOW_EVENT_TYPES.includes(eventType)) return 'low';
  return 'normal';
}

export function resolveNotificationCategory(eventType: NotificationEventType): NotificationPushCategory | null {
  if (eventType === 'chat_message') return 'messages';
  if (eventType.startsWith('order_') || eventType === 'refund_completed' || eventType === 'payout_processed') return 'orderUpdates';
  if (eventType === 'auction_outbid' || eventType === 'auction_won' || eventType === 'auction_ending_soon') return 'auctionAlerts';
  if (eventType === 'review_received') return 'wishlist';
  if (eventType === 'new_follower') return 'followers';
  if (eventType === 'price_drop') return 'priceDrops';
  if (eventType === 'new_listing_from_followed_seller') return 'followers';
  return null;
}

interface ListNotificationEventsResponse {
  ok: true;
  items: NotificationEvent[];
  nextCursor: string | null;
}

interface UnreadCountResponse {
  ok: true;
  unreadCount: number;
}

interface GetPreferencesResponse {
  ok: true;
  preferences: Record<string, boolean>;
}

export interface RegisterNotificationDeviceInput {
  token: string;
  provider?: PushProvider;
  platform: PushPlatform;
  appVersion?: string;
  metadata?: Record<string, unknown>;
}

export async function registerNotificationDevice(input: RegisterNotificationDeviceInput) {
  const payload = await fetchJson<RegisterNotificationDeviceResponse>('/notifications/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'expo',
      ...input,
    }),
  });

  return payload.device;
}

export async function listNotificationDevices() {
  const payload = await fetchJson<ListNotificationDevicesResponse>('/notifications/devices');
  return payload.devices;
}

export async function deactivateNotificationDevice(token: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/notifications/devices/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
}

export async function listNotificationEvents(opts?: {
  limit?: number;
  cursor?: string | null;
}): Promise<{ items: NotificationEvent[]; nextCursor: string | null }> {
  const limit = opts?.limit ?? 30;
  const cursorParam = opts?.cursor ? `&cursor=${encodeURIComponent(opts.cursor)}` : '';
  const payload = await fetchJson<ListNotificationEventsResponse>(
    `/notifications/events?limit=${limit}${cursorParam}`
  );

  return { items: payload.items, nextCursor: payload.nextCursor };
}

export async function getUnreadCount(): Promise<number> {
  const payload = await fetchJson<UnreadCountResponse>('/notifications/unread-count');
  return payload.unreadCount;
}

export async function markNotificationRead(eventId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/notifications/events/${encodeURIComponent(eventId)}/read`, {
    method: 'POST',
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetchJson<{ ok: true }>('/notifications/read-all', {
    method: 'POST',
  });
}

export async function deleteNotificationEvent(eventId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/notifications/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}

export async function getNotificationPreferences(): Promise<Record<string, boolean>> {
  const payload = await fetchJson<GetPreferencesResponse>('/notifications/preferences');
  return payload.preferences;
}

export async function updateNotificationPreferences(
  preferences: Record<string, boolean>
): Promise<void> {
  await fetchJson<{ ok: true }>('/notifications/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences }),
  });
}