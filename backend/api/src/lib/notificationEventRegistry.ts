/**
 * Notification Event Registry — Phase 5 V2 Semantic Contract
 *
 * Maps each notification event type to structured semantic metadata:
 * - semanticRole: social/commerce/auction/financial/system
 * - attention: critical/action/important/info
 * - requiresAction: whether user action is needed
 * - aggregationTemplate: how to build a structured aggregation key
 * - objectExtractor: how to extract the object reference from payload
 *
 * This eliminates the need for frontend text-based category inference.
 * The frontend can use these structured fields directly instead of
 * parsing title/body prose.
 */

export type NotificationSemanticRole =
  | "social"
  | "commerce"
  | "auction"
  | "financial"
  | "system";

export type NotificationAttentionLevel =
  | "critical"
  | "action"
  | "important"
  | "info";

export interface NotificationEventMetadata {
  semanticRole: NotificationSemanticRole;
  attention: NotificationAttentionLevel;
  requiresAction: boolean;
  /** Builds a structured aggregation key from the event payload */
  aggregationTemplate: (payload: Record<string, unknown>) => string | null;
  /** Extracts the object reference from the payload */
  objectExtractor: (
    payload: Record<string, unknown>,
  ) => {
    type:
      | "listing"
      | "order"
      | "auction"
      | "look"
      | "poster"
      | "conversation"
      | "wallet"
      | "live_session";
    id: string;
    label?: string;
    imageUrl?: string;
  } | undefined;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function getListingObject(payload: Record<string, unknown>) {
  const id = getString(payload, "listingId") ?? getString(payload, "itemId");
  if (!id) return undefined;
  return {
    type: "listing" as const,
    id,
    label: getString(payload, "listingTitle") ?? getString(payload, "itemTitle") ?? undefined,
    imageUrl: getString(payload, "listingImage") ?? getString(payload, "itemImage") ?? undefined,
  };
}

function getOrderObject(payload: Record<string, unknown>) {
  const id = getString(payload, "orderId");
  if (!id) return undefined;
  return {
    type: "order" as const,
    id,
    label: getString(payload, "orderShortId") ?? undefined,
    imageUrl: undefined,
  };
}

function getAuctionObject(payload: Record<string, unknown>) {
  const id = getString(payload, "auctionId");
  if (!id) return undefined;
  return {
    type: "auction" as const,
    id,
    label: getString(payload, "auctionTitle") ?? getString(payload, "listingTitle") ?? undefined,
    imageUrl: getString(payload, "listingImage") ?? undefined,
  };
}

function getWalletObject(payload: Record<string, unknown>) {
  const id = getString(payload, "payoutId") ?? getString(payload, "transactionId");
  if (!id) return undefined;
  return {
    type: "wallet" as const,
    id,
    label: undefined,
    imageUrl: undefined,
  };
}

function getConversationObject(payload: Record<string, unknown>) {
  const id = getString(payload, "conversationId") ?? getString(payload, "chatId");
  if (!id) return undefined;
  return {
    type: "conversation" as const,
    id,
    label: undefined,
    imageUrl: undefined,
  };
}

function listingAggregation(payload: Record<string, unknown>): string | null {
  const id = getString(payload, "listingId") ?? getString(payload, "itemId");
  return id ? `listing:${id}` : null;
}

function getLiveSessionObject(payload: Record<string, unknown>) {
  const id = getString(payload, "sessionId") ?? getString(payload, "roomId");
  if (!id) return undefined;
  return {
    type: "live_session" as const,
    id,
    label: getString(payload, "sessionTitle") ?? getString(payload, "title") ?? undefined,
    imageUrl:
      getString(payload, "thumbnailUrl") ??
      getString(payload, "hostAvatarUrl") ??
      undefined,
  };
}

function liveSessionAggregation(payload: Record<string, unknown>): string | null {
  const id = getString(payload, "sessionId") ?? getString(payload, "roomId");
  return id ? `live:${id}` : null;
}

function auctionAggregation(payload: Record<string, unknown>): string | null {
  const id = getString(payload, "auctionId");
  return id ? `auction:${id}` : null;
}

function orderAggregation(payload: Record<string, unknown>): string | null {
  const id = getString(payload, "orderId");
  return id ? `order:${id}` : null;
}

function offerAggregation(payload: Record<string, unknown>): string | null {
  const id = getString(payload, "offerId");
  return id ? `offer:${id}` : null;
}

function noAggregation(): string | null {
  return null;
}

function getFollowerObject(payload: Record<string, unknown>) {
  const id = getString(payload, "followerId") ?? getString(payload, "actorUserId");
  if (!id) return undefined;
  return {
    type: "poster" as const,
    id,
    label: getString(payload, "followerUsername") ?? undefined,
    imageUrl: undefined,
  };
}

function getSupportCaseObject(payload: Record<string, unknown>) {
  // A support case surfaces through its conversation thread when one is
  // linked; otherwise the case id stands alone (no dedicated object type).
  const conversationId = getString(payload, "conversationId");
  if (conversationId) {
    return { type: "conversation" as const, id: conversationId, label: undefined, imageUrl: undefined };
  }
  const caseId = getString(payload, "caseId");
  if (!caseId) return undefined;
  return { type: "conversation" as const, id: caseId, label: undefined, imageUrl: undefined };
}

// ── Event Registry ─────────────────────────────────────────────────────────

export const NOTIFICATION_EVENT_REGISTRY: Record<string, NotificationEventMetadata> = {
  // Order events
  order_created: {
    semanticRole: "commerce",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  order_paid: {
    semanticRole: "commerce",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  order_cancelled: {
    semanticRole: "commerce",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  order_dispatched: {
    semanticRole: "commerce",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  order_in_transit: {
    semanticRole: "commerce",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  order_out_for_delivery: {
    semanticRole: "commerce",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  order_delivered: {
    semanticRole: "commerce",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  order_refunded: {
    semanticRole: "financial",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  order_dispatch_sla_breach: {
    semanticRole: "commerce",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },

  // Resolution events
  resolution_opened: {
    semanticRole: "system",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: () => null,
    objectExtractor: getOrderObject,
  },
  resolution_status_changed: {
    semanticRole: "system",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: () => null,
    objectExtractor: getOrderObject,
  },

  // Review events
  review_received: {
    semanticRole: "social",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: listingAggregation,
    objectExtractor: getListingObject,
  },

  // Chat events
  chat_message: {
    semanticRole: "social",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "conversationId") ?? getString(payload, "chatId");
      return id ? `conversation:${id}` : null;
    },
    objectExtractor: getConversationObject,
  },

  // Payout/refund events
  payout_processed: {
    semanticRole: "financial",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: () => null,
    objectExtractor: getWalletObject,
  },
  refund_completed: {
    semanticRole: "financial",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },

  // Auction events
  auction_outbid: {
    semanticRole: "auction",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },
  auction_won: {
    semanticRole: "auction",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },
  auction_ending_soon: {
    semanticRole: "auction",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },
  // A new bid landed on the seller's auction. Informational for the seller —
  // previously emitted untyped ('generic'), which gated it under `news`.
  auction_bid: {
    semanticRole: "auction",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },
  // Seller cancelled the auction. Bidders cannot act on a dead auction — no
  // "Bid again" CTA, so requiresAction stays false.
  auction_cancelled: {
    semanticRole: "auction",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },
  // Auction ended below reserve (or with no bids): seller is told the item
  // did not sell, bidders are told it ended unsold.
  auction_reserve_not_met: {
    semanticRole: "auction",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },
  // Item has a buyer (winner or second-chance offer) whose payment window is
  // running. Seller-facing heartbeat — the buyer carries the action.
  auction_sold_awaiting_payment: {
    semanticRole: "auction",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },
  // The winner's payment window lapsed — a second-chance offer went out or
  // the listing was relisted. Seller-facing outcome, no action required.
  auction_payment_expired: {
    semanticRole: "auction",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },
  // Terminal seller-facing sale state (payment confirmed / Buy Now complete).
  auction_sold: {
    semanticRole: "auction",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: auctionAggregation,
    objectExtractor: getAuctionObject,
  },

  // Offer lifecycle — emitted by the domain outbox drain. The recipient of
  // offer_created / offer_countered must respond, so they require action.
  offer_created: {
    semanticRole: "commerce",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: offerAggregation,
    objectExtractor: getListingObject,
  },
  offer_countered: {
    semanticRole: "commerce",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: offerAggregation,
    objectExtractor: getListingObject,
  },
  offer_accepted: {
    semanticRole: "commerce",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: offerAggregation,
    objectExtractor: getListingObject,
  },
  offer_declined: {
    semanticRole: "commerce",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: offerAggregation,
    objectExtractor: getListingObject,
  },
  offer_expired: {
    semanticRole: "commerce",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: offerAggregation,
    objectExtractor: getListingObject,
  },
  offer_cancelled: {
    semanticRole: "commerce",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: offerAggregation,
    objectExtractor: getListingObject,
  },
  // A Smart Sell policy acted on the seller's behalf — the seller must be
  // told; `escalate` means a live offer needs their manual response.
  smart_sell_decision: {
    semanticRole: "commerce",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: offerAggregation,
    objectExtractor: getListingObject,
  },

  // Declared in the event-type list and push taxonomy but previously
  // unregistered — they fell back to generic semantics.
  price_drop: {
    semanticRole: "commerce",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: listingAggregation,
    objectExtractor: getListingObject,
  },
  new_follower: {
    semanticRole: "social",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: getFollowerObject,
  },

  // Checkout/payment outcome — the reservation was released after a failed
  // or cancelled payment.
  payment_failed: {
    semanticRole: "financial",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },

  // Dispatch extension lifecycle. `proposed` REQUIRES the buyer to accept or
  // decline — that is the whole point of the notification.
  dispatch_extension_proposed: {
    semanticRole: "commerce",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },
  dispatch_extension_responded: {
    semanticRole: "commerce",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: orderAggregation,
    objectExtractor: getOrderObject,
  },

  // Review lifecycle beyond review_received: seller responded to a review,
  // or a moderation action was taken on one.
  review_response_received: {
    semanticRole: "social",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: () => undefined,
  },
  review_moderated: {
    semanticRole: "system",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: () => undefined,
  },

  // Creator scheduled-publication outcomes.
  scheduled_publication_success: {
    semanticRole: "system",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: noAggregation,
    objectExtractor: () => undefined,
  },
  scheduled_publication_blocked: {
    semanticRole: "system",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: noAggregation,
    objectExtractor: () => undefined,
  },
  scheduled_publication_failed: {
    semanticRole: "system",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: noAggregation,
    objectExtractor: () => undefined,
  },

  // Operator support-case lifecycle — surfaced to the customer.
  "support.operator_reply": {
    semanticRole: "system",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "caseId");
      return id ? `support:${id}` : null;
    },
    objectExtractor: getSupportCaseObject,
  },
  "support.information_requested": {
    semanticRole: "system",
    attention: "action",
    requiresAction: true,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "caseId");
      return id ? `support:${id}` : null;
    },
    objectExtractor: getSupportCaseObject,
  },
  "support.case_resolved": {
    semanticRole: "system",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "caseId");
      return id ? `support:${id}` : null;
    },
    objectExtractor: getSupportCaseObject,
  },

  // Co-own buyout accepted — the bidder's offer was (partially) accepted.
  coown_buyout_accepted: {
    semanticRole: "financial",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "assetId");
      return id ? `coown:${id}` : null;
    },
    objectExtractor: () => undefined,
  },

  // Co-own price alert triggered — the user set a crossing threshold and the
  // asset's last settled trade crossed it. Actionable for the alert owner.
  coown_price_alert_triggered: {
    semanticRole: "financial",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "assetId");
      return id ? `coown_alert:${id}` : null;
    },
    objectExtractor: () => undefined,
  },

  // Co-own DRIP receipt — a settled distribution resolved to reinvested,
  // retained cash, or a failed reinvestment. Financial receipt the user is
  // owed regardless of outcome.
  coown_drip_receipt: {
    semanticRole: "financial",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "assetId");
      return id ? `coown_drip:${id}` : null;
    },
    objectExtractor: () => undefined,
  },

  // Co-own verification demand responded — the custodian submitted evidence
  // against a buyer's verification request. Informational for the buyer.
  coown_verification_responded: {
    semanticRole: "financial",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "demandId") ?? getString(payload, "assetId");
      return id ? `coown_demand:${id}` : null;
    },
    objectExtractor: () => undefined,
  },

  // Internal ops alert fanned out to admin recipients.
  ops_alert: {
    semanticRole: "system",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const code = getString(payload, "code");
      return code ? `ops:${code}` : null;
    },
    objectExtractor: () => undefined,
  },

  // Live shopping — a followed seller (or a session the user asked to be
  // reminded about) just went live. Social-role like
  // new_listing_from_followed_seller, but 'important' attention because a
  // live show is ephemeral — 'info' would undersell a time-boxed event.
  // Aggregation keys on the session so repeated starts collapse into one row.
  live_started: {
    semanticRole: "social",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: liveSessionAggregation,
    objectExtractor: getLiveSessionObject,
  },

  // Dormant social events — declared in the index.ts event-type list and the
  // push-category mappers, but previously unregistered here (they fell back
  // to generic). Registered now so the V2 semantic contract matches the push
  // taxonomy.
  new_listing_from_followed_seller: {
    semanticRole: "social",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: listingAggregation,
    objectExtractor: getListingObject,
  },
  saved_search_match: {
    semanticRole: "commerce",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: listingAggregation,
    objectExtractor: getListingObject,
  },

  // Generic fallback
  generic: {
    semanticRole: "system",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: () => null,
    objectExtractor: () => undefined,
  },

  // Safety outcome — moderator has reviewed a user's report and recorded a
  // decision. No object reference (the report itself is the context).
  safety_outcome: {
    semanticRole: "system",
    attention: "important",
    requiresAction: false,
    aggregationTemplate: (payload) => {
      const id = getString(payload, "caseId");
      return id ? `safety:${id}` : null;
    },
    objectExtractor: () => undefined,
  },
};

