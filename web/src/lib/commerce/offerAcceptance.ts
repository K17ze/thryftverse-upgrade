/**
 * Offer acceptance — the accept write that turns a standing offer into a
 * recorded order. Never returns a success the ledger can't prove:
 *
 *  - live:    POST /offers/:id/accept returns the accepted-offer payload
 *             (mobile listingOffersApi.AcceptListingOfferResult — the order
 *             id rides on checkout.orderId). No order id, no success.
 *  - fixture: mutates the session-local fixture stores the same way
 *             recordOrder/recordSentOffer do — the offer flips to
 *             'accepted' carrying its orderId, an order row lands in the
 *             commerce order list (/orders resolves it on invalidation),
 *             and the ledger breakdown records the AGREED offer price —
 *             not the listing ask.
 */

import { DATA_MODE } from '@/lib/api/client';
import { fetchJson } from '@/lib/api/http';
import {
  AUTHENTICATION_THRESHOLD_GBP,
  COMMERCE_ORDER_EXTRAS,
  ORDER_DETAILS,
  ORDER_ENRICHMENT,
  SHIPPING_FEE,
  protectionFeeFor,
  type CommerceOffer,
} from '@/lib/data/fixtures-commerce';
import { listingById } from '@/lib/data/fixtures';
import type { CommerceOrder } from '@/lib/contracts/domain';

/** Attached to the offer record on accept — CommerceOffer's fixture type
 *  predates the wire contract's orderId, so the field is attached
 *  structurally rather than by widening the shared interface. */
export type OfferWithOrder = CommerceOffer & { orderId?: string | null };

export function offerOrderId(offer: CommerceOffer): string | null {
  return (offer as OfferWithOrder).orderId ?? null;
}

interface AcceptOfferResponse {
  ok?: boolean;
  status?: string;
  orderId?: string;
  order?: { id?: string };
  id?: string;
  checkout?: { orderId?: string };
}

/**
 * Live accept — mirrors mobile acceptListingOfferOnApi: the accept POST
 * creates the order server-side; the response carries it on
 * checkout.orderId (with orderId/order.id fallbacks for tolerance).
 */
async function acceptOfferLive(offerId: string): Promise<{ orderId: string }> {
  const res = await fetchJson<AcceptOfferResponse>(
    `/offers/${encodeURIComponent(offerId)}/accept`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  const orderId = res.checkout?.orderId ?? res.orderId ?? res.order?.id ?? res.id;
  if (!orderId) throw new Error('Order not created');
  return { orderId };
}

/**
 * Fixture accept — appends the order the accept just created. Accepting
 * captures the buyer's already-authorised payment in both directions
 * (the offer grammar: "your payment method is only charged if they
 * accept"), so the order lands 'paid' and the item is off the shelf —
 * matching what the backend's accept → checkout → paid chain produces.
 */
function acceptOfferFixture(offer: CommerceOffer, _viewerId: string): { orderId: string } {
  const listing = listingById(offer.listingId);
  const itemPrice = offer.amount;
  const protectionFee = protectionFeeFor({ price: itemPrice });
  const shippingFee = listing?.shippingPayer === 'seller' ? 0 : SHIPPING_FEE;
  const order: CommerceOrder = {
    id: `ord-${Date.now()}`,
    listingId: offer.listingId,
    buyerId: offer.buyerId,
    sellerId: offer.sellerId,
    status: 'paid',
    totalPrice: Math.round((itemPrice + protectionFee + shippingFee) * 100) / 100,
    createdAt: new Date().toISOString(),
  };
  COMMERCE_ORDER_EXTRAS.push(order);
  ORDER_DETAILS[order.id] = {
    orderId: order.id,
    // Carrier/service stay unset until the seller actually picks one —
    // inventing a carrier here would print a fake fulfilment on the
    // order detail surface.
    carrier: null,
    service: null,
    itemPrice,
    protectionFee,
    shippingFee,
    timeline: [{ key: 'ordered', label: 'Order placed', at: order.createdAt }],
  };
  if (itemPrice >= AUTHENTICATION_THRESHOLD_GBP) {
    // The order qualifies for physical verification — mark it the same
    // way authored fixture orders do so the detail surface stays honest.
    ORDER_ENRICHMENT[order.id] = { verificationRequested: true };
    order.verificationRequested = true;
  }
  if (listing) {
    // Payment captured — the item is spoken for, like any paid order.
    listing.isSold = true;
    listing.status = 'sold';
  }
  offer.status = 'accepted';
  offer.updatedAt = new Date().toISOString();
  (offer as OfferWithOrder).orderId = order.id;
  return { orderId: order.id };
}

/**
 * Accept a standing offer. Resolves with the recorded order id — throws
 * (no silent success) when the mutation fails or returns no order.
 */
export async function acceptOffer(
  offer: CommerceOffer,
  viewerId: string,
): Promise<{ orderId: string }> {
  if (DATA_MODE === 'live') {
    return acceptOfferLive(offer.id);
  }
  // Fixture latency mirrors the commerce write the backend would own.
  await new Promise((r) => setTimeout(r, 400));
  return acceptOfferFixture(offer, viewerId);
}
