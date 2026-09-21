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
  appendDomainEvent,
  claimDomainOutboxBatch,
  completeDomainOutboxEvent,
  failDomainOutboxEvent,
} from '../../lib/domainOutbox.js';
import { evaluatePriceAlertsForListing } from '../../routes/priceAlerts.js';
import { formatGbpAmount } from '../../lib/workerHelpers.js';
import { queueUserNotification } from '../../lib/workerRuntime.js';
import { emitOfferChatCard, syncOfferChatCardStatus } from '../../lib/offerChatCards.js';

export type OutboxDrainHandlerDeps = {
  /** Uses shared db singleton + worker runtime helpers. */
};

/**
 * Resolve the notification deep link for an offer lifecycle event. There is
 * no dedicated offers screen yet; when the offer is linked to a chat
 * conversation the thread is the truthful surface (the listing context bar
 * renders live offer state there). Otherwise fall back to the listing.
 */
function offerNotificationRoute(
  conversationId: string | null | undefined,
  counterpartyUserId: string,
  listingId: string,
): Record<string, unknown> {
  if (conversationId) {
    return {
      screen: 'Chat',
      params: { conversationId, partnerUserId: counterpartyUserId },
    };
  }
  return { screen: 'ItemDetail', params: { itemId: listingId } };
}

const offerLifecyclePayloadSchema = z.object({
  offerId: z.string().min(2),
  listingId: z.string().min(2),
  buyerId: z.string().min(2),
  sellerId: z.string().min(2),
  offerPriceGbp: z.number().nonnegative(),
  conversationId: z.string().nullable().optional(),
  // Who authored the pending offer that this event ended — buyer for the
  // initial offer and buyer counters, seller for seller counters. Missing
  // on pre-change events; those were all buyer-authored.
  offeredByUserId: z.string().min(2).optional(),
  // Who performed the cancellation on offer.cancelled — buyer (cancel
  // route) vs seller/system (listing delete, mark-sold). Legacy events
  // lack it; they predate seller-side cancellation visibility.
  cancelledByUserId: z.string().min(2).nullable().optional(),
  cancellationReason: z.string().optional(),
});

/**
 * Offer lifecycle events are participant-private — buyer identity, amounts,
 * and order/reservation ids must never land on a public listing topic.
 * `listing:{id}` subscriptions aren't authorized anyway, so those publishes
 * were dead writes; `chat.user:{id}` reaches exactly the two participants
 * and lets the Offers screen refresh in realtime.
 */