const DEFAULT_METADATA = NOTIFICATION_EVENT_REGISTRY.generic;

/**
 * Server-side mirror of the frontend `FILTER_EVENT_TYPES` mapping
 * (frontend/src/components/notifications/notificationViewModels.ts).
 *
 * Drives the `filterCounts` payload on GET /notifications/events: a tab's
 * badge count must cover exactly the event types the corresponding
 * `eventType` filter would list, or badge and filtered list disagree.
 *
 * 'all' and 'unread' are handled structurally (total count / read_at IS
 * NULL), so only the type-bucketed filters appear here. Keep this in sync
 * with the frontend constant — drift shows up as badge counts that do not
 * match the filtered list.
 */
export const NOTIFICATION_FILTER_EVENT_TYPES: Record<
  string,
  readonly string[]
> = {
  order: [
    "order_created",
    "order_paid",
    "order_cancelled",
    "order_dispatched",
    "order_in_transit",
    "order_out_for_delivery",
    "order_delivered",
    "order_refunded",
    "order_dispatch_sla_breach",
    "payout_processed",
    "refund_completed",
    "payment_failed",
    "dispatch_extension_proposed",
    "dispatch_extension_responded",
    "offer_created",
    "offer_countered",
    "offer_accepted",
    "offer_declined",
    "offer_expired",
    "offer_cancelled",
    "smart_sell_decision",
  ],
  new_item: [
    "new_listing_from_followed_seller",
    "saved_search_match",
    "live_started",
  ],
  review: ["review_received", "review_response_received", "review_moderated"],
  price: ["price_drop"],
  auction: [
    "auction_outbid",
    "auction_won",
    "auction_ending_soon",
    "auction_bid",
    "auction_cancelled",
    "auction_reserve_not_met",
    "auction_sold_awaiting_payment",
    "auction_payment_expired",
    "auction_sold",
  ],
};

/**
 * Resolve notification event metadata from the event type.
 * Falls back to generic for unknown event types.
 */
export function resolveNotificationEventMetadata(
  eventType: string,
): NotificationEventMetadata {
  return NOTIFICATION_EVENT_REGISTRY[eventType] ?? DEFAULT_METADATA;
}

/**
 * Upgrade a notification event with V2 semantic fields.
 * Called by the GET /notifications/events endpoint to include
 * structured metadata in the response.
 */
export function upgradeNotificationEventV2<
  T extends { eventType: string; payload?: Record<string, unknown> | null },
>(event: T): T & {
  semanticRole: NotificationSemanticRole;
  attention: NotificationAttentionLevel;
  requiresAction: boolean;
  aggregationKey: string | null;
  objectRef: ReturnType<NotificationEventMetadata["objectExtractor"]>;
} {
  const metadata = resolveNotificationEventMetadata(event.eventType);
  const payload = event.payload ?? {};
  return {
    ...event,
    semanticRole: metadata.semanticRole,
    attention: metadata.attention,
    requiresAction: metadata.requiresAction,
    aggregationKey: metadata.aggregationTemplate(payload),
    objectRef: metadata.objectExtractor(payload),
  };
}
