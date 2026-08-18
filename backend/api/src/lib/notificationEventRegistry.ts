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
    type: "listing" | "order" | "auction" | "look" | "poster" | "conversation" | "wallet";
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

function auctionAggregation(payload: Record<string, unknown>): string | null {
  const id = getString(payload, "auctionId");
  return id ? `auction:${id}` : null;
}

function orderAggregation(payload: Record<string, unknown>): string | null {
  const id = getString(payload, "orderId");
  return id ? `order:${id}` : null;
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

  // Generic fallback
  generic: {
    semanticRole: "system",
    attention: "info",
    requiresAction: false,
    aggregationTemplate: () => null,
    objectExtractor: () => undefined,
  },
};

const DEFAULT_METADATA = NOTIFICATION_EVENT_REGISTRY.generic;

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
