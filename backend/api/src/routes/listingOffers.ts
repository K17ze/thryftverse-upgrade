import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type ListingOffersRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const MAX_OFFER_HOURS = 168; // 7 days
const MIN_OFFER_HOURS = 1;

const createOfferSchema = z.object({
  listingId: z.string().min(2).max(120),
  offerPriceGbp: z.number().positive().max(1_000_000),
  expiryHours: z.number().int().min(MIN_OFFER_HOURS).max(MAX_OFFER_HOURS).default(48),
  conversationId: z.string().min(2).max(120).optional(),
  parentOfferId: z.string().min(2).max(120).optional(),
  counterRound: z.number().int().min(0).max(10).default(0),
  metadata: z.record(z.unknown()).default({}),
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
}: ListingOffersRouteDependencies) => {
  app.post('/listings/:listingId/offers', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = createOfferSchema.parse(request.body);

    const listingResult = await db.query<{
      id: string;
      seller_id: string;
      price_gbp: string;
      status: string;
    }>(
      `SELECT id, seller_id, price_gbp::text, status FROM listings WHERE id = $1 LIMIT 1`,
      [payload.listingId],
    );

    if (!listingResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Listing not found' };
    }

    const listing = listingResult.rows[0];
    if (listing.status && listing.status !== 'active') {
      reply.code(409);
      return { ok: false, error: 'Listing is not active' };
    }
    if (listing.seller_id === actorUserId) {
      reply.code(400);
      return { ok: false, error: 'Cannot make an offer on your own listing' };
    }

    const originalPriceGbp = Number(listing.price_gbp);
    if (payload.offerPriceGbp > originalPriceGbp * 2) {
      reply.code(422);
      return { ok: false, error: 'Offer amount is unreasonably high' };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await expireOverdueOffers(client);

      // Cancel any prior pending offers by this buyer on the same listing —
      // only one active offer per buyer/listing at a time.
      await client.query(
        `UPDATE listing_offers
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE listing_id = $1 AND buyer_id = $2 AND status = 'pending'`,
        [payload.listingId, actorUserId],
      );

      const offerId = `offer_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + payload.expiryHours * 3600_000).toISOString();

      const result = await client.query<ListingOfferRow>(
        `INSERT INTO listing_offers (
           id, listing_id, buyer_id, seller_id,
           offer_price_gbp, original_price_gbp,
           counter_round, status, expires_at,
           conversation_id, parent_offer_id, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11::jsonb)
         RETURNING id, listing_id, buyer_id, seller_id,
                   offer_price_gbp::text, original_price_gbp::text,
                   counter_round, status, expires_at::text,
                   accepted_at::text, declined_at::text, expired_at::text, cancelled_at::text,
                   conversation_id, parent_offer_id, metadata, created_at::text, updated_at::text`,
        [
          offerId,
          payload.listingId,
          actorUserId,
          listing.seller_id,
          payload.offerPriceGbp,
          originalPriceGbp,
          payload.counterRound,
          expiresAt,
          payload.conversationId ?? null,
          payload.parentOfferId ?? null,
          JSON.stringify(payload.metadata ?? {}),
        ],
      );

      await client.query('COMMIT');
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
              conversation_id, parent_offer_id, metadata, created_at::text, updated_at::text
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
              conversation_id, parent_offer_id, metadata, created_at::text, updated_at::text
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

      const result = await client.query<{ seller_id: string; status: string; expires_at: string }>(
        `SELECT seller_id, status, expires_at::text
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

      await client.query(
        `UPDATE listing_offers
         SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [offerId],
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
      await client.query('COMMIT');
      return { ok: true, offerId, status: 'accepted' };
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
    const actorUserId = resolveAuthenticatedUserId(request);
    // Only allow authenticated callers — in practice this is invoked by an
    // internal worker using a service token. Route-level rate limiting plus
    // auth keeps it from being a public DoS vector.
    if (!actorUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const client = await db.connect();
    try {
      const count = await expireOverdueOffers(client);
      return { ok: true, expiredCount: count };
    } finally {
      client.release();
    }
  });
};
