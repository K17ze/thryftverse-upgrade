import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { appendDomainEvent } from './domainOutbox.js';

const OFFER_CHECKOUT_RESERVATION_MINUTES = 30;
const CHECKOUT_QUOTE_VERSION = 'commerce-gbp-2026-07-28.1';

export type OfferAcceptanceResult = {
  orderId: string;
  reservationId: string;
  reservationExpiresAt: string;
  subtotalGbp: number;
  platformChargeGbp: number;
  totalGbp: number;
  quoteHash: string;
};

/**
 * Executes the accept transition for a locked `pending` listing offer inside
 * the caller's transaction: creates the order + checkout reservation, flips
 * the offer to `accepted`, declines sibling pending offers (each with its own
 * domain event), pauses the listing, and appends the `offer.accepted` +
 * order_events rows.
 *
 * Shared by POST /offers/:offerId/accept (routes/listingOffers.ts) and the
 * Smart Sell evaluate path (routes/smartSellPolicy.ts) — a Smart Sell
 * `accept` decision must perform the same durable transition, not just stamp
 * metadata. The caller owns BEGIN/COMMIT, the offer/listing row locks, the
 * participant + status guards, and post-commit effects
 * (emitOrderCommerceCard, enqueueOutboxDrain).
 */
export async function executeOfferAcceptance(
  client: PoolClient,
  params: {
    offerId: string;
    listingId: string;
    buyerId: string;
    sellerId: string;
    offerPriceGbp: number;
    actorUserId: string;
    correlationId?: string;
    calculatePlatformChargeGbp: (subtotalGbp: number) => number;
  },
): Promise<OfferAcceptanceResult> {
  const subtotalGbp = params.offerPriceGbp;
  const platformChargeGbp = params.calculatePlatformChargeGbp(subtotalGbp);
  const totalGbp = Number((subtotalGbp + platformChargeGbp).toFixed(2));
  const orderId = `ord_offer_${crypto.randomUUID()}`;
  const reservationId = `lres_${crypto.randomUUID()}`;
  const reservationExpiresAt = new Date(
    Date.now() + OFFER_CHECKOUT_RESERVATION_MINUTES * 60_000,
  ).toISOString();
  const quoteSnapshot = {
    source: 'accepted_offer',
    offerId: params.offerId,
    listingId: params.listingId,
    subtotalGbp,
    platformChargeGbp,
    postageFeeGbp: 0,
    totalGbp,
    currency: 'GBP',
    expiresAt: reservationExpiresAt,
    policyVersion: CHECKOUT_QUOTE_VERSION,
  };
  const quoteHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(quoteSnapshot))
    .digest('hex');

  await client.query(
    `INSERT INTO orders (
       id, buyer_id, seller_id, listing_id,
       subtotal_gbp, buyer_protection_fee_gbp,
       postage_fee_gbp, total_gbp, status,
       checkout_expires_at, quote_version, quote_hash, quote_snapshot
     )
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'created', $8, $9, $10, $11::jsonb)`,
    [
      orderId,
      params.buyerId,
      params.sellerId,
      params.listingId,
      subtotalGbp,
      platformChargeGbp,
      totalGbp,
      reservationExpiresAt,
      CHECKOUT_QUOTE_VERSION,
      quoteHash,
      JSON.stringify(quoteSnapshot),
    ],
  );

  await client.query(
    `INSERT INTO listing_checkout_reservations (
       id, offer_id, listing_id, buyer_id, seller_id,
       order_id, source, status, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'offer', 'active', $7)`,
    [
      reservationId,
      params.offerId,
      params.listingId,
      params.buyerId,
      params.sellerId,
      orderId,
      reservationExpiresAt,
    ],
  );

  await client.query(
    `UPDATE listing_offers
     SET status = 'accepted',
         accepted_at = NOW(),
         order_id = $2,
         reservation_id = $3,
         metadata = COALESCE(metadata, '{}'::jsonb)
           || '{"checkoutStatus":"accepted_pending_checkout"}'::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [params.offerId, orderId, reservationId],
  );
  // Decline other pending offers on the same listing — once one is accepted
  // the rest are moot.
  const siblingResult = await client.query<{
    id: string;
    buyer_id: string;
    offer_price_gbp: string;
    conversation_id: string | null;
    offered_by_user_id: string | null;
  }>(
    `UPDATE listing_offers
     SET status = 'declined', declined_at = NOW(), updated_at = NOW()
     WHERE listing_id = $2
       AND id <> $1 AND status = 'pending'
     RETURNING id, buyer_id, offer_price_gbp::text, conversation_id,
               offered_by_user_id`,
    [params.offerId, params.listingId],
  );
  await client.query(
    `UPDATE listings
     SET status = 'paused', pause_source = 'checkout_reservation', updated_at = NOW()
     WHERE id = $1`,
    [params.listingId],
  );
  const acceptedEventId = await appendDomainEvent(client, {
    aggregateType: 'offer',
    aggregateId: params.offerId,
    eventType: 'offer.accepted',
    actorId: params.actorUserId,
    correlationId: params.correlationId,
    idempotencyKey: params.offerId,
    deduplicationKey: `offer.accepted:${params.offerId}`,
    payload: {
      offerId: params.offerId,
      listingId: params.listingId,
      orderId,
      reservationId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      subtotalGbp,
      platformChargeGbp,
      totalGbp,
      reservationExpiresAt,
    },
  });
  // First-accept-wins: every sibling declined as a side effect gets its own
  // domain event so the losing buyers are notified.
  for (const sibling of siblingResult.rows) {
    await appendDomainEvent(client, {
      aggregateType: 'offer',
      aggregateId: sibling.id,
      eventType: 'offer.sibling_declined',
      actorId: params.actorUserId,
      correlationId: params.correlationId,
      causationId: acceptedEventId,
      deduplicationKey: `offer.sibling_declined:${sibling.id}`,
      payload: {
        offerId: sibling.id,
        listingId: params.listingId,
        buyerId: sibling.buyer_id,
        sellerId: params.sellerId,
        offerPriceGbp: Number(sibling.offer_price_gbp),
        conversationId: sibling.conversation_id,
        offeredByUserId: sibling.offered_by_user_id ?? sibling.buyer_id,
        acceptedOfferId: params.offerId,
        orderId,
      },
    });
  }
  await client.query(
    `INSERT INTO order_events (
       order_id, event_type, actor_id, source, deduplication_key, metadata
     )
     VALUES
       ($1, 'order.created', $2, 'accepted_offer', $3, $4::jsonb),
       ($1, 'payment.required', $2, 'accepted_offer', $5, $6::jsonb)
     ON CONFLICT (order_id, deduplication_key)
       WHERE deduplication_key IS NOT NULL
     DO NOTHING`,
    [
      orderId,
      params.actorUserId,
      `order.created:${orderId}`,
      JSON.stringify({ offerId: params.offerId, reservationId, quoteHash }),
      `payment.required:${orderId}`,
      JSON.stringify({ expiresAt: reservationExpiresAt, totalGbp }),
    ],
  );

  return {
    orderId,
    reservationId,
    reservationExpiresAt,
    subtotalGbp,
    platformChargeGbp,
    totalGbp,
    quoteHash,
  };
}