function publishOfferEventToParticipants(input: {
  type: string;
  buyerId: string;
  sellerId: string;
  payload: Record<string, unknown>;
}): void {
  for (const userId of [input.buyerId, input.sellerId]) {
    publishRealtimeEvent({
      topic: `chat.user:${userId}`,
      type: input.type,
      payload: input.payload,
    });
  }
}

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

    // R35 — material-change invalidation. Every pending offer on the
    // listing was negotiated against the previous price, so a reprice
    // invalidates them all. They are cancelled inside one transaction and
    // each emits the same `offer.cancelled` domain event the lifecycle
    // already drains (notification + participant realtime + in-thread card
    // flip) — no parallel fan-out path. `cancellationReason` is
    // 'listing_terms_changed', distinct from 'listing_unavailable': the
    // listing is still on sale and the buyer may re-offer on the new terms.
    // The deduplication key matches the command service's cancel key, so
    // an offer already cancelled by a terminal transition cannot emit a
    // second event — and this UPDATE only touches 'pending' rows anyway.
    const offerClient = await db.connect();
    try {
      await offerClient.query('BEGIN');
      const cancelledOffers = await offerClient.query<{
        id: string;
        buyer_id: string;
        seller_id: string;
        offer_price_gbp: string;
        conversation_id: string | null;
        offered_by_user_id: string | null;
      }>(
        `UPDATE listing_offers
            SET status = 'cancelled',
                cancelled_at = NOW(),
                updated_at = NOW()
          WHERE listing_id = $1
            AND status = 'pending'
          RETURNING id, buyer_id, seller_id, offer_price_gbp::text,
                    conversation_id, offered_by_user_id`,
        [payload.listingId],
      );
      for (const cancelledOffer of cancelledOffers.rows) {
        await appendDomainEvent(offerClient, {
          aggregateType: 'offer',
          aggregateId: cancelledOffer.id,
          eventType: 'offer.cancelled',
          actorId: event.actorId,
          correlationId: event.correlationId,
          causationId: event.id,
          deduplicationKey: `offer.cancelled:${cancelledOffer.id}`,
          payload: {
            offerId: cancelledOffer.id,
            listingId: payload.listingId,
            buyerId: cancelledOffer.buyer_id,
            sellerId: cancelledOffer.seller_id,
            offerPriceGbp: Number(cancelledOffer.offer_price_gbp),
            conversationId: cancelledOffer.conversation_id,
            offeredByUserId:
              cancelledOffer.offered_by_user_id ?? cancelledOffer.buyer_id,
            // The price change is a seller-authored mutation — attribute
            // the cancellation to the actor so the drain notifies the
            // counterparty (the buyer), not the seller who acted.
            cancelledByUserId: event.actorId ?? cancelledOffer.seller_id,
            cancellationReason: 'listing_terms_changed',
          },
        });
      }
      await offerClient.query('COMMIT');
    } catch (error) {
      try {
        await offerClient.query('ROLLBACK');
      } catch {
        // ignore rollback failure — the connection is reset on release
      }
      throw error;
    } finally {
      offerClient.release();
    }
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
    publishOfferEventToParticipants({
      type: 'offer.accepted',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      payload: {
        offerId: payload.offerId,
        listingId: payload.listingId,
        orderId: payload.orderId,
        reservationId: payload.reservationId,
        reservationExpiresAt: payload.reservationExpiresAt,
      },
    });
    // Flip the in-thread offer card to 'accepted' on both devices.
    await syncOfferChatCardStatus({ offerId: payload.offerId, log: logger });
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
      conversationId: z.string().nullable().optional(),
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
      route: offerNotificationRoute(
        payload.conversationId,
        payload.offeredByUserId,
        payload.listingId,
      ),
      idempotencyKey: `offer_countered_${payload.offerId}_${recipientId}`,
      metadata: { outboxEventId: event.id },
    });
    publishOfferEventToParticipants({
      type: 'offer.countered',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      payload,
    });
    // In-thread offer card for the new counter, authored by the countering
    // party; the parent offer's card flips to 'countered' on both devices.
    await emitOfferChatCard({ offerId: payload.offerId, log: logger });
    await syncOfferChatCardStatus({ offerId: payload.parentOfferId, log: logger });
    return;
  }

  if (event.eventType === 'offer.created') {
    const payload = z.object({
      offerId: z.string().min(2),
      listingId: z.string().min(2),
      buyerId: z.string().min(2),
      sellerId: z.string().min(2),
      amountGbp: z.number().positive(),
      expiresAt: z.string().datetime(),
      counterRound: z.number().int().nonnegative(),
      conversationId: z.string().nullable().optional(),
      // Who authored the offer — buyer for ordinary offers, seller for
      // offer-to-likers fan-out. Missing on pre-change events; those were
      // all buyer-authored.
      offeredByUserId: z.string().min(2).optional(),
      source: z.string().optional(),
    }).parse(event.payload);
    // Buyer-authored offers notify the seller; seller-authored targeted
    // offers (offer-to-likers) notify the buyer — the liker is the one who
    // must respond, and telling the seller "you got an offer" about their
    // own send would be false.
    const sellerAuthored = payload.offeredByUserId === payload.sellerId;
    const recipientId = sellerAuthored ? payload.buyerId : payload.sellerId;
    await queueUserNotification({
      userId: recipientId,
      title: sellerAuthored ? 'Private offer' : 'New offer',
      body: sellerAuthored
        ? `The seller sent you a private offer: ${formatGbpAmount(payload.amountGbp)}.`
        : `${formatGbpAmount(payload.amountGbp)} offered on your listing.`,
      eventType: 'offer_created',
      actorUserId: sellerAuthored ? payload.sellerId : payload.buyerId,
      payload: {
        event: 'offer_created',
        offerId: payload.offerId,
        listingId: payload.listingId,
        buyerId: payload.buyerId,
        amountGbp: payload.amountGbp,
        expiresAt: payload.expiresAt,
      },
      route: offerNotificationRoute(
        payload.conversationId,
        sellerAuthored ? payload.sellerId : payload.buyerId,
        payload.listingId,
      ),
      // Buyer-authored keys keep the historical `..._seller_` shape so
      // in-flight dedup is unchanged; seller-authored fan-out keys name the
      // buyer recipient.
      idempotencyKey: `offer_created_${sellerAuthored ? 'buyer' : 'seller'}_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    publishOfferEventToParticipants({
      type: 'offer.created',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      payload: {
        offerId: payload.offerId,
        listingId: payload.listingId,
        buyerId: payload.buyerId,
        amountGbp: payload.amountGbp,
        expiresAt: payload.expiresAt,
      },
    });
    // In-thread offer card: the offer is a durable entity — persist it as a
    // real chat message (not a sender-local echo) so the recipient's card
    // renders with live Accept/Pass/Counter actions.
    await emitOfferChatCard({ offerId: payload.offerId, log: logger });
    return;
  }

  if (event.eventType === 'offer.declined') {
    const payload = offerLifecyclePayloadSchema.parse(event.payload);
    // Only the seller may decline — notify the buyer (the counterparty).
    // When the pending offer was the seller's own counter, the decline is
    // effectively a withdrawal: copy must not claim it was the buyer's offer.
    const authorIsBuyer = (payload.offeredByUserId ?? payload.buyerId) === payload.buyerId;
    await queueUserNotification({
      userId: payload.buyerId,
      title: 'Offer declined',
      body: authorIsBuyer
        ? `Your ${formatGbpAmount(payload.offerPriceGbp)} offer was declined by the seller.`
        : `The seller withdrew their ${formatGbpAmount(payload.offerPriceGbp)} counter-offer.`,
      eventType: 'offer_declined',
      actorUserId: payload.sellerId,
      payload: {
        event: 'offer_declined',
        offerId: payload.offerId,
        listingId: payload.listingId,
      },
      route: offerNotificationRoute(
        payload.conversationId,
        payload.sellerId,
        payload.listingId,
      ),
      idempotencyKey: `offer_declined_buyer_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    publishOfferEventToParticipants({
      type: 'offer.declined',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      payload,
    });
    // Flip the in-thread offer card to 'declined' on both devices.
    await syncOfferChatCardStatus({ offerId: payload.offerId, log: logger });
    return;
  }

  if (event.eventType === 'offer.sibling_declined') {
    const payload = offerLifecyclePayloadSchema.extend({
      acceptedOfferId: z.string().min(2),
      orderId: z.string().min(2),
    }).parse(event.payload);
    // Notify the AUTHOR of the losing offer — after counters, that can be
    // the seller whose counter was pending when a different offer won.
    const siblingAuthorId = payload.offeredByUserId ?? payload.buyerId;
    const siblingAuthorIsBuyer = siblingAuthorId === payload.buyerId;
    await queueUserNotification({
      userId: siblingAuthorId,
      title: 'Offer declined',
      body: siblingAuthorIsBuyer
        ? 'Another offer on this item was accepted, so your offer was declined.'
        : 'Your counter-offer was declined — another offer on this item was accepted.',
      eventType: 'offer_declined',
      actorUserId: payload.sellerId,
      payload: {
        event: 'offer_declined',
        offerId: payload.offerId,
        listingId: payload.listingId,
        acceptedOfferId: payload.acceptedOfferId,
        orderId: payload.orderId,
      },
      route: offerNotificationRoute(
        payload.conversationId,
        siblingAuthorIsBuyer ? payload.sellerId : payload.buyerId,
        payload.listingId,
      ),
      idempotencyKey: `offer_sibling_declined_${siblingAuthorId}_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    publishOfferEventToParticipants({
      type: 'offer.sibling_declined',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      payload,
    });
    // Flip the losing offer's in-thread card to 'declined' on both devices.
    await syncOfferChatCardStatus({ offerId: payload.offerId, log: logger });
    return;
  }

  if (event.eventType === 'offer.expired') {
    const payload = offerLifecyclePayloadSchema.extend({
      expiresAt: z.string().datetime(),
    }).parse(event.payload);
    // Expiry has no actor — notify the AUTHOR of the lapsed offer. After
    // counters that can be the seller; telling the buyer "your offer
    // expired" about the seller's counter is false.
    const expiredAuthorId = payload.offeredByUserId ?? payload.buyerId;
    const expiredAuthorIsBuyer = expiredAuthorId === payload.buyerId;
    await queueUserNotification({
      userId: expiredAuthorId,
      title: 'Offer expired',
      body: expiredAuthorIsBuyer
        ? `Your ${formatGbpAmount(payload.offerPriceGbp)} offer expired without a response.`
        : `Your ${formatGbpAmount(payload.offerPriceGbp)} counter-offer expired without a response.`,
      eventType: 'offer_expired',
      payload: {
        event: 'offer_expired',
        offerId: payload.offerId,
        listingId: payload.listingId,
        expiresAt: payload.expiresAt,
      },
      route: offerNotificationRoute(
        payload.conversationId,
        expiredAuthorIsBuyer ? payload.sellerId : payload.buyerId,
        payload.listingId,
      ),
      idempotencyKey: `offer_expired_${expiredAuthorId}_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    publishOfferEventToParticipants({
      type: 'offer.expired',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      payload,
    });
    // Flip the in-thread offer card to 'expired' on both devices.
    await syncOfferChatCardStatus({ offerId: payload.offerId, log: logger });
    return;
  }

  if (event.eventType === 'offer.cancelled') {
    const payload = offerLifecyclePayloadSchema.parse(event.payload);
    // Notify the party who did NOT act. Buyer-initiated cancels (the only
    // kind the cancel route allows) must reach the SELLER — previously the
    // buyer got a self-notification and the seller heard nothing.
    // Seller/system cancels (listing delete / mark-sold) reach the buyer.
    const cancelledByBuyer = payload.cancelledByUserId === payload.buyerId;
    const authorIsBuyer = (payload.offeredByUserId ?? payload.buyerId) === payload.buyerId;
    const cancelledRecipient = cancelledByBuyer ? payload.sellerId : payload.buyerId;
    const cancelledBody = cancelledByBuyer
      ? (authorIsBuyer
        ? `The buyer withdrew their ${formatGbpAmount(payload.offerPriceGbp)} offer.`
        : `The buyer declined your ${formatGbpAmount(payload.offerPriceGbp)} counter-offer.`)
      : (authorIsBuyer
        ? (payload.cancellationReason === 'listing_terms_changed'
          ? `Your ${formatGbpAmount(payload.offerPriceGbp)} offer was cancelled — the listing's price changed. You can send a new offer on the updated terms.`
          : payload.cancellationReason === 'listing_unavailable'
            ? `Your ${formatGbpAmount(payload.offerPriceGbp)} offer was cancelled — the listing is no longer available.`
            : `Your ${formatGbpAmount(payload.offerPriceGbp)} offer was cancelled by the seller.`)
        : (payload.cancellationReason === 'listing_terms_changed'
          ? `The seller's ${formatGbpAmount(payload.offerPriceGbp)} counter-offer was withdrawn — the listing's price changed.`
          : `The seller withdrew their ${formatGbpAmount(payload.offerPriceGbp)} counter-offer.`));
    await queueUserNotification({
      userId: cancelledRecipient,
      title: 'Offer cancelled',
      body: cancelledBody,
      eventType: 'offer_cancelled',
      actorUserId: payload.cancelledByUserId ?? undefined,
      payload: {
        event: 'offer_cancelled',
        offerId: payload.offerId,
        listingId: payload.listingId,
      },
      route: offerNotificationRoute(
        payload.conversationId,
        cancelledByBuyer ? payload.buyerId : payload.sellerId,
        payload.listingId,
      ),
      idempotencyKey: `offer_cancelled_${cancelledRecipient}_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    publishOfferEventToParticipants({
      type: 'offer.cancelled',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      payload,
    });
    // Flip the in-thread offer card to 'cancelled' on both devices.
    await syncOfferChatCardStatus({ offerId: payload.offerId, log: logger });
    return;
  }

  if (event.eventType === 'offer.checkout_expired') {
    // An accepted offer's checkout reservation lapsed (or the bound order
    // was cancelled before payment): the deal is dead and the listing is
    // back on sale. Both parties must hear about it — previously the
    // reconcile trigger flipped the offer silently, leaving a stale
    // 'accepted' card in the thread and no notification either way.
    const payload = z.object({
      offerId: z.string().min(2),
      listingId: z.string().min(2),
      orderId: z.string().min(2),
      buyerId: z.string().min(2),
      sellerId: z.string().min(2),
    }).parse(event.payload);
    await queueUserNotification({
      userId: payload.buyerId,
      title: 'Checkout window expired',
      body: 'Your accepted offer lapsed because checkout was not completed in time.',
      eventType: 'offer_expired',
      payload: {
        event: 'offer_checkout_expired',
        offerId: payload.offerId,
        listingId: payload.listingId,
        orderId: payload.orderId,
      },
      route: { screen: 'Offers', params: {} },
      idempotencyKey: `offer_checkout_expired_buyer_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    await queueUserNotification({
      userId: payload.sellerId,
      title: 'Reservation expired',
      body: 'The buyer did not complete checkout. Your listing is back on sale.',
      eventType: 'offer_expired',
      payload: {
        event: 'offer_checkout_expired',
        offerId: payload.offerId,
        listingId: payload.listingId,
        orderId: payload.orderId,
      },
      route: { screen: 'Offers', params: {} },
      idempotencyKey: `offer_checkout_expired_seller_${payload.offerId}`,
      metadata: { outboxEventId: event.id },
    });
    publishOfferEventToParticipants({
      type: 'offer.checkout_expired',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      payload,
    });
    // Flip the in-thread offer card off 'accepted' on both devices.
    await syncOfferChatCardStatus({ offerId: payload.offerId, log: logger });
    return;
  }

  if (event.eventType.startsWith('smart_sell_decision.')) {
    // A Smart Sell policy decided on the seller's behalf. The counterparty
    // was already notified by the offer.* lifecycle event emitted alongside
    // (offer.accepted / offer.countered) — this notification is for the
    // SELLER, who must know their automation acted. Without this branch the
    // events dead-lettered and Smart Sell was silent.
    const payload = z.object({
      decisionId: z.string().min(2),
      offerId: z.string().min(2),
      listingId: z.string().min(2),
      buyerId: z.string().min(2),
      sellerId: z.string().min(2),
      decision: z.enum(['accept', 'counter', 'decline', 'escalate']),
      reason: z.string(),
      offerPriceGbp: z.number().positive(),
      counterPriceGbp: z.number().positive().nullable(),
      orderId: z.string().min(2).nullable().optional(),
      conversationId: z.string().nullable().optional(),
    }).parse(event.payload);
    const body = {
      accept: `Smart Sell accepted an offer of ${formatGbpAmount(payload.offerPriceGbp)} — the item is reserved while the buyer checks out.`,
      counter: `Smart Sell countered at ${formatGbpAmount(payload.counterPriceGbp ?? payload.offerPriceGbp)} on your behalf.`,
      escalate: `An offer of ${formatGbpAmount(payload.offerPriceGbp)} is below your floor and needs your response.`,
      decline: `Smart Sell declined an offer of ${formatGbpAmount(payload.offerPriceGbp)}.`,
    }[payload.decision];
    await queueUserNotification({
      userId: payload.sellerId,
      title: 'Smart Sell',
      body,
      eventType: 'smart_sell_decision',
      payload: {
        event: 'smart_sell_decision',
        decisionId: payload.decisionId,
        offerId: payload.offerId,
        listingId: payload.listingId,
        decision: payload.decision,
        orderId: payload.orderId ?? null,
      },
      route: payload.orderId
        ? { screen: 'OrderDetail', params: { orderId: payload.orderId } }
        : offerNotificationRoute(
            payload.conversationId,
            payload.buyerId,
            payload.listingId,
          ),
      idempotencyKey: `smart_sell_decision_seller_${payload.decisionId}`,
      metadata: { outboxEventId: event.id },
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
    publishOfferEventToParticipants({
      type: 'listing.reserved',
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
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

  if (event.eventType === 'order.dispatch_extension_proposed') {
    const payload = z.object({
      orderId: z.string().min(2),
      extensionId: z.string().min(2),
      days: z.number().int().positive(),
      proposedShipBy: z.string().datetime(),
      buyerId: z.string().min(2),
    }).parse(event.payload);
    await queueUserNotification({
      userId: payload.buyerId,
      title: 'Dispatch extension requested',
      body: `Seller asked for ${payload.days} more day${payload.days === 1 ? '' : 's'} to dispatch your order. Review and respond.`,
      eventType: 'dispatch_extension_proposed',
      payload: {
        event: 'dispatch_extension_proposed',
        orderId: payload.orderId,
        extensionId: payload.extensionId,
        days: payload.days,
        proposedShipBy: payload.proposedShipBy,
      },
      route: { screen: 'OrderDetail', params: { orderId: payload.orderId } },
      idempotencyKey: `dispatch_extension_proposed_${payload.extensionId}`,
      metadata: { outboxEventId: event.id },
    });
    publishRealtimeEvent({
      topic: `order:${payload.orderId}`,
      type: 'order.dispatch_extension_proposed',
      payload,
    });
    return;
  }

  if (event.eventType === 'order.dispatch_extension_responded') {
    const payload = z.object({
      orderId: z.string().min(2),
      extensionId: z.string().min(2),
      accepted: z.boolean(),
      proposedShipBy: z.string().datetime(),
      sellerId: z.string().min(2),
    }).parse(event.payload);
    await queueUserNotification({
      userId: payload.sellerId,
      title: payload.accepted ? 'Dispatch extension accepted' : 'Dispatch extension declined',
      body: payload.accepted
        ? 'The buyer accepted your dispatch extension. The new ship-by date is now in effect.'
        : 'The buyer declined your dispatch extension. The original ship-by date still applies.',
      eventType: 'dispatch_extension_responded',
      payload: {
        event: 'dispatch_extension_responded',
        orderId: payload.orderId,
        extensionId: payload.extensionId,
        accepted: payload.accepted,
        proposedShipBy: payload.proposedShipBy,
      },
      route: { screen: 'OrderDetail', params: { orderId: payload.orderId } },
      idempotencyKey: `dispatch_extension_responded_${payload.extensionId}`,
      metadata: { outboxEventId: event.id },
    });
    publishRealtimeEvent({
      topic: `order:${payload.orderId}`,
      type: 'order.dispatch_extension_responded',
      payload,
    });
    return;
  }

  // Co-Own price alert crossing — emitted by the alert evaluator worker.
  // Without this branch the event dead-letters after 10 retries and the
  // user is never notified.
  if (event.eventType === 'coown_price_alert_triggered') {
    const payload = z.object({
      alertId: z.string().min(2),
      // SEP20-FIN-12: which activation fired — scopes notification dedup.
      activationSeq: z.number().int().positive().optional(),
      userId: z.string().min(2),
      assetId: z.string().min(2),
      condition: z.enum(['above', 'below']),
      triggerPriceGbpMinor: z.number().nonnegative(),
      currentPriceGbpMinor: z.number().nonnegative(),
      // SEP20-FIN-11: appraisal/reference-mark alerts legitimately carry
      // tradeId: null — the old non-nullable schema rejected the event
      // before delivery and the alert was already marked triggered, so
      // retries never notified.
      tradeId: z.string().nullable().optional(),
      markSource: z.enum(['trade', 'reference']).optional(),
    }).parse(event.payload);

    const direction = payload.condition === 'above' ? 'rose above' : 'fell below';
    // Disclose mark provenance: a settled-trade mark and an appraisal/
    // reference mark are not the same evidence and the copy must not
    // pretend they are.
    const markBasis =
      payload.markSource === 'reference'
        ? 'reference/appraisal price'
        : 'last settled trade';
    await queueUserNotification({
      userId: payload.userId,
      title: 'Price alert triggered',
      body: `A co-own asset you watch ${direction} ${formatGbpAmount(payload.triggerPriceGbpMinor / 100)} — now at ${formatGbpAmount(payload.currentPriceGbpMinor / 100)} (${markBasis}).`,
      eventType: 'coown_price_alert_triggered',
      payload: {
        event: 'coown_price_alert_triggered',
        alertId: payload.alertId,
        activationSeq: payload.activationSeq ?? null,
        assetId: payload.assetId,
        condition: payload.condition,
        triggerPriceGbpMinor: payload.triggerPriceGbpMinor,
        currentPriceGbpMinor: payload.currentPriceGbpMinor,
        tradeId: payload.tradeId ?? null,
        markSource: payload.markSource ?? null,
      },
      route: { screen: 'AssetDetail', params: { assetId: payload.assetId } },
      // Exactly-once per ACTIVATION: a re-armed alert (higher
      // activationSeq) must produce a second delivered notification, while
      // outbox replays of the same trigger still dedup. Legacy events
      // without activationSeq keep the lifetime key so they cannot
      // double-notify against an already-delivered row.
      idempotencyKey: payload.activationSeq != null
        ? `coown_price_alert_notif_${payload.alertId}_${payload.activationSeq}`
        : `coown_price_alert_notif_${payload.alertId}`,
      metadata: { outboxEventId: event.id },
    });
    return;
  }

  // Co-Own DRIP receipt — emitted by the DRIP execution worker after a
  // distribution resolves to reinvested / retained_cash / reinvest_failed.
  if (event.eventType === 'coown_drip_receipt') {
    const payload = z.object({
      distributionId: z.string().min(2),
      userId: z.string().min(2),
      assetId: z.string().min(2),
      outcome: z.enum(['reinvested', 'retained_cash', 'reinvest_failed']),
      tradeId: z.string().nullable().optional(),
      units: z.number().int().nonnegative().optional(),
      unitPriceGbp: z.number().nonnegative().optional(),
      notionalGbp: z.number().nonnegative().optional(),
      amountGbpMinor: z.number().nonnegative().optional(),
      cause: z.string().optional(),
      // SEP20-FIN-14: ledger evidence the worker observed when it decided
      // not to reinvest — lets the copy state the true state.
      spendableUnits: z.number().int().nonnegative().optional(),
      requiredUnits: z.number().int().nonnegative().optional(),
    }).parse(event.payload);

    const title =
      payload.outcome === 'reinvested'
        ? 'Distribution reinvested'
        : payload.outcome === 'retained_cash'
          ? 'Distribution not reinvested'
          : 'Reinvestment could not complete';
    // SEP20-FIN-14: 'retained_cash' means the reinvestment was skipped —
    // the worker verified the spendable balance was short and bought no
    // units. It did NOT verify a cash credit landed anywhere, so the copy
    // must not claim "paid as cash" or "stays in your balance as cash".
    const body =
      payload.outcome === 'reinvested'
        ? `Your distribution bought ${payload.units ?? 0} unit${payload.units === 1 ? '' : 's'}${payload.unitPriceGbp ? ` at ${formatGbpAmount(payload.unitPriceGbp)}` : ''}.`
        : payload.outcome === 'retained_cash'
          ? 'Automatic reinvestment was skipped because your available 1ZE balance was too low at the time it ran. No units were purchased — any cash already in your balance is unchanged.'
          : 'Automatic reinvestment failed. Your distribution was not reinvested — you can reinvest manually.';

    await queueUserNotification({
      userId: payload.userId,
      title,
      body,
      eventType: 'coown_drip_receipt',
      payload: {
        event: 'coown_drip_receipt',
        distributionId: payload.distributionId,
        assetId: payload.assetId,
        outcome: payload.outcome,
        tradeId: payload.tradeId ?? null,
        cause: payload.cause ?? null,
        spendableUnits: payload.spendableUnits ?? null,
        requiredUnits: payload.requiredUnits ?? null,
      },
      route: { screen: 'AssetDetail', params: { assetId: payload.assetId } },
      idempotencyKey: `coown_drip_receipt_${payload.distributionId}`,
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
