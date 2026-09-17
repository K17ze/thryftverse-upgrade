import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { appendDomainEvent } from '../lib/domainOutbox.js';
import { emitOrderCommerceCard } from '../lib/orderChatCards.js';
import { fetchSellerAwayState } from '../lib/sellerAway.js';
import { getSellerReach } from '../lib/sellerReach.js';
import { cancelOrderOnReservationExpiry } from '../lib/commerceCheckoutLifecycle.js';

type ListingOffersRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
  calculatePlatformChargeGbp: (subtotalGbp: number) => number;
  authorizeInternalServiceRequest: (request: FastifyRequest) => boolean;
  enqueueOutboxDrain: () => Promise<void>;
  /**
   * Fire-and-forget Smart Sell evaluation trigger. Called after an offer is
   * committed. If the listing has an active Smart Sell policy, the evaluation
   * worker will decide whether to accept, counter, or escalate. This is
   * non-blocking — the offer is already durable when this is called.
   */
  triggerSmartSellEvaluation?: (offerId: string) => void;
};

const MAX_OFFER_HOURS = 168; // 7 days
const MIN_OFFER_HOURS = 1;
const OFFER_CHECKOUT_RESERVATION_MINUTES = 30;
const CHECKOUT_QUOTE_VERSION = 'commerce-gbp-2026-07-28.1';

const createOfferSchema = z.object({
  listingId: z.string().min(2).max(120).optional(),
  offerPriceGbp: z.number().positive().max(1_000_000),
  expiryHours: z.number().int().min(MIN_OFFER_HOURS).max(MAX_OFFER_HOURS).default(48),
  conversationId: z.string().min(2).max(120).optional(),
  idempotencyKey: z.string().min(8).max(140).optional(),
  metadata: z.record(z.unknown()).default({}),
});

const counterOfferSchema = z.object({
  offerPriceGbp: z.number().positive().max(1_000_000),
  expiryHours: z.number().int().min(MIN_OFFER_HOURS).max(MAX_OFFER_HOURS).default(48),
  conversationId: z.string().min(2).max(120).optional(),
  idempotencyKey: z.string().min(8).max(140),
});

const offerIdParamsSchema = z.object({
  offerId: z.string().min(2).max(120),
});

