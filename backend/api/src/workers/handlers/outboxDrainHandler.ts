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
