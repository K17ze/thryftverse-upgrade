import type { Conversation, ConversationContext } from '../domain';

export type ConversationRole = 'buying' | 'selling' | 'group' | 'general';

/** Visual tone for a commerce status badge, mapped from offer/order state. */
export type CommerceStatusTone = 'brand' | 'success' | 'warning' | 'neutral';

export interface ConversationClassification {
  role: ConversationRole;
  isBuying: boolean;
  isSelling: boolean;
  isGroup: boolean;
  isMarketplace: boolean;
  counterpartyId: string | null;
  itemContextId: string | null;
  /** Server-projected commerce context — present when the conversation has
   *  an authoritative listing/offer/order projection. */
  hasContext: boolean;
  hasOffer: boolean;
  hasOrder: boolean;
  offerStatus?: ConversationContext['offer'] extends infer T ? T extends { status: infer S } ? S : never : never;
  orderStatus?: ConversationContext['order'] extends infer T ? T extends { status: infer S } ? S : never : never;
  /** Listing image URL from the server projection, if available. */
  listingImageUrl?: string;
}

/**
 * Classify a conversation into a typed role based on the current user's
 * relationship to the item being discussed.
 *
 * Server-authoritative path (preferred): when `conversation.context` is
 * present, classification follows the server projection:
 *   - `context.listing` → marketplace conversation; role derived from the
 *     current user's relationship to the seller/owner.
 *   - `context.offer` → commerce conversation with an active offer.
 *   - `context.order` → commerce conversation with an order lifecycle.
 *
 * Client fallback: when no `context` is present, classification falls back
 * to the legacy heuristic based on `itemId` / `sellerId` / `ownerId`. This
 * keeps older conversations readable until the backend backfills context.
 */
export function classifyConversation(
  conversation: Conversation,
  currentUserId?: string
): ConversationClassification {
  const isGroup = conversation.type === 'group';

  const counterpartyId =
    conversation.participantIds?.find(
      (id) => id !== 'me' && id !== currentUserId
    ) ?? null;

  const itemContextId = conversation.itemId ?? conversation.context?.listing?.id ?? null;
  const ctx = conversation.context;
  const hasContext = !!ctx;
  const hasOffer = !!ctx?.offer;
  const hasOrder = !!ctx?.order;
  const offerStatus = ctx?.offer?.status;
  const orderStatus = ctx?.order?.status;
  const listingImageUrl = ctx?.listing?.imageUrl;

  if (isGroup) {
    return {
      role: 'group',
      isBuying: false,
      isSelling: false,
      isGroup: true,
      isMarketplace: false,
      counterpartyId,
      itemContextId,
      hasContext,
      hasOffer,
      hasOrder,
      offerStatus,
      orderStatus,
      listingImageUrl,
    };
  }

  // Server-authoritative marketplace signal: context.listing present.
  const isMarketplace = !!ctx?.listing || !!conversation.itemId;

  if (!isMarketplace) {
    return {
      role: 'general',
      isBuying: false,
      isSelling: false,
      isGroup: false,
      isMarketplace: false,
      counterpartyId,
      itemContextId,
      hasContext,
      hasOffer,
      hasOrder,
      offerStatus,
      orderStatus,
      listingImageUrl,
    };
  }

  // Marketplace conversation — determine if user is buyer or seller.
  // Prefer the server projection's listing owner when available; fall back
  // to the legacy sellerId/ownerId fields on the conversation.
  const sellerId = conversation.sellerId ?? conversation.ownerId;
  const isSelling = sellerId === currentUserId || sellerId === 'me';
  const isBuying = !isSelling;

  return {
    role: isSelling ? 'selling' : 'buying',
    isBuying,
    isSelling,
    isGroup: false,
    isMarketplace: true,
    counterpartyId,
    itemContextId,
    hasContext,
    hasOffer,
    hasOrder,
    offerStatus,
    orderStatus,
    listingImageUrl,
  };
}

/**
 * Get a human-readable label for a conversation role.
 */
export function getRoleLabel(role: ConversationRole): string {
  switch (role) {
    case 'buying':
      return 'Buying';
    case 'selling':
      return 'Selling';
    case 'group':
      return 'Group';
    case 'general':
      return 'Direct';
  }
}

/**
 * Derive a compact commerce status label and tone for an inbox row badge.
 * Returns null when there is no active offer/order worth surfacing.
 *
 * Priority: order lifecycle > offer lifecycle. This keeps the most
 * operationally relevant state visible (a paid order matters more than a
 * pending offer on the same item).
 */
export function getCommerceStatus(
  conversation: Conversation
): { label: string; tone: CommerceStatusTone } | null {
  const ctx = conversation.context;
  if (!ctx) return null;

  if (ctx.order) {
    switch (ctx.order.status) {
      case 'pending':
        return { label: 'Order pending', tone: 'neutral' };
      case 'paid':
        return { label: 'Paid', tone: 'brand' };
      case 'shipped':
        return { label: 'Shipped', tone: 'brand' };
      case 'delivered':
        return { label: 'Delivered', tone: 'success' };
      case 'completed':
        return { label: 'Completed', tone: 'success' };
      case 'cancelled':
        return { label: 'Cancelled', tone: 'neutral' };
      case 'refunded':
        return { label: 'Refunded', tone: 'neutral' };
    }
  }

  if (ctx.offer) {
    switch (ctx.offer.status) {
      case 'pending':
        return { label: 'Offer pending', tone: 'warning' };
      case 'countered':
        return { label: 'Counter sent', tone: 'warning' };
      case 'accepted':
        return { label: 'Offer accepted', tone: 'success' };
      case 'rejected':
      case 'expired':
      case 'withdrawn':
        return null;
    }
  }

  return null;
}

/**
 * Seller operational filter: conversations where the buyer has sent a
 * message the seller hasn't read yet (needs a response).
 */
export function needsResponse(
  conversation: Conversation,
  currentUserId?: string
): boolean {
  const classification = classifyConversation(conversation, currentUserId);
  if (!classification.isSelling) return false;
  return Boolean(conversation.unread);
}

/**
 * Seller operational filter: conversations with an active (pending or
 * countered) offer.
 */
export function hasActiveOffer(conversation: Conversation): boolean {
  const status = conversation.context?.offer?.status;
  return status === 'pending' || status === 'countered';
}

/**
 * Seller operational filter: conversations with a paid order awaiting
 * shipment.
 */
export function needsShipment(
  conversation: Conversation,
  currentUserId?: string
): boolean {
  const classification = classifyConversation(conversation, currentUserId);
  if (!classification.isSelling) return false;
  return conversation.context?.order?.status === 'paid';
}
