/**
 * Domain outbox drain handler.
 *
 * Extracted verbatim from `src/index.ts` (`processDomainOutboxBatch` and its
 * internal `processDomainOutboxEvent`). Claims a batch of pending domain
 * outbox events and delivers them (notifications + realtime fan-out).
 */
import { z } from 'zod';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { publishRealtimeEvent } from '../../lib/realtime.js';
import {
  type DomainOutboxEvent,
  claimDomainOutboxBatch,
  completeDomainOutboxEvent,
  failDomainOutboxEvent,
} from '../../lib/domainOutbox.js';
import { evaluatePriceAlertsForListing } from '../../routes/priceAlerts.js';
import { formatGbpAmount } from '../../lib/workerHelpers.js';
import { queueUserNotification } from '../../lib/workerRuntime.js';

export type OutboxDrainHandlerDeps = {
  /** Uses shared db singleton + worker runtime helpers. */
};

async function processDomainOutboxEvent(event: DomainOutboxEvent): Promise<void> {
  if (event.eventType === 'listing.price_changed') {
    const payload = z.object({
      listingId: z.string().min(2),
      priceEventId: z.number().int().positive(),
      previousPriceGbp: z.number().nonnegative(),
      newPriceGbp: z.number().nonnegative(),
    }).parse(event.payload);
    await evaluatePriceAlertsForListing({
      db,
      listingId: payload.listingId,
      priceEventId: payload.priceEventId,
      previousPriceGbp: payload.previousPriceGbp,
      newPriceGbp: payload.newPriceGbp,
      queueNotification: queueUserNotification,
    });
    return;
  }

  if (event.eventType === 'offer.accepted') {
    const payload = z.object({
      offerId: z.string().min(2),
      listingId: z.string().min(2),
      orderId: z.string().min(2),
      reservationId: z.string().min(2),
      buyerId: z.string().min(2),
      sellerId: z.string().min(2),
      subtotalGbp: z.number().positive(),
      platformChargeGbp: z.number().nonnegative(),
      totalGbp: z.number().positive(),
      reservationExpiresAt: z.string().datetime(),
    }).parse(event.payload);

    await queueUserNotification({
      userId: payload.buyerId,
      title: 'Offer accepted',
      body: 'Your offer was accepted. Complete checkout before the reservation expires.',
      eventType: 'offer_accepted',
      payload: {
        event: 'offer_accepted',
        offerId: payload.offerId,
        listingId: payload.listingId,
        orderId: payload.orderId,
        reservationId: payload.reservationId,
        expiresAt: payload.reservationExpiresAt,
      },
      route: { screen: 'OrderDetail', params: { orderId: payload.orderId } },
      idempotencyKey: `offer_accepted_buyer_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    await queueUserNotification({
      userId: payload.sellerId,
      title: 'Offer accepted',
      body: 'The item is reserved while the buyer completes checkout.',
      eventType: 'offer_accepted',
      payload: {
        event: 'offer_accepted',
        offerId: payload.offerId,
        listingId: payload.listingId,
        orderId: payload.orderId,
        reservationId: payload.reservationId,
        expiresAt: payload.reservationExpiresAt,
      },
      route: { screen: 'OrderDetail', params: { orderId: payload.orderId } },
      idempotencyKey: `offer_accepted_seller_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    publishRealtimeEvent({
      topic: `listing:${payload.listingId}`,
      type: 'offer.accepted',
      payload: {
        offerId: payload.offerId,
        listingId: payload.listingId,
        orderId: payload.orderId,
        reservationId: payload.reservationId,
        reservationExpiresAt: payload.reservationExpiresAt,
      },
    });
    return;
  }

  if (event.eventType === 'offer.countered') {
    const payload = z.object({
      offerId: z.string().min(2),
      parentOfferId: z.string().min(2),
      listingId: z.string().min(2),
      buyerId: z.string().min(2),
      sellerId: z.string().min(2),
      offeredByUserId: z.string().min(2),
      counterRound: z.number().int().positive(),
      offerPriceGbp: z.number().positive(),
      expiresAt: z.string().datetime(),
    }).parse(event.payload);
    const recipientId = payload.offeredByUserId === payload.buyerId
      ? payload.sellerId
      : payload.buyerId;
    await queueUserNotification({
      userId: recipientId,
      title: 'New counter-offer',
      body: `${formatGbpAmount(payload.offerPriceGbp)} · round ${payload.counterRound}`,
      eventType: 'offer_countered',
      payload: {
        event: 'offer_countered',
        offerId: payload.offerId,
        parentOfferId: payload.parentOfferId,
        listingId: payload.listingId,
        expiresAt: payload.expiresAt,
      },
      route: { screen: 'ItemDetail', params: { itemId: payload.listingId } },
      idempotencyKey: `offer_countered_${payload.offerId}_${recipientId}`,
      metadata: { outboxEventId: event.id },
    });
    publishRealtimeEvent({
      topic: `listing:${payload.listingId}`,
      type: 'offer.countered',
      payload,
    });
    return;
  }

  if (event.eventType === 'order.created') {
    const payload = z.object({
      orderId: z.string().min(2),
      listingId: z.string().min(2),
      reservationId: z.string().min(2),
      buyerId: z.string().min(2),
      sellerId: z.string().min(2),
      source: z.literal('direct'),
      expiresAt: z.string().datetime(),
      totalGbp: z.number().positive(),
    }).parse(event.payload);
    await queueUserNotification({
      userId: payload.sellerId,
      title: 'Item reserved',
      body: 'A buyer has started checkout. The listing is temporarily reserved.',
      eventType: 'order_created',
      payload: {
        event: 'order_created',
        orderId: payload.orderId,
        listingId: payload.listingId,
        reservationId: payload.reservationId,
        expiresAt: payload.expiresAt,
      },
      route: { screen: 'OrderDetail', params: { orderId: payload.orderId } },
      idempotencyKey: `order_created_seller_${payload.orderId}`,
      metadata: { outboxEventId: event.id },
    });
    publishRealtimeEvent({
      topic: `listing:${payload.listingId}`,
      type: 'listing.reserved',
      payload: {
        orderId: payload.orderId,
        listingId: payload.listingId,
        reservationId: payload.reservationId,
        expiresAt: payload.expiresAt,
      },
    });
    return;
  }

  if (event.eventType === 'payment.failed') {
    const payload = z.object({
      intentId: z.string().min(2),
      orderId: z.string().min(2),
      buyerId: z.string().min(2),
      status: z.enum(['failed', 'cancelled']),
      failureCode: z.string().nullable().optional(),
    }).parse(event.payload);
    await queueUserNotification({
      userId: payload.buyerId,
      title: payload.status === 'failed' ? 'Payment failed' : 'Payment cancelled',
      body: 'The reservation was released and no completed payment was recorded. A temporary bank authorization may still take time to disappear.',
      eventType: 'payment_failed',
      payload: {
        event: 'payment_failed',
        intentId: payload.intentId,
        orderId: payload.orderId,
        status: payload.status,
        failureCode: payload.failureCode ?? null,
      },
      route: { screen: 'OrderDetail', params: { orderId: payload.orderId } },
      idempotencyKey: `payment_failed_${payload.intentId}`,
      metadata: { outboxEventId: event.id },
    });
    return;
  }

  if (event.eventType === 'content.published') {
    const payload = z.object({
      documentId: z.string().min(2),
      revisionId: z.string().min(2),
      revisionNumber: z.number().int().positive(),
      creatorId: z.string().min(2),
      contentType: z.enum(['look', 'poster', 'story']),
      publishedAt: z.string().datetime(),
    }).parse(event.payload);

    // Content publishes are lifecycle events, not engagement metrics.
    // A publish is not a view/like/save — recording it as an analytics event
    // would inflate engagement counts. The publish itself is tracked via the
    // content tables and the outbox; no analytics event is inserted here.
    logger.info(
      {
        documentId: payload.documentId,
        revisionId: payload.revisionId,
        revisionNumber: payload.revisionNumber,
        creatorId: payload.creatorId,
        contentType: payload.contentType,
        publishedAt: payload.publishedAt,
        outboxEventId: event.id,
      },
      'Content published — no analytics event recorded (lifecycle, not engagement)',
    );
    return;
  }

  if (event.eventType === 'order.fulfilled') {
    const payload = z.object({
      orderId: z.string().min(2),
      sellerId: z.string().min(2),
      listingId: z.string().min(2),
      subtotalGbp: z.number().nonnegative(),
      deliveredAt: z.string().datetime(),
    }).parse(event.payload);

    // Resolve the listing's seller as the creator (not all sellers are
    // creators). The commission and earning entry must be attributed to the
    // actual content owner, not whoever fulfilled the order.
    const listingResult = await db.query<{ seller_id: string }>(
      `SELECT seller_id FROM listings WHERE id = $1 LIMIT 1`,
      [payload.listingId],
    );
    const creatorId = listingResult.rows[0]?.seller_id ?? payload.sellerId;

    // Create an immutable 'earned' entry in the creator earnings ledger.
    // The commission rate is resolved from the active commission_agreements
    // row at fulfillment time. If no agreement exists, the default 10% rate
    // is used (matching the commission_agreements default).
    //
    // The entry starts as 'pending' and becomes 'available' after the
    // buyer-protection window (30 days from delivery). The balance is
    // always a projection over ledger entries — never a mutable total.
    const agreementResult = await db.query<{ id: string; rate: string }>(
      `SELECT id, rate::text FROM commission_agreements
       WHERE creator_id = $1
         AND effective_from <= $2
         AND (effective_to IS NULL OR effective_to > $2)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [creatorId, payload.deliveredAt],
    );

    const rate = agreementResult.rows[0]
      ? parseFloat(agreementResult.rows[0].rate)
      : 0.10;
    const agreementVersion = agreementResult.rows[0]?.id ?? 'default-v1';

    // Amount in minor units (pence). Commission is on gross sale.
    // Use integer-safe math: convert to minor units first, then apply the
    // rate, to avoid floating-point rounding errors on monetary values.
    const subtotalMinor = Math.round(payload.subtotalGbp * 100);
    const amountMinor = Math.round(subtotalMinor * rate);

    const entryId = `ern_${payload.orderId}_${creatorId}`;
    const availableAt = new Date(payload.deliveredAt);
    availableAt.setDate(availableAt.getDate() + 30);

    // ── Attribution: last-touch model ──────────────────────────────
    // Find the most recent content engagement touchpoint for this viewer
    // before the order was placed. This is a simple last-touch attribution:
    // the last content the viewer interacted with before purchasing gets
    // 100% of the credit. Multi-touch and data-driven models can be added
    // later by inserting multiple attribution_decisions with fractional
    // credit_ratio values.
    //
    // We look for view/like/save events in the 24h before the order that
    // reference content by this creator. The touchpoint is recorded in
    // attribution_touchpoints, and an attribution_decision links the
    // earning entry to the touchpoint.
    const attributionWindowStart = new Date(payload.deliveredAt);
    attributionWindowStart.setHours(attributionWindowStart.getHours() - 24);

    const touchpointResult = await db.query<{
      id: string;
      content_id: string;
      content_type: string;
      occurred_at: Date;
    }>(
      `SELECT id, content_id, content_type, occurred_at
       FROM creator_analytics_events_v2
       WHERE creator_id = $1
         AND event_type IN ('view', 'like', 'save', 'product_click')
         AND occurred_at >= $2
         AND occurred_at < $3
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [creatorId, attributionWindowStart.toISOString(), payload.deliveredAt],
    );

    let attributionDecisionId: string | null = null;
    const touchpoint = touchpointResult.rows[0];
    if (touchpoint) {
      // Record the touchpoint in the attribution table
      const touchpointId = `tp_${payload.orderId}_${creatorId}`;
      await db.query(
        `INSERT INTO attribution_touchpoints (
            id, viewer_key, session_id, creator_id, content_id, content_type,
            listing_id, surface, occurred_at
          )
          VALUES ($1, $2, NULL, $3, $4, $5, $6, NULL, $7)
          ON CONFLICT (id) DO NOTHING`,
        [
          touchpointId,
          `order_${payload.orderId}`,
          creatorId,
          touchpoint.content_id,
          touchpoint.content_type,
          payload.listingId,
          touchpoint.occurred_at,
        ],
      );

      // Create the attribution decision — last-touch, 100% credit
      attributionDecisionId = `attr_${payload.orderId}_${creatorId}`;
      await db.query(
        `INSERT INTO attribution_decisions (
            id, order_item_id, model_version, creator_id,
            touchpoint_id, credit_ratio, decided_at
          )
          VALUES ($1, $2, $3, $4, $5, 1.0, NOW())
          ON CONFLICT (id) DO NOTHING`,
        [
          attributionDecisionId,
          payload.orderId,
          'last-touch-v1',
          creatorId,
          touchpointId,
        ],
      );
    }

    await db.query(
      `INSERT INTO creator_earning_entries (
         id, creator_id, order_item_id, attribution_decision_id,
         agreement_version, entry_type, amount_minor, currency,
         status, available_at, related_order_id, description
       )
       VALUES ($1, $2, NULL, $3, $4, 'earned', $5, 'GBP',
               'pending', $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        entryId,
        creatorId,
        attributionDecisionId,
        agreementVersion,
        amountMinor,
        availableAt.toISOString(),
        payload.orderId,
        `Commission on order ${payload.orderId}`,
      ],
    );
    return;
  }

  if (event.eventType === 'order.refunded') {
    const payload = z.object({
      orderId: z.string().min(2),
      sellerId: z.string().min(2),
      listingId: z.string().min(2),
      refundAmountGbp: z.number().nonnegative(),
      refundedAt: z.string().datetime(),
    }).parse(event.payload);

    // Reverse the original earned entry with a refund_reversal entry.
    // The reversal copies attribution fields from the original earned entry
    // so the ledger remains self-describing and auditable.
    const originalEntryId = `ern_${payload.orderId}_${payload.sellerId}`;
    const reversalId = `rev_${payload.orderId}_${payload.sellerId}`;
    const refundMinor = Math.round(payload.refundAmountGbp * 100);

    await db.query(
      `INSERT INTO creator_earning_entries (
         id, creator_id, agreement_version, entry_type, amount_minor,
         currency, status, reversed_entry_id, related_order_id, description, created_at
       )
       SELECT $1, creator_id, agreement_version, 'refund_reversal', $2,
              currency, 'reversed', id, related_order_id, $3, $4
       FROM creator_earning_entries WHERE id = $5
       ON CONFLICT (id) DO NOTHING`,
      [reversalId, -refundMinor, `Refund reversal for order ${payload.orderId}`,
       payload.refundedAt, originalEntryId],
    );

    // Mark the original entry as reversed.
    await db.query(
      `UPDATE creator_earning_entries SET status = 'reversed' WHERE id = $1`,
      [originalEntryId],
    );
    return;
  }

  throw new Error(`Unsupported domain outbox event: ${event.eventType}`);
}

export async function processDomainOutboxBatch(): Promise<number> {
  const events = await claimDomainOutboxBatch(db, 50);
  for (const event of events) {
    try {
      await processDomainOutboxEvent(event);
      await completeDomainOutboxEvent(db, event.id);
    } catch (error) {
      await failDomainOutboxEvent(db, event.id, error);
      logger.error(
        { err: error, outboxEventId: event.id, eventType: event.eventType },
        'Domain outbox delivery failed',
      );
    }
  }
  return events.length;
}
