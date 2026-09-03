/**
 * Marketplace Conversation OS — Offer State Machine
 *
 * Every negotiation is a typed state machine with explicit transitions.
 * The server enforces valid transitions; the client reads and responds.
 *
 * States:
 *   PENDING → COUNTERED | ACCEPTED | REJECTED | EXPIRED | WITHDRAWN
 *   COUNTERED → PENDING (new bid) | ACCEPTED | REJECTED | EXPIRED | WITHDRAWN
 *   ACCEPTED → (terminal — proceeds to checkout)
 *   REJECTED → (terminal)
 *   EXPIRED → (terminal — timeout)
 *   WITHDRAWN → (terminal — buyer/seller cancelled)
 *
 * Thread alternates ownership until one party accepts, rejects, or the
 * offer expires. The current offer is the latest non-terminal entry in
 * the thread; the party that did NOT make it holds the next move.
 */

export type OfferStatus =
  | 'pending'
  | 'countered'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export type OfferParty = 'buyer' | 'seller';

export interface Offer {
  id: string;
  listingId: string;
  conversationId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: OfferStatus;
  /** Who made this offer (or counter). */
  party: OfferParty;
  message?: string;
  createdAt: string;
  /** ISO timestamp — the server sets this; the client counts down to it. */
  expiresAt: string;
  /** Previous offer ID when this entry is a counter. */
  counteredFrom?: string;
  /** Payment/shipping context — populated by the server on accept. */
  paymentMethod?: string;
  shippingAddress?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  expiredAt?: string;
  withdrawnAt?: string;
}

/** Milliseconds until expiry; clamped at 0. */
export function timeUntilExpiry(offer: Offer): number {
  return Math.max(0, new Date(offer.expiresAt).getTime() - Date.now());
}

export interface OfferAction {
  type: 'accept' | 'counter' | 'reject' | 'withdraw';
  label: string;
}

/**
 * Quick actions available for a given offer, based on the current
 * status and which party the current user is. The non-owning party
 * (the one being asked) gets accept/counter/decline; the owning party
 * can only withdraw their own pending/countered offer.
 */
export function getQuickActions(
  offer: Offer,
  currentUserId: string,
): OfferAction[] {
  const isBuyer = currentUserId === offer.buyerId;
  const isSeller = currentUserId === offer.sellerId;
  const actions: OfferAction[] = [];

  if (offer.status === 'pending') {
    if (isSeller) {
      actions.push({ type: 'accept', label: 'Accept offer' });
      actions.push({ type: 'counter', label: 'Counter' });
      actions.push({ type: 'reject', label: 'Decline' });
    } else if (isBuyer) {
      actions.push({ type: 'withdraw', label: 'Withdraw offer' });
    }
  } else if (offer.status === 'countered') {
    if (isBuyer) {
      actions.push({ type: 'accept', label: 'Accept counter' });
      actions.push({ type: 'counter', label: 'Counter' });
      actions.push({ type: 'reject', label: 'Decline' });
    } else if (isSeller) {
      actions.push({ type: 'withdraw', label: 'Withdraw counter' });
    }
  }

  return actions;
}
