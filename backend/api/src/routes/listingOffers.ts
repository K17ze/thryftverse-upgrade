import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { appendDomainEvent } from '../lib/domainOutbox.js';

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

/**
 * Marks offers past their `expires_at` as expired. Called inline before any
 * offer read/write so the server-authoritative expiry is always reflected
 * without needing a separate sweep job for correctness. A background sweep
 * can additionally drive notifications.
 */
async function expireOverdueOffers(client: { query: Pool['query'] }): Promise<number> {
  const result = await client.query(
    `UPDATE listing_offers
     SET status = 'expired', expired_at = NOW(), updated_at = NOW()
     WHERE status = 'pending' AND expires_at <= NOW()
     RETURNING id`,
  );
  return result.rowCount ?? 0;
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
      await expireOverdueOffers(client);
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
      const originalPriceGbp = Number(listing.price_gbp);
      if (payload.offerPriceGbp > originalPriceGbp * 2) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Offer amount is unreasonably high' };
      }

      // Cancel any prior pending offers by this buyer on the same listing —
      // only one active offer per buyer/listing at a time.
      await client.query(
        `UPDATE listing_offers
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE listing_id = $1 AND buyer_id = $2 AND status = 'pending'`,
        [listingId, actorUserId],
      );

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

      await client.query('COMMIT');
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
      await expireOverdueOffers(client);
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

  app.post('/offers/:offerId/accept', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { offerId } = offerIdParamsSchema.parse(request.params);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await expireOverdueOffers(client);

      const result = await client.query<{
        seller_id: string;
        buyer_id: string;
        listing_id: string;
        offer_price_gbp: string;
        status: string;
        expires_at: string;
        order_id: string | null;
        reservation_id: string | null;
      }>(
        `SELECT seller_id, buyer_id, listing_id, offer_price_gbp::text,
                status, expires_at::text, order_id, reservation_id
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
        return { ok: false, error: 'Only the seller can accept this offer' };
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
      if (offer.status !== 'pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: `A ${offer.status} offer cannot be accepted` };
      }
      if (Date.parse(offer.expires_at) <= Date.now()) {
        await client.query(
          `UPDATE listing_offers SET status = 'expired', expired_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [offerId],
        );
        await client.query('COMMIT');
        reply.code(410);
        return { ok: false, error: 'Offer has expired' };
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
      await client.query(
        `UPDATE listing_offers
         SET status = 'declined', declined_at = NOW(), updated_at = NOW()
         WHERE listing_id = (SELECT listing_id FROM listing_offers WHERE id = $1)
           AND id <> $1 AND status = 'pending'`,
        [offerId],
      );
      await client.query(
        `UPDATE listings
         SET status = 'paused', updated_at = NOW()
         WHERE id = $1`,
        [offer.listing_id],
      );
      await appendDomainEvent(client, {
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
      await expireOverdueOffers(client);

      const result = await client.query<{ seller_id: string; status: string }>(
        `SELECT seller_id, status FROM listing_offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Offer not found' };
      }
      if (result.rows[0].seller_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the seller can decline this offer' };
      }
      if (result.rows[0].status !== 'pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: `A ${result.rows[0].status} offer cannot be declined` };
      }

      await client.query(
        `UPDATE listing_offers
         SET status = 'declined', declined_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [offerId],
      );
      await client.query('COMMIT');
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
      const result = await client.query<{ buyer_id: string; status: string }>(
        `SELECT buyer_id, status FROM listing_offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Offer not found' };
      }
      if (result.rows[0].buyer_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the buyer can cancel this offer' };
      }
      if (result.rows[0].status !== 'pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: `A ${result.rows[0].status} offer cannot be cancelled` };
      }

      await client.query(
        `UPDATE listing_offers
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [offerId],
      );
      await client.query('COMMIT');
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
      const count = await expireOverdueOffers(client);
      const expiredReservations = await client.query<{
        listing_id: string;
        order_id: string;
      }>(
        `UPDATE listing_checkout_reservations
         SET status = 'expired', updated_at = NOW()
         WHERE status = 'active'
           AND expires_at <= NOW()
           AND NOT EXISTS (
             SELECT 1
             FROM orders checkout_order
             JOIN payment_intents intent
               ON intent.id = checkout_order.payment_intent_id
             WHERE checkout_order.id = listing_checkout_reservations.order_id
               AND (
                 intent.status = 'processing'
                 OR (
                   intent.status = 'requires_confirmation'
                   AND intent.updated_at > NOW() - INTERVAL '2 hours'
                 )
               )
           )
         RETURNING listing_id, order_id`,
      );

      if (expiredReservations.rowCount) {
        const orderIds = expiredReservations.rows.map((row) => row.order_id);
        const listingIds = expiredReservations.rows.map((row) => row.listing_id);
        await client.query(
          `UPDATE orders
           SET status = 'cancelled', updated_at = NOW()
           WHERE id = ANY($1::text[]) AND status = 'created'`,
          [orderIds],
        );
        await client.query(
          `UPDATE listings l
           SET status = 'active', updated_at = NOW()
           WHERE l.id = ANY($1::text[])
             AND l.status = 'paused'
             AND NOT EXISTS (
               SELECT 1
               FROM listing_checkout_reservations r
               WHERE r.listing_id = l.id AND r.status = 'active'
             )`,
          [listingIds],
        );
      }
      await client.query('COMMIT');
      return {
        ok: true,
        expiredCount: count,
        expiredCheckoutReservations: expiredReservations.rowCount ?? 0,
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
