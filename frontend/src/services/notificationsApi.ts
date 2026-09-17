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
  | 'order_dispatch_sla_breach'
  | 'resolution_opened'
  | 'resolution_status_changed'
  | 'review_received'
  | 'review_response_received'
  | 'review_moderated'
  | 'chat_message'
  | 'payout_processed'
  | 'refund_completed'
  | 'payment_failed'
  | 'auction_outbid'
  | 'auction_won'
  | 'auction_ending_soon'
  | 'auction_bid'
  | 'auction_cancelled'
  | 'auction_reserve_not_met'
  | 'auction_sold_awaiting_payment'
  | 'auction_payment_expired'
  | 'auction_sold'
  | 'offer_created'
  | 'offer_countered'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_expired'
  | 'offer_cancelled'
  | 'new_follower'
  | 'follow_received'
  | 'price_drop'
  | 'new_listing_from_followed_seller'
  | 'saved_search_match'
  | 'live_started'
  | 'dispatch_extension_proposed'
  | 'dispatch_extension_responded'
  | 'scheduled_publication_success'
  | 'scheduled_publication_blocked'
  | 'scheduled_publication_failed'
  | 'support.operator_reply'
  | 'support.information_requested'
  | 'support.case_resolved'
  | 'coown_buyout_accepted'
  | 'coown_verification_responded'
  | 'ops_alert'
  | 'safety_outcome'
  | 'generic';

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
    token?: string;
    tokenRedacted?: boolean;
    platformLabel?: string;
    isActive: boolean;
    appVersion: string | null;
    createdAt: string;
    lastSeenAt: string;
  };
}

export type NotificationDevice = RegisterNotificationDeviceResponse['device'];
export type ListedNotificationDevice = ListNotificationDevicesResponse['devices'][number];

interface ListNotificationDevicesResponse {
  ok: true;
  devices: Array<{
    id: number;
    provider: PushProvider;
    platform: PushPlatform;
    token?: string;
    tokenRedacted?: boolean;
    platformLabel?: string;
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
  status: 'queued' | 'ticketed' | 'sent' | 'failed' | 'suppressed' | 'in_app_only';
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
  type: 'listing' | 'order' | 'auction' | 'look' | 'poster' | 'conversation' | 'wallet' | 'live_session';
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

/** Extract a live-session object reference (mirrors backend getLiveSessionObject). */
function liveSessionObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const sessionId = payloadString(payload, 'sessionId') ?? payloadString(payload, 'roomId');
  if (sessionId) {
    return {
      type: 'live_session',
      id: sessionId,
      label: payloadString(payload, 'sessionTitle') ?? payloadString(payload, 'title'),
      imageUrl: payloadString(payload, 'thumbnailUrl') ?? payloadString(payload, 'hostAvatarUrl'),
    };
  }
  return undefined;
}

/** Extract a creator-document object reference (scheduled publication events). */
function documentObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const documentId = payloadString(payload, 'documentId');
  if (documentId) {
    return {
      type: 'poster',
      id: documentId,
      label: payloadString(payload, 'documentTitle') ?? payloadString(payload, 'title'),
    };
  }
  return undefined;
}

/** Extract a support-case reference as a conversation object. */
function supportCaseObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const caseId = payloadString(payload, 'caseId');
  if (caseId) {
    return {
      type: 'conversation',
      id: caseId,
      label: payloadString(payload, 'caseSubject') ?? payloadString(payload, 'subject'),
    };
  }
  return undefined;
}