const listQuerySchema = z.object({
  status: z
    .enum(['pending', 'accepted', 'declined', 'expired', 'cancelled', 'countered'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type ListingOfferRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price_gbp: string;
  original_price_gbp: string;
  counter_round: number;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  conversation_id: string | null;
  parent_offer_id: string | null;
  metadata: unknown;
  offered_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ListingOfferRow) {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    offerPriceGbp: Number(row.offer_price_gbp),
    originalPriceGbp: Number(row.original_price_gbp),
    counterRound: row.counter_round,
    status: row.status,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    declinedAt: row.declined_at,
    expiredAt: row.expired_at,
    cancelledAt: row.cancelled_at,
    conversationId: row.conversation_id,
    parentOfferId: row.parent_offer_id,
    metadata: row.metadata,
    offeredByUserId: row.offered_by_user_id ?? row.buyer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ExpiredOfferRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price_gbp: string;
  conversation_id: string | null;
  expires_at: string;
};

/**
 * Marks offers past their `expires_at` as expired. Called inline before any
 * offer read/write so the server-authoritative expiry is always reflected
 * without needing a separate sweep job for correctness. Returns the rows
 * that transitioned so the caller can append `offer.expired` domain events
 * inside the same transaction — the outbox then drives notifications.
 */
async function expireOverdueOffers(
  client: { query: Pool['query'] },
): Promise<ExpiredOfferRow[]> {
  const result = await client.query<ExpiredOfferRow>(
    `UPDATE listing_offers
     SET status = 'expired', expired_at = NOW(), updated_at = NOW()
     WHERE status = 'pending' AND expires_at <= NOW()
     RETURNING id, listing_id, buyer_id, seller_id, offer_price_gbp::text,
               conversation_id, expires_at::text`,
  );
  return result.rows;
}

/**
 * Appends one `offer.expired` domain event per offer that just transitioned.
 * An offer can only leave `pending` once, and the deduplication key is
 * derived from the offer id, so each event is appended exactly once even if
 * the caller transaction is retried.
 */
async function appendOfferExpiredEvents(
  client: { query: Pool['query'] },
  expiredOffers: ExpiredOfferRow[],
  correlationId: string | null,
): Promise<void> {
  for (const expiredOffer of expiredOffers) {
    await appendDomainEvent(client, {
      aggregateType: 'offer',
      aggregateId: expiredOffer.id,
      eventType: 'offer.expired',
      correlationId,
      deduplicationKey: `offer.expired:${expiredOffer.id}`,
      payload: {
        offerId: expiredOffer.id,
        listingId: expiredOffer.listing_id,
        buyerId: expiredOffer.buyer_id,
        sellerId: expiredOffer.seller_id,
        offerPriceGbp: Number(expiredOffer.offer_price_gbp),
        conversationId: expiredOffer.conversation_id,
        // expires_at::text renders Postgres format ('2026-07-28 12:34:56.789+00')
        // which the drain handler's z.string().datetime() schema rejects —
        // normalise to ISO-8601 here so the event does not dead-letter.
        expiresAt: new Date(expiredOffer.expires_at).toISOString(),
      },
    });
  }
}

export const registerListingOfferRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
  calculatePlatformChargeGbp,
  authorizeInternalServiceRequest,
  enqueueOutboxDrain,
  triggerSmartSellEvaluation,
}: ListingOffersRouteDependencies) => {
  app.post('/listings/:listingId/offers', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { listingId } = z
      .object({ listingId: z.string().min(2).max(120) })
      .parse(request.params);
    const payload = createOfferSchema.parse(request.body);
    if (payload.listingId && payload.listingId !== listingId) {
      reply.code(422);
      return { ok: false, error: 'Listing ID does not match the route' };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const expiredOffers = await expireOverdueOffers(client);
      await appendOfferExpiredEvents(client, expiredOffers, request.id);
      const requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          listingId,
          offerPriceGbp: payload.offerPriceGbp,
          expiryHours: payload.expiryHours,
          conversationId: payload.conversationId ?? null,
        }))
        .digest('hex');
      if (payload.idempotencyKey) {
        const replay = await client.query<ListingOfferRow & { request_hash: string | null }>(
          `SELECT id, listing_id, buyer_id, seller_id,
                  offer_price_gbp::text, original_price_gbp::text,
                  counter_round, status, expires_at::text,
                  accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
                  conversation_id, parent_offer_id, metadata, offered_by_user_id,
                  request_hash, created_at::text, updated_at::text
           FROM listing_offers
           WHERE offered_by_user_id = $1 AND idempotency_key = $2
           LIMIT 1
           FOR UPDATE`,
          [actorUserId, payload.idempotencyKey],
        );
        if (replay.rowCount) {
          if (replay.rows[0].request_hash !== requestHash) {
            await client.query('ROLLBACK');
            reply.code(409);
            return {
              ok: false,
              error: 'Idempotency key was already used with a different offer payload',
              code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            };
          }
          await client.query('COMMIT');
          return { ok: true, idempotent: true, offer: mapRow(replay.rows[0]) };
        }
      }

      // Lock the listing through offer creation so it cannot transition to
      // paused/sold between validation and insertion.
      const listingResult = await client.query<{
        id: string;
        seller_id: string;
        price_gbp: string;
        status: string;
      }>(
        `SELECT id, seller_id, price_gbp::text, status
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [listingId],
      );
      if (!listingResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Listing not found' };
      }
      const listing = listingResult.rows[0];
      if (listing.status !== 'active') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Listing is not active' };
      }
      if (listing.seller_id === actorUserId) {
        await client.query('ROLLBACK');
        reply.code(400);
        return { ok: false, error: 'Cannot make an offer on your own listing' };
      }

      // Holiday mode is a hard pause — the product tells buyers "listings
      // are paused" on the seller's profile, so a new offer against an away
      // seller must be rejected, not accepted into a queue nobody is
      // watching. lib/sellerAway.ts owns the effective-away definition
      // (a declared return date that has passed already ended the pause).
      const sellerAway = await fetchSellerAwayState(client, listing.seller_id);
      if (sellerAway.away) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'This seller is away — their listings are paused until they return',
          code: 'SELLER_AWAY',
          sellerAwayUntil: sellerAway.awayUntil,
          awayMessage: sellerAway.awayMessage,
        };
      }

      // Seller reach (lib/sellerReach.ts): a 'suspended' seller is excluded
      // from distribution — a new offer is purchase intent toward a listing
      // that cannot transact, so it is rejected. 'limited' does not block.
      const sellerReach = await getSellerReach(client, listing.seller_id);
      if (sellerReach?.state === 'suspended') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'This seller is currently restricted — their listings are not available for purchase',
          code: 'SELLER_RESTRICTED',
        };
      }
      const originalPriceGbp = Number(listing.price_gbp);
      if (payload.offerPriceGbp > originalPriceGbp * 2) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Offer amount is unreasonably high' };
      }

      // Cancel any prior pending offers by this buyer on the same listing —
      // only one active offer per buyer/listing at a time. Each cancelled
      // offer gets its own `offer.cancelled` domain event (same event the
      // buyer-initiated cancel route and listingCommandService emit) so the
      // buyer is notified instead of the offer silently disappearing. The
      // deduplication key is derived from the offer id, so a retried
      // transaction cannot double-notify.
      const supersededOffers = await client.query<{
        id: string;
        buyer_id: string;
        seller_id: string;
        offer_price_gbp: string;
        conversation_id: string | null;
      }>(
        `UPDATE listing_offers
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE listing_id = $1 AND buyer_id = $2 AND status = 'pending'
         RETURNING id, buyer_id, seller_id, offer_price_gbp::text, conversation_id`,
        [listingId, actorUserId],
      );
      for (const superseded of supersededOffers.rows) {
        await appendDomainEvent(client, {
          aggregateType: 'offer',
          aggregateId: superseded.id,
          eventType: 'offer.cancelled',
          actorId: actorUserId,
          correlationId: request.id,
          deduplicationKey: `offer.cancelled:${superseded.id}`,
          payload: {
            offerId: superseded.id,
            listingId,
            buyerId: superseded.buyer_id,
            sellerId: superseded.seller_id,
            offerPriceGbp: Number(superseded.offer_price_gbp),
            conversationId: superseded.conversation_id,
          },
        });
      }

      const offerId = `offer_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + payload.expiryHours * 3600_000).toISOString();

      const result = await client.query<ListingOfferRow>(
        `INSERT INTO listing_offers (
           id, listing_id, buyer_id, seller_id,
           offer_price_gbp, original_price_gbp,
           counter_round, status, expires_at,
           conversation_id, parent_offer_id, metadata,
           offered_by_user_id, idempotency_key, request_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, 0, 'pending', $7, $8, NULL, $9::jsonb, $3, $10, $11)
         RETURNING id, listing_id, buyer_id, seller_id,
                   offer_price_gbp::text, original_price_gbp::text,
                   counter_round, status, expires_at::text,
                   accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
                   conversation_id, parent_offer_id, metadata, offered_by_user_id,
                   created_at::text, updated_at::text`,
        [
          offerId,
          listingId,
          actorUserId,
          listing.seller_id,
          payload.offerPriceGbp,
          originalPriceGbp,
          expiresAt,
          payload.conversationId ?? null,
          JSON.stringify(payload.metadata ?? {}),
          payload.idempotencyKey ?? null,
          requestHash,
        ],
      );

      await appendDomainEvent(client, {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.created',
        actorId: actorUserId,
        correlationId: request.id,
        idempotencyKey: payload.idempotencyKey ?? offerId,
        deduplicationKey: `offer.created:${offerId}`,
        payload: {
          offerId,
          listingId,
          buyerId: actorUserId,
          sellerId: listing.seller_id,
          amountGbp: payload.offerPriceGbp,
          expiresAt,
          counterRound: 0,
          conversationId: payload.conversationId ?? null,
        },
      });

      await client.query('COMMIT');
      try {
        await enqueueOutboxDrain();
      } catch (error) {
        // The event is already durable. The periodic drain will retry even
        // when Redis is temporarily unavailable at commit time.
        app.log.error({ err: error, offerId }, 'Failed to enqueue offer outbox drain');
      }
      // Fire-and-forget Smart Sell evaluation. If the listing has an active
      // policy, the evaluation worker will decide whether to accept, counter,
      // or escalate. This is non-blocking — the offer is already durable.
      if (triggerSmartSellEvaluation) {
        try {
          triggerSmartSellEvaluation(result.rows[0].id);
        } catch (error) {
          app.log.error({ err: error, offerId: result.rows[0].id }, 'Failed to trigger Smart Sell evaluation');
        }
      }
      reply.code(201);
      return { ok: true, offer: mapRow(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to create listing offer');
      reply.code(500);
      return { ok: false, error: 'Failed to create offer' };
    } finally {
      client.release();
    }
  });

  app.post('/offers/:offerId/counter', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { offerId } = offerIdParamsSchema.parse(request.params);
    const payload = counterOfferSchema.parse(request.body);
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        parentOfferId: offerId,
        offerPriceGbp: payload.offerPriceGbp,
        expiryHours: payload.expiryHours,
        conversationId: payload.conversationId ?? null,
      }))
      .digest('hex');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const expiredOffers = await expireOverdueOffers(client);
      await appendOfferExpiredEvents(client, expiredOffers, request.id);
      const replay = await client.query<ListingOfferRow & { request_hash: string | null }>(
        `SELECT id, listing_id, buyer_id, seller_id,
                offer_price_gbp::text, original_price_gbp::text,
                counter_round, status, expires_at::text,
                accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
                conversation_id, parent_offer_id, metadata, offered_by_user_id,
                request_hash, created_at::text, updated_at::text
         FROM listing_offers
         WHERE offered_by_user_id = $1 AND idempotency_key = $2
         LIMIT 1
         FOR UPDATE`,
        [actorUserId, payload.idempotencyKey],
      );
      if (replay.rowCount) {
        if (replay.rows[0].request_hash !== requestHash) {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'Idempotency key was already used with a different counter payload',
            code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          };
        }
        await client.query('COMMIT');
        return { ok: true, idempotent: true, offer: mapRow(replay.rows[0]) };
      }

      const parentResult = await client.query<ListingOfferRow>(
        `SELECT id, listing_id, buyer_id, seller_id,
                offer_price_gbp::text, original_price_gbp::text,
                counter_round, status, expires_at::text,
                accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
                conversation_id, parent_offer_id, metadata, offered_by_user_id,
                created_at::text, updated_at::text
         FROM listing_offers
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [offerId],
      );
      const parent = parentResult.rows[0];
      if (!parent) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Offer not found' };
      }
      if (actorUserId !== parent.buyer_id && actorUserId !== parent.seller_id) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only an offer participant can counter' };
      }
      if ((parent.offered_by_user_id ?? parent.buyer_id) === actorUserId) {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'The other participant must respond before you counter again' };
      }
      if (parent.status !== 'pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: `A ${parent.status} offer cannot be countered` };
      }
      if (parent.counter_round >= 10) {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Maximum counter-offer depth reached' };
      }

      // Same hard-pause rule as offer creation: when the buyer counters,
      // the seller is the one who must respond — an away seller cannot.
      // A counter authored BY the away seller is allowed: they are clearly
      // active in the app despite the pause flag.
      if (actorUserId === parent.buyer_id) {
        const sellerAway = await fetchSellerAwayState(client, parent.seller_id);
        if (sellerAway.away) {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'This seller is away — their listings are paused until they return',
            code: 'SELLER_AWAY',
            sellerAwayUntil: sellerAway.awayUntil,
            awayMessage: sellerAway.awayMessage,
          };
        }

        // Seller reach (lib/sellerReach.ts): a buyer-authored counter is
        // fresh purchase intent toward a suspended seller whose listings
        // cannot transact — rejected. A suspended seller's own counter
        // binds nobody; the accept route is the order-bind gate.
        const counterSellerReach = await getSellerReach(client, parent.seller_id);
        if (counterSellerReach?.state === 'suspended') {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'This seller is currently restricted — their listings are not available for purchase',
            code: 'SELLER_RESTRICTED',
          };
        }
      }

      const listing = await client.query<{ status: string; price_gbp: string }>(
        `SELECT status, price_gbp::text
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [parent.listing_id],
      );
      if (!listing.rowCount || listing.rows[0].status !== 'active') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Listing is no longer available for counter-offers' };
      }
      if (payload.offerPriceGbp > Number(listing.rows[0].price_gbp) * 2) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Counter amount is unreasonably high' };
      }

      const nextOfferId = `offer_${crypto.randomUUID()}`;
      const nextRound = parent.counter_round + 1;
      const expiresAt = new Date(Date.now() + payload.expiryHours * 3600_000).toISOString();
      await client.query(
        `UPDATE listing_offers
         SET status = 'countered', updated_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [offerId],
      );
      const inserted = await client.query<ListingOfferRow>(
        `INSERT INTO listing_offers (
           id, listing_id, buyer_id, seller_id,
           offer_price_gbp, original_price_gbp,
           counter_round, status, expires_at,
           conversation_id, parent_offer_id, metadata,
           offered_by_user_id, idempotency_key, request_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, '{}'::jsonb, $11, $12, $13)
         RETURNING id, listing_id, buyer_id, seller_id,
                   offer_price_gbp::text, original_price_gbp::text,
                   counter_round, status, expires_at::text,
                   accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
                   conversation_id, parent_offer_id, metadata, offered_by_user_id,
                   created_at::text, updated_at::text`,
        [
          nextOfferId,
          parent.listing_id,
          parent.buyer_id,
          parent.seller_id,
          payload.offerPriceGbp,
          parent.original_price_gbp,
          nextRound,
          expiresAt,
          payload.conversationId ?? parent.conversation_id,
          offerId,
          actorUserId,
          payload.idempotencyKey,
          requestHash,
        ],
      );
      await appendDomainEvent(client, {
        aggregateType: 'offer',
        aggregateId: nextOfferId,
        eventType: 'offer.countered',
        actorId: actorUserId,
        idempotencyKey: payload.idempotencyKey,
        deduplicationKey: `offer.countered:${nextOfferId}`,
        payload: {
          offerId: nextOfferId,
          parentOfferId: offerId,
          listingId: parent.listing_id,
          buyerId: parent.buyer_id,
          sellerId: parent.seller_id,
          offeredByUserId: actorUserId,
          counterRound: nextRound,
          offerPriceGbp: payload.offerPriceGbp,
          expiresAt,
          conversationId: inserted.rows[0].conversation_id,
        },
      });
      await client.query('COMMIT');
      try {
        await enqueueOutboxDrain();
      } catch (error) {
        app.log.error({ err: error, offerId: nextOfferId }, 'Failed to enqueue counter-offer outbox');
      }
      reply.code(201);
      return { ok: true, idempotent: false, offer: mapRow(inserted.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error, offerId }, 'Failed to counter listing offer');
      reply.code(500);
      return { ok: false, error: 'Failed to counter offer' };
    } finally {
      client.release();
    }
  });

  app.get('/listings/:listingId/offers', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { listingId } = z
      .object({ listingId: z.string().min(2).max(120) })
      .parse(request.params);
    const { status, limit } = listQuerySchema.parse(request.query ?? {});

    const listingResult = await db.query<{ seller_id: string }>(
      `SELECT seller_id FROM listings WHERE id = $1 LIMIT 1`,
      [listingId],
    );
    if (!listingResult.rowCount) {
      return { ok: true, offers: [] };
    }
    // Buyers see their own offers; sellers see all offers on their listing.
    const isSeller = listingResult.rows[0].seller_id === actorUserId;

    const params: unknown[] = [listingId];
    if (!isSeller) params.push(actorUserId);
    const buyerClause = isSeller ? '' : `AND buyer_id = $${params.length}`;
    let statusClause = '';
    if (status) {
      params.push(status);
      statusClause = `AND status = $${params.length}`;
    }
    params.push(limit);
    const limitClause = `LIMIT $${params.length}`;

    const result = await db.query<ListingOfferRow>(
      `SELECT id, listing_id, buyer_id, seller_id,
              offer_price_gbp::text, original_price_gbp::text,
              counter_round, status, expires_at::text,
              accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
              conversation_id, parent_offer_id, metadata, offered_by_user_id,
              created_at::text, updated_at::text
       FROM listing_offers
       WHERE listing_id = $1
         ${buyerClause}
         ${statusClause}
       ORDER BY created_at DESC
       ${limitClause}`,
      params,
    );

    return { ok: true, offers: result.rows.map(mapRow) };
  });

  app.get('/users/me/offers', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { status, limit } = listQuerySchema.parse(request.query ?? {});

    const params: unknown[] = [actorUserId];
    let statusClause = '';
    if (status) {
      params.push(status);
      statusClause = `AND status = $${params.length}`;
    }
    params.push(limit);
    const limitClause = `LIMIT $${params.length}`;

    const result = await db.query<ListingOfferRow>(
      `SELECT id, listing_id, buyer_id, seller_id,
              offer_price_gbp::text, original_price_gbp::text,
              counter_round, status, expires_at::text,
              accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
              conversation_id, parent_offer_id, metadata, offered_by_user_id,
              created_at::text, updated_at::text
       FROM listing_offers
       WHERE (buyer_id = $1 OR seller_id = $1)
         ${statusClause}
       ORDER BY updated_at DESC
       ${limitClause}`,
      params,
    );

    return { ok: true, offers: result.rows.map(mapRow) };
  });

  // ── Unknown-outcome reconciliation ────────────────────────────────
  //
  // GET /users/me/offers/lookup-by-key/:idempotencyKey
  //
  // When a client sends a POST /listing-offers but the response is lost
  // (network timeout), the outcome is ambiguous — the offer may or may not
  // have been created. This endpoint lets the client resolve the ambiguity
  // by looking up the offer by its idempotency key. Returns:
  //   - 200 { ok: true, status: 'acknowledged', offer } — the offer exists
  //   - 404 { ok: false, status: 'safe_to_retry' } — no offer with this key
  app.get('/users/me/offers/lookup-by-key/:idempotencyKey', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { idempotencyKey } = z.object({
      idempotencyKey: z.string().min(2).max(200),
    }).parse(request.params);

    const result = await db.query<ListingOfferRow>(
      `SELECT id, listing_id, buyer_id, seller_id,
              offer_price_gbp::text, original_price_gbp::text,
              counter_round, status, expires_at::text,
              accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
              conversation_id, parent_offer_id, metadata, offered_by_user_id,
              created_at::text, updated_at::text
       FROM listing_offers
       WHERE offered_by_user_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [actorUserId, idempotencyKey],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, status: 'safe_to_retry' as const };
    }

    return { ok: true as const, status: 'acknowledged' as const, offer: mapRow(result.rows[0]) };
  });

  app.post('/offers/:offerId/accept', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { offerId } = offerIdParamsSchema.parse(request.params);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const expiredOffers = await expireOverdueOffers(client);
      await appendOfferExpiredEvents(client, expiredOffers, request.id);

      const result = await client.query<{
        seller_id: string;
        buyer_id: string;
        listing_id: string;
        offer_price_gbp: string;
        status: string;
        expires_at: string;
        order_id: string | null;
        reservation_id: string | null;
        conversation_id: string | null;
        offered_by_user_id: string | null;
      }>(
        `SELECT seller_id, buyer_id, listing_id, offer_price_gbp::text,
                status, expires_at::text, order_id, reservation_id, conversation_id,
                offered_by_user_id
         FROM listing_offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Offer not found' };
      }
      const offer = result.rows[0];
      if (actorUserId !== offer.buyer_id && actorUserId !== offer.seller_id) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only an offer participant can accept this offer' };
      }
      if (offer.status === 'accepted' && offer.order_id && offer.reservation_id) {
        const reservation = await client.query<{
          status: string;
          expires_at: string;
        }>(
          `SELECT status, expires_at::text
           FROM listing_checkout_reservations
           WHERE id = $1
           LIMIT 1`,
          [offer.reservation_id],
        );
        await client.query('COMMIT');
        return {
          ok: true,
          offerId,
          status: 'accepted',
          idempotentReplay: true,
          checkout: {
            orderId: offer.order_id,
            reservationId: offer.reservation_id,
            reservationStatus: reservation.rows[0]?.status ?? 'active',
            expiresAt: reservation.rows[0]?.expires_at ?? null,
          },
        };
      }
      // Only the counterparty may accept — the participant who did NOT
      // author the current pending offer. `offered_by_user_id` records who
      // authored the latest pending offer in the negotiation (buyer for
      // the initial offer and buyer counters, seller for seller counters;
      // NULL only on pre-migration rows, which were all buyer-authored —
      // same `?? buyer_id` fallback the counter route and Smart Sell use).
      // Without this check a seller who countered could accept their own
      // counter, creating an order + reservation that binds the buyer at
      // the seller's price without buyer consent.
      if ((offer.offered_by_user_id ?? offer.buyer_id) === actorUserId) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'You cannot accept your own offer — the other participant must respond',
          code: 'OFFER_AUTHOR_CANNOT_ACCEPT',
        };
      }
      if (offer.status !== 'pending') {
        await client.query('ROLLBACK');
        // expireOverdueOffers already transitioned overdue rows to 'expired'
        // before this read — honour the 410 contract for them instead of the
        // generic 409 (the in-transaction expiry path below stays as the
        // sub-millisecond race fallback).
        if (offer.status === 'expired') {
          reply.code(410);
          return { ok: false, error: 'Offer has expired' };
        }
        reply.code(409);
        return { ok: false, error: `A ${offer.status} offer cannot be accepted` };
      }
      if (Date.parse(offer.expires_at) <= Date.now()) {
        await client.query(
          `UPDATE listing_offers SET status = 'expired', expired_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [offerId],
        );
        await appendDomainEvent(client, {
          aggregateType: 'offer',
          aggregateId: offerId,
          eventType: 'offer.expired',
          correlationId: request.id,
          deduplicationKey: `offer.expired:${offerId}`,
          payload: {
            offerId,
            listingId: offer.listing_id,
            buyerId: offer.buyer_id,
            sellerId: offer.seller_id,
            offerPriceGbp: Number(offer.offer_price_gbp),
            conversationId: offer.conversation_id,
            // Same ::text → ISO normalisation as appendOfferExpiredEvents —
            // the drain schema requires ISO-8601 (z.string().datetime()).
            expiresAt: new Date(offer.expires_at).toISOString(),
          },
        });
        await client.query('COMMIT');
        reply.code(410);
        return { ok: false, error: 'Offer has expired' };
      }

      // Same hard-pause rule as offer creation and buyer-authored counters:
      // a buyer accepting a seller-authored counter creates a new order +
      // reservation that binds the seller — an away seller cannot fulfil it.
      // When the SELLER is the actor (accepting a buyer's offer) they are
      // demonstrably active, so no gate applies — mirroring the counter
      // route's reasoning for seller-authored counters.
      if (actorUserId === offer.buyer_id) {
        const sellerAway = await fetchSellerAwayState(client, offer.seller_id);
        if (sellerAway.away) {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'This seller is away — their listings are paused until they return',
            code: 'SELLER_AWAY',
            sellerAwayUntil: sellerAway.awayUntil,
            awayMessage: sellerAway.awayMessage,
          };
        }
      }

      // Seller reach (lib/sellerReach.ts): accept is the order-bind point —
      // whichever participant accepts, the created order binds the buyer to
      // pay the seller, so a suspended seller's offer can never convert.
      // Gated for both actors: unlike sellerAway there is no "demonstrably
      // active" exemption — the restriction is on the seller's ability to
      // sell, not their presence in the app. This also covers Smart Sell
      // auto-accept, which routes through this endpoint.
      const acceptSellerReach = await getSellerReach(client, offer.seller_id);
      if (acceptSellerReach?.state === 'suspended') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'This seller is currently restricted — their listings are not available for purchase',
          code: 'SELLER_RESTRICTED',
        };
      }

      const listingResult = await client.query<{
        status: string;
      }>(
        `SELECT status
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [offer.listing_id],
      );
      if (!listingResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Listing not found' };
      }
      if (listingResult.rows[0].status !== 'active') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Listing is no longer available for an offer checkout' };
      }

      const subtotalGbp = Number(offer.offer_price_gbp);
      const platformChargeGbp = calculatePlatformChargeGbp(subtotalGbp);
      const totalGbp = Number((subtotalGbp + platformChargeGbp).toFixed(2));
      const orderId = `ord_offer_${crypto.randomUUID()}`;
      const reservationId = `lres_${crypto.randomUUID()}`;
      const reservationExpiresAt = new Date(
        Date.now() + OFFER_CHECKOUT_RESERVATION_MINUTES * 60_000,
      ).toISOString();
      const quoteSnapshot = {
        source: 'accepted_offer',
        offerId,
        listingId: offer.listing_id,
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
          offer.buyer_id,
          offer.seller_id,
          offer.listing_id,
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
          offerId,
          offer.listing_id,
          offer.buyer_id,
          offer.seller_id,
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
        [offerId, orderId, reservationId],
      );
      // Decline other pending offers on the same listing — once one is accepted
      // the rest are moot.
      const siblingResult = await client.query<{
        id: string;
        buyer_id: string;
        offer_price_gbp: string;
        conversation_id: string | null;
      }>(
        `UPDATE listing_offers
         SET status = 'declined', declined_at = NOW(), updated_at = NOW()
         WHERE listing_id = (SELECT listing_id FROM listing_offers WHERE id = $1)
           AND id <> $1 AND status = 'pending'
         RETURNING id, buyer_id, offer_price_gbp::text, conversation_id`,
        [offerId],
      );
      await client.query(
        `UPDATE listings
         SET status = 'paused', pause_source = 'checkout_reservation', updated_at = NOW()
         WHERE id = $1`,
        [offer.listing_id],
      );
      const acceptedEventId = await appendDomainEvent(client, {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.accepted',
        actorId: actorUserId,
        correlationId: request.id,
        idempotencyKey: offerId,
        deduplicationKey: `offer.accepted:${offerId}`,
        payload: {
          offerId,
          listingId: offer.listing_id,
          orderId,
          reservationId,
          buyerId: offer.buyer_id,
          sellerId: offer.seller_id,
          subtotalGbp,
          platformChargeGbp,
          totalGbp,
          reservationExpiresAt,
        },
      });
      // First-accept-wins: every sibling declined as a side effect gets its
      // own domain event so the losing buyers are notified.
      for (const sibling of siblingResult.rows) {
        await appendDomainEvent(client, {
          aggregateType: 'offer',
          aggregateId: sibling.id,
          eventType: 'offer.sibling_declined',
          actorId: actorUserId,
          correlationId: request.id,
          causationId: acceptedEventId,
          deduplicationKey: `offer.sibling_declined:${sibling.id}`,
          payload: {
            offerId: sibling.id,
            listingId: offer.listing_id,
            buyerId: sibling.buyer_id,
            sellerId: offer.seller_id,
            offerPriceGbp: Number(sibling.offer_price_gbp),
            conversationId: sibling.conversation_id,
            acceptedOfferId: offerId,
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
          actorUserId,
          `order.created:${orderId}`,
          JSON.stringify({ offerId, reservationId, quoteHash }),
          `payment.required:${orderId}`,
          JSON.stringify({ expiresAt: reservationExpiresAt, totalGbp }),
        ],
      );
      await client.query('COMMIT');
      // In-thread commerce card: the accepted offer placed an order. The emit
      // resolves the thread via listing_offers.conversation_id — the same
      // thread the offer was negotiated in.
      await emitOrderCommerceCard({
        orderId,
        stateType: 'order_placed',
        log: request.log,
      });
      try {
        await enqueueOutboxDrain();
      } catch (error) {
        // The event is already durable. The periodic drain will retry even
        // when Redis is temporarily unavailable at commit time.
        app.log.error({ err: error, offerId }, 'Failed to enqueue offer outbox drain');
      }
      return {
        ok: true,
        offerId,
        status: 'accepted',
        idempotentReplay: false,
        checkout: {
          orderId,
          reservationId,
          reservationStatus: 'active',
          expiresAt: reservationExpiresAt,
          subtotalGbp,
          platformChargeGbp,
          totalGbp,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to accept listing offer');
      reply.code(500);
      return { ok: false, error: 'Failed to accept offer' };
    } finally {
      client.release();
    }
  });

  app.post('/offers/:offerId/decline', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { offerId } = offerIdParamsSchema.parse(request.params);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const expiredOffers = await expireOverdueOffers(client);
      await appendOfferExpiredEvents(client, expiredOffers, request.id);

      const result = await client.query<{
        seller_id: string;
        buyer_id: string;
        listing_id: string;
        offer_price_gbp: string;
        conversation_id: string | null;
        status: string;
      }>(
        `SELECT seller_id, buyer_id, listing_id, offer_price_gbp::text,
                conversation_id, status
         FROM listing_offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Offer not found' };
      }
      const offer = result.rows[0];
      if (offer.seller_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the seller can decline this offer' };
      }
      if (offer.status !== 'pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: `A ${offer.status} offer cannot be declined` };
      }

      await client.query(
        `UPDATE listing_offers
         SET status = 'declined', declined_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [offerId],
      );
      await appendDomainEvent(client, {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.declined',
        actorId: actorUserId,
        correlationId: request.id,
        deduplicationKey: `offer.declined:${offerId}`,
        payload: {
          offerId,
          listingId: offer.listing_id,
          buyerId: offer.buyer_id,
          sellerId: offer.seller_id,
          offerPriceGbp: Number(offer.offer_price_gbp),
          conversationId: offer.conversation_id,
        },
      });
      await client.query('COMMIT');
      try {
        await enqueueOutboxDrain();
      } catch (error) {
        // The event is already durable. The periodic drain will retry even
        // when Redis is temporarily unavailable at commit time.
        app.log.error({ err: error, offerId }, 'Failed to enqueue offer outbox drain');
      }
      return { ok: true, offerId, status: 'declined' };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to decline listing offer');
      reply.code(500);
      return { ok: false, error: 'Failed to decline offer' };
    } finally {
      client.release();
    }
  });

  app.post('/offers/:offerId/cancel', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { offerId } = offerIdParamsSchema.parse(request.params);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        buyer_id: string;
        seller_id: string;
        listing_id: string;
        offer_price_gbp: string;
        conversation_id: string | null;
        status: string;
      }>(
        `SELECT buyer_id, seller_id, listing_id, offer_price_gbp::text,
                conversation_id, status
         FROM listing_offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Offer not found' };
      }
      const offer = result.rows[0];
      if (offer.buyer_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the buyer can cancel this offer' };
      }
      if (offer.status !== 'pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: `A ${offer.status} offer cannot be cancelled` };
      }

      await client.query(
        `UPDATE listing_offers
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [offerId],
      );
      await appendDomainEvent(client, {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.cancelled',
        actorId: actorUserId,
        correlationId: request.id,
        deduplicationKey: `offer.cancelled:${offerId}`,
        payload: {
          offerId,
          listingId: offer.listing_id,
          buyerId: offer.buyer_id,
          sellerId: offer.seller_id,
          offerPriceGbp: Number(offer.offer_price_gbp),
          conversationId: offer.conversation_id,
        },
      });
      await client.query('COMMIT');
      try {
        await enqueueOutboxDrain();
      } catch (error) {
        // The event is already durable. The periodic drain will retry even
        // when Redis is temporarily unavailable at commit time.
        app.log.error({ err: error, offerId }, 'Failed to enqueue offer outbox drain');
      }
      return { ok: true, offerId, status: 'cancelled' };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to cancel listing offer');
      reply.code(500);
      return { ok: false, error: 'Failed to cancel offer' };
    } finally {
      client.release();
    }
  });

  /**
   * Server-side sweep endpoint. Intended to be called by a scheduled worker
   * (cron / BullMQ). Marks all pending offers past their expires_at as
   * expired. Returns the count so the worker can decide whether to enqueue
   * notifications.
   */
  app.post('/offers/sweep-expired', async (request, reply) => {
    // Only allow authenticated callers — in practice this is invoked by an
    // internal worker using a service token. Route-level rate limiting plus
    // auth keeps it from being a public DoS vector.
    if (!authorizeInternalServiceRequest(request)) {
      reply.code(401);
      return {
        ok: false,
        error: 'A valid internal service identity is required',
        code: 'INTERNAL_SERVICE_AUTH_REQUIRED',
      };
    }
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const expiredOffers = await expireOverdueOffers(client);
      await appendOfferExpiredEvents(client, expiredOffers, request.id);
      const count = expiredOffers.length;
      // Pass 1 — cancel 'created' orders bound to expired reservations.
      // Each cancel runs the shared airtight guard (row lock → post-lock
      // in-flight check → guarded UPDATE): an order whose payment intent
      // is still live is skipped, so a late provider 'succeeded' can still
      // settle into a payable order instead of capturing money against a
      // cancelled one. The reconcile_listing_checkout_from_order trigger
      // flips each bound reservation to 'cancelled' and restores the
      // listing only when the pause is reservation-owned (pause_source,
      // migration 305).
      const expiredOrderCandidates = await client.query<{
        order_id: string;
        listing_id: string;
      }>(
        `SELECT r.order_id, r.listing_id
         FROM listing_checkout_reservations r
         JOIN orders o ON o.id = r.order_id
         WHERE r.status = 'active'
           AND r.expires_at <= NOW()
           AND o.status = 'created'`,
      );
      const cancelledOrders: Array<{ order_id: string; listing_id: string }> = [];
      for (const candidate of expiredOrderCandidates.rows) {
        const outcome = await cancelOrderOnReservationExpiry(client, candidate.order_id);
        if (outcome === 'cancelled') {
          cancelledOrders.push(candidate);
        }
      }

      // Pass 2 — drifted reservations: the bound order is already terminal
      // or missing, so the trigger can no longer reach them. Expire the
      // reservation row and restore the listing under the same provenance
      // and exclusivity conditions the trigger enforces. Reservations whose
      // 'created' order is shielded by an in-flight intent are skipped by
      // the EXISTS clause and stay 'active' for the reconciler.
      const expiredReservations = await client.query<{
        listing_id: string;
        order_id: string;
      }>(
        `UPDATE listing_checkout_reservations r
         SET status = 'expired', updated_at = NOW()
         WHERE r.status = 'active'
           AND r.expires_at <= NOW()
           AND NOT EXISTS (
             SELECT 1
             FROM orders o
             WHERE o.id = r.order_id
               AND o.status = 'created'
           )
         RETURNING r.listing_id, r.order_id`,
      );

      if (expiredReservations.rowCount) {
        const listingIds = expiredReservations.rows.map((row) => row.listing_id);
        await client.query(
          `UPDATE listings l
           SET status = 'active', pause_source = NULL, updated_at = NOW()
           WHERE l.id = ANY($1::text[])
             AND l.status = 'paused'
             AND l.pause_source = 'checkout_reservation'
             AND NOT EXISTS (
               SELECT 1
               FROM listing_checkout_reservations r
               WHERE r.listing_id = l.id AND r.status = 'active'
             )`,
          [listingIds],
        );
      }
      await client.query('COMMIT');
      // In-thread commerce cards: each expired reservation cancelled its
      // pending order. The emit re-verifies the persisted status, so a
      // reservation whose order was never actually cancelled no-ops.
      for (const cancelled of cancelledOrders) {
        await emitOrderCommerceCard({
          orderId: cancelled.order_id,
          stateType: 'order_cancelled',
          log: request.log,
        });
      }
      for (const expired of expiredReservations.rows) {
        await emitOrderCommerceCard({
          orderId: expired.order_id,
          stateType: 'order_cancelled',
          log: request.log,
        });
      }
      if (count > 0) {
        try {
          await enqueueOutboxDrain();
        } catch (error) {
          // The events are already durable. The periodic drain will retry
          // even when Redis is temporarily unavailable at commit time.
          app.log.error({ err: error }, 'Failed to enqueue offer outbox drain');
        }
      }
      return {
        ok: true,
        expiredCount: count,
        expiredCheckoutReservations: expiredReservations.rowCount ?? 0,
        expiredReservationOrdersCancelled: cancelledOrders.length,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to sweep expired offers and checkout reservations');
      reply.code(500);
      return { ok: false, error: 'Failed to sweep expired offers' };
    } finally {
      client.release();
    }
  });
};