/** Extract a review reference — routed to the order, keyed by review id. */
function reviewObjectExtractor(payload: Record<string, unknown>): NotificationObjectRef | undefined {
  const reviewId = payloadString(payload, 'reviewId');
  if (reviewId) {
    return {
      type: 'order',
      id: payloadString(payload, 'orderId') ?? reviewId,
      label: payloadString(payload, 'orderShortId') ?? payloadString(payload, 'listingTitle'),
    };
  }
  return listingObjectExtractor(payload);
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

/** Aggregate by offer id within a semantic role. */
function offerAggregation(payload: Record<string, unknown>): string | null {
  const offerId = payloadString(payload, 'offerId');
  return offerId ?? null;
}

/** Aggregate by support case id. */
function caseAggregation(payload: Record<string, unknown>): string | null {
  const caseId = payloadString(payload, 'caseId');
  return caseId ?? null;
}

/** Aggregate by creator document id (scheduled publication events). */
function documentAggregation(payload: Record<string, unknown>): string | null {
  const documentId = payloadString(payload, 'documentId');
  return documentId ?? null;
}

/** Aggregate by live session id (mirrors backend liveSessionAggregation). */
function liveSessionAggregation(payload: Record<string, unknown>): string | null {
  const sessionId = payloadString(payload, 'sessionId') ?? payloadString(payload, 'roomId');
  return sessionId ?? null;
}

/** Aggregate by review id. */
function reviewAggregation(payload: Record<string, unknown>): string | null {
  const reviewId = payloadString(payload, 'reviewId');
  return reviewId ?? null;
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
  order_dispatch_sla_breach: {
    semanticRole: 'commerce',
    attention: 'action',
    requiresAction: true,
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
  // Offer lifecycle — emitted by the domain outbox drain (offer.* events).
  // Created/countered/accepted all demand a response (accept/decline, or
  // complete checkout before the reservation expires); the terminal states
  // are informational only. Mirrored from the backend registry.
  offer_created: {
    semanticRole: 'commerce',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: offerAggregation,
    objectExtractor: listingObjectExtractor,
  },
  offer_countered: {
    semanticRole: 'commerce',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: offerAggregation,
    objectExtractor: listingObjectExtractor,
  },
  offer_accepted: {
    semanticRole: 'commerce',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: offerAggregation,
    objectExtractor: orderObjectExtractor,
  },
  offer_declined: {
    semanticRole: 'commerce',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: offerAggregation,
    objectExtractor: listingObjectExtractor,
  },
  offer_expired: {
    semanticRole: 'commerce',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: offerAggregation,
    objectExtractor: listingObjectExtractor,
  },
  offer_cancelled: {
    semanticRole: 'commerce',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: offerAggregation,
    objectExtractor: listingObjectExtractor,
  },
  // Seller-side auction lifecycle (second-chance offered, sold awaiting
  // payment, payment expired → relisted) — emitted as 'auction_bid' by the
  // auction sweep worker.
  auction_bid: {
    semanticRole: 'auction',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  // Terminal/seller-side auction lifecycle — mirrored from the backend
  // registry (all informational: no actionable CTA on a dead or settled
  // auction). Previously absent from the union → these events fell back to
  // 'generic' and never surfaced under the auction filter.
  auction_cancelled: {
    semanticRole: 'auction',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  auction_reserve_not_met: {
    semanticRole: 'auction',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  auction_sold_awaiting_payment: {
    semanticRole: 'auction',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  auction_payment_expired: {
    semanticRole: 'auction',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  auction_sold: {
    semanticRole: 'auction',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: auctionObjectExtractor,
  },
  // Seller responded to a review / moderation action taken on a review.
  review_response_received: {
    semanticRole: 'social',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: reviewAggregation,
    objectExtractor: reviewObjectExtractor,
  },
  review_moderated: {
    semanticRole: 'system',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: reviewAggregation,
    objectExtractor: reviewObjectExtractor,
  },
  // Payment capture failed — reservation released, no charge completed.
  payment_failed: {
    semanticRole: 'financial',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  // Dispatch extension lifecycle — proposed demands a buyer response;
  // responded is the seller-facing outcome.
  dispatch_extension_proposed: {
    semanticRole: 'commerce',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  dispatch_extension_responded: {
    semanticRole: 'commerce',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: orderObjectExtractor,
  },
  // Creator scheduled-publication lifecycle — success is informational;
  // blocked/failed require the creator to intervene (publish manually).
  scheduled_publication_success: {
    semanticRole: 'system',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: documentAggregation,
    objectExtractor: documentObjectExtractor,
  },
  scheduled_publication_blocked: {
    semanticRole: 'system',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: documentAggregation,
    objectExtractor: documentObjectExtractor,
  },
  scheduled_publication_failed: {
    semanticRole: 'system',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: documentAggregation,
    objectExtractor: documentObjectExtractor,
  },
  // Operator support case events — 'support_case' routes resolve to
  // SupportCaseDetail. information_requested demands a customer reply.
  'support.operator_reply': {
    semanticRole: 'system',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: caseAggregation,
    objectExtractor: supportCaseObjectExtractor,
  },
  'support.information_requested': {
    semanticRole: 'system',
    attention: 'action',
    requiresAction: true,
    aggregationTemplate: caseAggregation,
    objectExtractor: supportCaseObjectExtractor,
  },
  'support.case_resolved': {
    semanticRole: 'system',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: caseAggregation,
    objectExtractor: supportCaseObjectExtractor,
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
  // The follow endpoint emits 'follow_received' — same semantics as
  // new_follower (kept for the registry-declared type name).
  follow_received: {
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
  // Saved-search match — a listing matching a saved query surfaced. Commerce
  // role like price_drop; rides the wishlist push category server-side.
  saved_search_match: {
    semanticRole: 'commerce',
    attention: 'info',
    requiresAction: false,
    aggregationTemplate: listingAggregation,
    objectExtractor: listingObjectExtractor,
  },
  // A followed seller's live session started — social role, 'important'
  // because a live show is ephemeral (mirrors the backend registry).
  live_started: {
    semanticRole: 'social',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: liveSessionAggregation,
    objectExtractor: liveSessionObjectExtractor,
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
  // Co-own lifecycle — buyout accepted; verification demand evidence
  // submitted. Financial-role, per-asset/demand aggregation; mirrors the
  // backend registry.
  coown_buyout_accepted: {
    semanticRole: 'financial',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = payloadString(payload, 'assetId');
      return id ? `coown:${id}` : null;
    },
    objectExtractor: () => undefined,
  },
  coown_verification_responded: {
    semanticRole: 'financial',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = payloadString(payload, 'demandId') ?? payloadString(payload, 'assetId');
      return id ? `coown_demand:${id}` : null;
    },
    objectExtractor: () => undefined,
  },
  ops_alert: {
    semanticRole: 'system',
    attention: 'important',
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const code = payloadString(payload, 'code');
      return code ? `ops:${code}` : null;
    },
    objectExtractor: () => undefined,
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
  // Some producers (chat fan-out) persist events without a registry eventType
  // — they arrive as 'generic' with the semantic type carried in
  // `payload.event`. When the payload type names a registry entry, resolve
  // against it so the row renders with the correct role/verb instead of a
  // generic system row.
  const payloadEventType = typeof event.payload?.event === 'string' ? event.payload.event : null;
  const effectiveType: NotificationEventType =
    event.eventType === 'generic' &&
    payloadEventType &&
    payloadEventType in NotificationEventRegistry
      ? (payloadEventType as NotificationEventType)
      : event.eventType;

  const registry = NotificationEventRegistry[effectiveType] ?? NotificationEventRegistry.generic;
  const rawAggregationKey = registry.aggregationTemplate(event.payload);
  const objectRef = registry.objectExtractor(event.payload);

  return {
    ...event,
    eventType: effectiveType,
    semanticRole: registry.semanticRole,
    requiresAction: registry.requiresAction,
    attention: registry.attention,
    aggregationKey: rawAggregationKey ? `${effectiveType}:${rawAggregationKey}` : null,
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

export type NotificationPreviewPolicy = 'full' | 'sender_only' | 'hidden';

export interface NotificationQuietHoursPatch {
  enabled: boolean;
  startHour: number;
  endHour: number;
  /** IANA timezone — the server evaluates the window in this zone. */
  timezone?: string;
}

interface ListNotificationEventsResponse {
  ok: true;
  items: NotificationEvent[];
  nextCursor: string | null;
  /** Server-computed unread total — present when the backend supports it. */
  unreadCount?: number;
  /**
   * Server-computed per-filter totals — present when the backend supports
   * filtered counts. Keys mirror the frontend NotificationFilter keys.
   */
  filterCounts?: Record<string, number>;
}

interface UnreadCountResponse {
  ok: true;
  unreadCount: number;
}

interface GetPreferencesResponse {
  ok: true;
  preferences: Record<string, boolean>;
  /** Server-persisted quiet hours — present when the backend supports it. */
  quietHours?: {
    enabled?: boolean;
    startHour?: number;
    endHour?: number;
    /** Alternate field naming used by some contract versions. */
    start?: number;
    end?: number;
  };
  /** Server-persisted push preview policy — 'full' | 'sender_only' | 'hidden'. */
  previewPolicy?: NotificationPreviewPolicy;
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

export async function deactivateNotificationDevice(deviceId: number): Promise<void> {
  await fetchJson<{ ok: true }>(`/notifications/devices/${deviceId}`, {
    method: 'DELETE',
  });
}

export interface ListNotificationEventsOptions {
  limit?: number;
  cursor?: string | null;
  /**
   * Restrict to these event types (sent as a comma-separated `eventType`
   * query param). Servers that don't implement the param ignore it — the
   * client-side filter pass is idempotent on an already-filtered page.
   */
  eventTypes?: NotificationEventType[];
  /** Restrict to unread events (`unread=true` query param). */
  unread?: boolean;
}

export interface ListNotificationEventsResult {
  items: NotificationEvent[];
  nextCursor: string | null;
  /** Server-computed totals, when the backend provides them. */
  unreadCount?: number;
  filterCounts?: Record<string, number>;
}

export async function listNotificationEvents(
  opts?: ListNotificationEventsOptions,
): Promise<ListNotificationEventsResult> {
  const limit = opts?.limit ?? 30;
  const params = [`limit=${limit}`];
  if (opts?.cursor) {
    params.push(`cursor=${encodeURIComponent(opts.cursor)}`);
  }
  if (opts?.eventTypes?.length) {
    params.push(`eventType=${encodeURIComponent(opts.eventTypes.join(','))}`);
  }
  if (opts?.unread) {
    params.push('unread=true');
  }
  const payload = await fetchJson<ListNotificationEventsResponse>(
    `/notifications/events?${params.join('&')}`
  );

  return {
    items: payload.items,
    nextCursor: payload.nextCursor,
    unreadCount: typeof payload.unreadCount === 'number' ? payload.unreadCount : undefined,
    filterCounts: payload.filterCounts && typeof payload.filterCounts === 'object'
      ? payload.filterCounts
      : undefined,
  };
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

/**
 * Sends a real push through the server pipeline (queue → Expo → receipts)
 * so "test notification" actually exercises delivery, not just the local
 * scheduler. Returns the queued event id.
 */
export async function sendTestPushNotification(input: {
  title: string;
  body: string;
}): Promise<{ eventId: string }> {
  const payload = await fetchJson<{ ok: true; eventId: string; status: string }>(
    '/notifications/push/test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return { eventId: payload.eventId };
}

export interface NotificationPreferencesPayload {
  /** Per-category on/off toggles keyed by push category. */
  preferences: Record<string, boolean>;
  /**
   * User-level quiet hours — server-persisted when the backend contract
   * supports it. Sent alongside category prefs so the whole notification
   * posture round-trips through one endpoint.
   */
  quietHours?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    timezone?: string;
  };
  /** Push preview policy applied across categories ('full' | 'hidden'). */
  previewPolicy?: NotificationPreviewPolicy;
}

export async function getNotificationPreferences(): Promise<NotificationPreferencesPayload> {
  const payload = await fetchJson<GetPreferencesResponse>('/notifications/preferences');
  const quiet = payload.quietHours;
  const startHour = typeof quiet?.startHour === 'number' ? quiet.startHour
    : typeof quiet?.start === 'number' ? quiet.start
    : undefined;
  const endHour = typeof quiet?.endHour === 'number' ? quiet.endHour
    : typeof quiet?.end === 'number' ? quiet.end
    : undefined;
  return {
    preferences: payload.preferences,
    quietHours:
      quiet && typeof quiet.enabled === 'boolean' && startHour !== undefined && endHour !== undefined
        ? { enabled: quiet.enabled, startHour, endHour }
        : undefined,
    previewPolicy: payload.previewPolicy,
  };
}

export async function updateNotificationPreferences(
  update: NotificationPreferencesPayload,
): Promise<void> {
  await fetchJson<{ ok: true }>('/notifications/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
}