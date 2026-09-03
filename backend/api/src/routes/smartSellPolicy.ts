import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { appendDomainEvent } from '../lib/domainOutbox.js';

type SmartSellPolicyRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
  calculatePlatformChargeGbp: (subtotalGbp: number) => number;
  authorizeInternalServiceRequest: (request: FastifyRequest) => boolean;
  enqueueOutboxDrain: () => Promise<void>;
};

const SMART_SELL_POLICY_VERSION = 'smart-sell-v1-2026-08-25.1';

const createPolicySchema = z.object({
  listingId: z.string().min(2).max(120),
  floorPriceGbp: z.number().positive().max(1_000_000),
  maxCounterRounds: z.number().int().min(0).max(10).default(3),
  counterStrategy: z.enum(['firm', 'gradual']).default('gradual'),
  idempotencyKey: z.string().min(8).max(140).optional(),
});

const updatePolicySchema = z.object({
  floorPriceGbp: z.number().positive().max(1_000_000).optional(),
  maxCounterRounds: z.number().int().min(0).max(10).optional(),
  counterStrategy: z.enum(['firm', 'gradual']).optional(),
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
  idempotencyKey: z.string().min(8).max(140).optional(),
});

const listingIdParamsSchema = z.object({
  listingId: z.string().min(2).max(120),
});

const policyIdParamsSchema = z.object({
  policyId: z.string().min(2).max(120),
});

type SmartSellPolicyRow = {
  id: string;
  listing_id: string;
  seller_id: string;
  floor_price_gbp: string;
  listing_price_gbp: string;
  status: string;
  policy_version: number;
  version: number;
  max_counter_rounds: number;
  counter_strategy: string;
  created_at: string;
  updated_at: string;
  paused_at: string | null;
  cancelled_at: string | null;
};

type SmartSellDecisionRow = {
  id: string;
  policy_id: string;
  listing_id: string;
  offer_id: string;
  seller_id: string;
  buyer_id: string;
  decision: string;
  reason: string;
  offer_price_gbp: string;
  counter_price_gbp: string | null;
  net_proceeds_gbp: string;
  platform_fee_gbp: string;
  gross_sale_gbp: string;
  policy_version: number;
  counter_round: number;
  created_at: string;
};

function mapPolicyRow(row: SmartSellPolicyRow) {
  return {
    id: row.id,
    listingId: row.listing_id,
    sellerId: row.seller_id,
    floorPriceGbp: Number(row.floor_price_gbp),
    listingPriceGbp: Number(row.listing_price_gbp),
    status: row.status,
    policyVersion: row.policy_version,
    version: row.version,
    maxCounterRounds: row.max_counter_rounds,
    counterStrategy: row.counter_strategy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pausedAt: row.paused_at,
    cancelledAt: row.cancelled_at,
  };
}

function mapDecisionRow(row: SmartSellDecisionRow) {
  return {
    id: row.id,
    policyId: row.policy_id,
    listingId: row.listing_id,
    offerId: row.offer_id,
    sellerId: row.seller_id,
    buyerId: row.buyer_id,
    decision: row.decision,
    reason: row.reason,
    offerPriceGbp: Number(row.offer_price_gbp),
    counterPriceGbp: row.counter_price_gbp ? Number(row.counter_price_gbp) : null,
    netProceedsGbp: Number(row.net_proceeds_gbp),
    platformFeeGbp: Number(row.platform_fee_gbp),
    grossSaleGbp: Number(row.gross_sale_gbp),
    policyVersion: row.policy_version,
    counterRound: row.counter_round,
    createdAt: row.created_at,
  };
}

/**
 * Compute the net-proceeds breakdown for a given sale price.
 * Returns gross, platform fee, and net proceeds in GBP.
 */
function computeNetProceeds(
  salePriceGbp: number,
  calculatePlatformChargeGbp: (subtotal: number) => number,
) {
  const grossSaleGbp = Number(salePriceGbp.toFixed(2));
  const platformFeeGbp = calculatePlatformChargeGbp(grossSaleGbp);
  const netProceedsGbp = Number((grossSaleGbp - platformFeeGbp).toFixed(2));
  return { grossSaleGbp, platformFeeGbp, netProceedsGbp };
}

/**
 * Compute the counter-offer price using the policy's strategy.
 * - 'firm': always counter at the floor price.
 * - 'gradual': counter at the midpoint between the buyer's offer and the
 *   floor, rounded to the nearest 50p, but never below the floor.
 */
function computeCounterPrice(
  buyerOfferGbp: number,
  floorPriceGbp: number,
  listingPriceGbp: number,
  strategy: 'firm' | 'gradual',
  counterRound: number,
): number {
  if (strategy === 'firm' || counterRound === 0) {
    // First counter is always at floor regardless of strategy — this is the
    // "anchor" that tells the buyer the seller's minimum.
    return floorPriceGbp;
  }
  // Gradual: move toward floor as rounds increase.
  // Round 1: midpoint between offer and listing price (but >= floor)
  // Round 2: midpoint between offer and floor
  // Round 3+: floor
  if (counterRound >= 3) {
    return floorPriceGbp;
  }
  const anchor = counterRound === 1 ? listingPriceGbp : floorPriceGbp;
  const midpoint = (buyerOfferGbp + anchor) / 2;
  const rounded = Math.round(midpoint * 2) / 2; // nearest 50p
  return Number(Math.max(rounded, floorPriceGbp).toFixed(2));
}

export const registerSmartSellPolicyRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
  calculatePlatformChargeGbp,
  authorizeInternalServiceRequest,
  enqueueOutboxDrain,
}: SmartSellPolicyRouteDependencies) => {
  // ── POST /smart-sell/policies — create a Smart Sell policy for a listing ──
  app.post('/smart-sell/policies', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = createPolicySchema.parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock the listing to verify ownership and get the current price.
      const listingResult = await client.query<{
        seller_id: string;
        price_gbp: string;
        status: string;
      }>(
        `SELECT seller_id, price_gbp::text, status
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.listingId],
      );
      if (!listingResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Listing not found' };
      }
      const listing = listingResult.rows[0];
      if (listing.seller_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the listing owner can create a Smart Sell policy' };
      }
      if (listing.status !== 'active') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Listing is not active' };
      }

      const listingPriceGbp = Number(listing.price_gbp);
      if (payload.floorPriceGbp > listingPriceGbp) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Floor price cannot exceed the listing price' };
      }
      if (payload.floorPriceGbp < listingPriceGbp * 0.1) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Floor price must be at least 10% of the listing price' };
      }

      // Check for an existing policy on this listing.
      const existing = await client.query<SmartSellPolicyRow>(
        `SELECT id, listing_id, seller_id, floor_price_gbp::text, listing_price_gbp::text,
                status, policy_version, version, max_counter_rounds, counter_strategy,
                created_at::text, updated_at::text, paused_at::text, cancelled_at::text
         FROM smart_sell_policies
         WHERE listing_id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.listingId],
      );
      if (existing.rowCount) {
        const existingPolicy = existing.rows[0];
        if (existingPolicy.status === 'cancelled') {
          // Revive a cancelled policy by replacing it.
          await client.query(
            `DELETE FROM smart_sell_policies WHERE id = $1`,
            [existingPolicy.id],
          );
        } else {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'A Smart Sell policy already exists for this listing',
            code: 'POLICY_EXISTS',
            policy: mapPolicyRow(existingPolicy),
          };
        }
      }

      const policyId = `ssp_${crypto.randomUUID()}`;
      const result = await client.query<SmartSellPolicyRow>(
        `INSERT INTO smart_sell_policies (
           id, listing_id, seller_id,
           floor_price_gbp, listing_price_gbp,
           status, policy_version, version,
           max_counter_rounds, counter_strategy
         )
         VALUES ($1, $2, $3, $4, $5, 'active', 1, 1, $6, $7)
         RETURNING id, listing_id, seller_id, floor_price_gbp::text, listing_price_gbp::text,
                   status, policy_version, version, max_counter_rounds, counter_strategy,
                   created_at::text, updated_at::text, paused_at::text, cancelled_at::text`,
        [
          policyId,
          payload.listingId,
          actorUserId,
          payload.floorPriceGbp,
          listingPriceGbp,
          payload.maxCounterRounds,
          payload.counterStrategy,
        ],
      );

      // Compute the net proceeds at floor price so the seller sees the
      // minimum they would receive.
      const floorNet = computeNetProceeds(payload.floorPriceGbp, calculatePlatformChargeGbp);

      await appendDomainEvent(client, {
        aggregateType: 'smart_sell_policy',
        aggregateId: policyId,
        eventType: 'smart_sell_policy.created',
        actorId: actorUserId,
        correlationId: request.id,
        idempotencyKey: payload.idempotencyKey ?? null,
        deduplicationKey: `smart_sell_policy.created:${policyId}`,
        payload: {
          policyId,
          listingId: payload.listingId,
          sellerId: actorUserId,
          floorPriceGbp: payload.floorPriceGbp,
          listingPriceGbp,
          maxCounterRounds: payload.maxCounterRounds,
          counterStrategy: payload.counterStrategy,
          floorNetProceedsGbp: floorNet.netProceedsGbp,
          floorPlatformFeeGbp: floorNet.platformFeeGbp,
          policyVersion: SMART_SELL_POLICY_VERSION,
        },
      });

      await client.query('COMMIT');
      try {
        await enqueueOutboxDrain();
      } catch (error) {
        app.log.error({ err: error, policyId }, 'Failed to enqueue Smart Sell policy outbox');
      }
      reply.code(201);
      return {
        ok: true,
        policy: mapPolicyRow(result.rows[0]),
        floorNetProceeds: floorNet,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to create Smart Sell policy');
      reply.code(500);
      return { ok: false, error: 'Failed to create Smart Sell policy' };
    } finally {
      client.release();
    }
  });

  // ── GET /smart-sell/policies/:policyId — get a single policy ──────────────
  app.get('/smart-sell/policies/:policyId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { policyId } = policyIdParamsSchema.parse(request.params);

    const result = await db.query<SmartSellPolicyRow>(
      `SELECT id, listing_id, seller_id, floor_price_gbp::text, listing_price_gbp::text,
              status, policy_version, version, max_counter_rounds, counter_strategy,
              created_at::text, updated_at::text, paused_at::text, cancelled_at::text
       FROM smart_sell_policies
       WHERE id = $1
       LIMIT 1`,
      [policyId],
    );
    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Smart Sell policy not found' };
    }
    if (result.rows[0].seller_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Only the policy owner can view this policy' };
    }
    return { ok: true, policy: mapPolicyRow(result.rows[0]) };
  });

  // ── GET /smart-sell/policies — list the seller's policies ──────────────────
  app.get('/smart-sell/policies', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { status } = z
      .object({
        status: z.enum(['active', 'paused', 'cancelled']).optional(),
      })
      .parse(request.query ?? {});

    const params: unknown[] = [actorUserId];
    let statusClause = '';
    if (status) {
      params.push(status);
      statusClause = `AND status = $${params.length}`;
    }

    const result = await db.query<SmartSellPolicyRow>(
      `SELECT id, listing_id, seller_id, floor_price_gbp::text, listing_price_gbp::text,
              status, policy_version, version, max_counter_rounds, counter_strategy,
              created_at::text, updated_at::text, paused_at::text, cancelled_at::text
       FROM smart_sell_policies
       WHERE seller_id = $1
         ${statusClause}
       ORDER BY updated_at DESC
       LIMIT 100`,
      params,
    );

    return { ok: true, policies: result.rows.map(mapPolicyRow) };
  });

  // ── PATCH /smart-sell/policies/:policyId — update a policy ────────────────
  app.patch('/smart-sell/policies/:policyId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { policyId } = policyIdParamsSchema.parse(request.params);
    const payload = updatePolicySchema.parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<SmartSellPolicyRow>(
        `SELECT id, listing_id, seller_id, floor_price_gbp::text, listing_price_gbp::text,
                status, policy_version, version, max_counter_rounds, counter_strategy,
                created_at::text, updated_at::text, paused_at::text, cancelled_at::text
         FROM smart_sell_policies
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [policyId],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Smart Sell policy not found' };
      }
      const policy = result.rows[0];
      if (policy.seller_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the policy owner can update this policy' };
      }
      if (policy.status === 'cancelled') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'A cancelled policy cannot be updated' };
      }

      // Validate floor price if updating it.
      if (payload.floorPriceGbp !== undefined) {
        const listingPriceGbp = Number(policy.listing_price_gbp);
        if (payload.floorPriceGbp > listingPriceGbp) {
          await client.query('ROLLBACK');
          reply.code(422);
          return { ok: false, error: 'Floor price cannot exceed the listing price' };
        }
        if (payload.floorPriceGbp < listingPriceGbp * 0.1) {
          await client.query('ROLLBACK');
          reply.code(422);
          return { ok: false, error: 'Floor price must be at least 10% of the listing price' };
        }
      }

      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (payload.floorPriceGbp !== undefined) {
        params.push(payload.floorPriceGbp);
        updates.push(`floor_price_gbp = $${paramIdx++}`);
      }
      if (payload.maxCounterRounds !== undefined) {
        params.push(payload.maxCounterRounds);
        updates.push(`max_counter_rounds = $${paramIdx++}`);
      }
      if (payload.counterStrategy !== undefined) {
        params.push(payload.counterStrategy);
        updates.push(`counter_strategy = $${paramIdx++}`);
      }
      if (payload.status !== undefined) {
        params.push(payload.status);
        updates.push(`status = $${paramIdx++}`);
        if (payload.status === 'paused') {
          params.push(new Date().toISOString());
          updates.push(`paused_at = $${paramIdx++}`);
        } else if (payload.status === 'cancelled') {
          params.push(new Date().toISOString());
          updates.push(`cancelled_at = $${paramIdx++}`);
        } else if (payload.status === 'active') {
          updates.push(`paused_at = NULL`);
        }
      }

      // Increment policy_version if any negotiation parameter changed.
      const negotiationParamChanged =
        payload.floorPriceGbp !== undefined ||
        payload.maxCounterRounds !== undefined ||
        payload.counterStrategy !== undefined;
      if (negotiationParamChanged) {
        updates.push(`policy_version = policy_version + 1`);
      }

      // Optimistic concurrency: increment version.
      updates.push(`version = version + 1`);
      updates.push(`updated_at = NOW()`);

      params.push(policyId);
      const updateResult = await client.query<SmartSellPolicyRow>(
        `UPDATE smart_sell_policies
         SET ${updates.join(', ')}
         WHERE id = $${paramIdx}
         RETURNING id, listing_id, seller_id, floor_price_gbp::text, listing_price_gbp::text,
                   status, policy_version, version, max_counter_rounds, counter_strategy,
                   created_at::text, updated_at::text, paused_at::text, cancelled_at::text`,
        params,
      );

      const updatedPolicy = updateResult.rows[0];
      const eventType =
        payload.status === 'paused' ? 'smart_sell_policy.paused' :
        payload.status === 'cancelled' ? 'smart_sell_policy.cancelled' :
        payload.status === 'active' ? 'smart_sell_policy.resumed' :
        'smart_sell_policy.updated';

      await appendDomainEvent(client, {
        aggregateType: 'smart_sell_policy',
        aggregateId: policyId,
        eventType,
        actorId: actorUserId,
        correlationId: request.id,
        idempotencyKey: payload.idempotencyKey ?? null,
        deduplicationKey: `${eventType}:${policyId}:${updatedPolicy.version}`,
        payload: {
          policyId,
          listingId: policy.listing_id,
          sellerId: actorUserId,
          changes: {
            floorPriceGbp: payload.floorPriceGbp,
            maxCounterRounds: payload.maxCounterRounds,
            counterStrategy: payload.counterStrategy,
            status: payload.status,
          },
          newPolicyVersion: updatedPolicy.policy_version,
        },
      });

      await client.query('COMMIT');
      try {
        await enqueueOutboxDrain();
      } catch (error) {
        app.log.error({ err: error, policyId }, 'Failed to enqueue Smart Sell policy update outbox');
      }
      return { ok: true, policy: mapPolicyRow(updatedPolicy) };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to update Smart Sell policy');
      reply.code(500);
      return { ok: false, error: 'Failed to update Smart Sell policy' };
    } finally {
      client.release();
    }
  });

  // ── GET /smart-sell/policies/:policyId/decisions — decision history ────────
  app.get('/smart-sell/policies/:policyId/decisions', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { policyId } = policyIdParamsSchema.parse(request.params);
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
      .parse(request.query ?? {});

    // Verify ownership.
    const policyResult = await db.query<{ seller_id: string }>(
      `SELECT seller_id FROM smart_sell_policies WHERE id = $1 LIMIT 1`,
      [policyId],
    );
    if (!policyResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Smart Sell policy not found' };
    }
    if (policyResult.rows[0].seller_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Only the policy owner can view decisions' };
    }

    const result = await db.query<SmartSellDecisionRow>(
      `SELECT id, policy_id, listing_id, offer_id, seller_id, buyer_id,
              decision, reason, offer_price_gbp::text, counter_price_gbp::text,
              net_proceeds_gbp::text, platform_fee_gbp::text, gross_sale_gbp::text,
              policy_version, counter_round, created_at::text
       FROM smart_sell_decisions
       WHERE policy_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [policyId, limit],
    );

    return { ok: true, decisions: result.rows.map(mapDecisionRow) };
  });

  // ── POST /smart-sell/evaluate — internal worker endpoint ───────────────────
  //
  // Called by a scheduled worker when a new offer is received on a listing
  // that has an active Smart Sell policy. The worker passes the offer ID;
  // this endpoint locks the offer and the policy, evaluates the decision,
  // records it in the audit log, and executes the decision (accept, counter,
  // or escalate). If the policy is paused, no decision is made.
  //
  // This endpoint requires internal service authentication.
  app.post('/smart-sell/evaluate', async (request, reply) => {
    if (!authorizeInternalServiceRequest(request)) {
      reply.code(401);
      return {
        ok: false,
        error: 'A valid internal service identity is required',
        code: 'INTERNAL_SERVICE_AUTH_REQUIRED',
      };
    }

    const { offerId } = z
      .object({ offerId: z.string().min(2).max(120) })
      .parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock the offer.
      const offerResult = await client.query<{
        id: string;
        listing_id: string;
        seller_id: string;
        buyer_id: string;
        offer_price_gbp: string;
        original_price_gbp: string;
        counter_round: number;
        status: string;
        expires_at: string;
        offered_by_user_id: string | null;
      }>(
        `SELECT id, listing_id, seller_id, buyer_id,
                offer_price_gbp::text, original_price_gbp::text,
                counter_round, status, expires_at::text, offered_by_user_id
         FROM listing_offers
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [offerId],
      );
      if (!offerResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Offer not found' };
      }
      const offer = offerResult.rows[0];

      // Only evaluate offers that are pending and were made by the buyer
      // (not seller-countered offers that are waiting for buyer response).
      if (offer.status !== 'pending') {
        await client.query('ROLLBACK');
        return { ok: true, skipped: true, reason: `Offer status is ${offer.status}` };
      }
      const offeredBy = offer.offered_by_user_id ?? offer.buyer_id;
      if (offeredBy !== offer.buyer_id) {
        await client.query('ROLLBACK');
        return { ok: true, skipped: true, reason: 'Offer is waiting for buyer response' };
      }

      // Lock the Smart Sell policy for this listing.
      const policyResult = await client.query<SmartSellPolicyRow>(
        `SELECT id, listing_id, seller_id, floor_price_gbp::text, listing_price_gbp::text,
                status, policy_version, version, max_counter_rounds, counter_strategy,
                created_at::text, updated_at::text, paused_at::text, cancelled_at::text
         FROM smart_sell_policies
         WHERE listing_id = $1
         LIMIT 1
         FOR UPDATE`,
        [offer.listing_id],
      );
      if (!policyResult.rowCount) {
        await client.query('ROLLBACK');
        return { ok: true, skipped: true, reason: 'No Smart Sell policy for this listing' };
      }
      const policy = policyResult.rows[0];

      if (policy.status !== 'active') {
        await client.query('ROLLBACK');
        return { ok: true, skipped: true, reason: `Policy is ${policy.status}` };
      }

      // Check for an existing decision for this offer (idempotency).
      const existingDecision = await client.query<{ id: string; decision: string }>(
        `SELECT id, decision FROM smart_sell_decisions
         WHERE offer_id = $1 AND counter_round = $2
         LIMIT 1`,
        [offerId, offer.counter_round],
      );
      if (existingDecision.rowCount) {
        await client.query('ROLLBACK');
        return {
          ok: true,
          idempotent: true,
          decision: existingDecision.rows[0].decision,
          decisionId: existingDecision.rows[0].id,
        };
      }

      const offerPriceGbp = Number(offer.offer_price_gbp);
      const floorPriceGbp = Number(policy.floor_price_gbp);
      const listingPriceGbp = Number(policy.listing_price_gbp);
      const counterRound = offer.counter_round;

      let decision: 'accept' | 'counter' | 'decline' | 'escalate';
      let reason: string;
      let counterPriceGbp: number | null = null;

      if (offerPriceGbp >= floorPriceGbp) {
        // Offer meets or exceeds floor — accept.
        decision = 'accept';
        reason = `Offer of £${offerPriceGbp.toFixed(2)} meets your floor of £${floorPriceGbp.toFixed(2)}`;
      } else if (counterRound >= policy.max_counter_rounds) {
        // Max rounds reached — escalate to seller.
        decision = 'escalate';
        reason = `Buyer offered £${offerPriceGbp.toFixed(2)}, below your floor of £${floorPriceGbp.toFixed(2)}. Max counter rounds (${policy.max_counter_rounds}) reached.`;
      } else {
        // Counter the offer.
        decision = 'counter';
        counterPriceGbp = computeCounterPrice(
          offerPriceGbp,
          floorPriceGbp,
          listingPriceGbp,
          policy.counter_strategy as 'firm' | 'gradual',
          counterRound + 1,
        );
        reason = `Buyer offered £${offerPriceGbp.toFixed(2)}, below your floor of £${floorPriceGbp.toFixed(2)}. Countering at £${counterPriceGbp.toFixed(2)}.`;
      }

      // Compute net proceeds for the decision price.
      const decisionPrice = decision === 'accept' ? offerPriceGbp : (counterPriceGbp ?? floorPriceGbp);
      const net = computeNetProceeds(decisionPrice, calculatePlatformChargeGbp);

      // Record the decision.
      const decisionId = `ssd_${crypto.randomUUID()}`;
      const deduplicationKey = `smart_sell_decision:${offerId}:${counterRound}`;
      await client.query(
        `INSERT INTO smart_sell_decisions (
           id, policy_id, listing_id, offer_id, seller_id, buyer_id,
           decision, reason, offer_price_gbp, counter_price_gbp,
           net_proceeds_gbp, platform_fee_gbp, gross_sale_gbp,
           policy_version, counter_round, deduplication_key
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (deduplication_key) DO NOTHING`,
        [
          decisionId,
          policy.id,
          offer.listing_id,
          offerId,
          offer.seller_id,
          offer.buyer_id,
          decision,
          reason,
          offerPriceGbp,
          counterPriceGbp,
          net.netProceedsGbp,
          net.platformFeeGbp,
          net.grossSaleGbp,
          policy.policy_version,
          counterRound,
          deduplicationKey,
        ],
      );

      // Execute the decision.
      if (decision === 'accept') {
        // Mark the offer as accepted by Smart Sell.
        // The actual checkout/order creation is handled by the existing
        // offer accept flow — here we just set the metadata to indicate
        // Smart Sell accepted it, and the worker will call the accept endpoint.
        await client.query(
          `UPDATE listing_offers
           SET metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'smartSellDecision', 'accept',
                  'smartSellDecisionId', $2,
                  'smartSellPolicyVersion', $3
                ),
               updated_at = NOW()
           WHERE id = $1`,
          [offerId, decisionId, policy.policy_version],
        );
      } else if (decision === 'counter') {
        // Create a counter-offer on behalf of the seller.
        const counterOfferId = `offer_${crypto.randomUUID()}`;
        const expiresAt = new Date(Date.now() + 48 * 3600_000).toISOString();
        await client.query(
          `UPDATE listing_offers
           SET status = 'countered', updated_at = NOW()
           WHERE id = $1 AND status = 'pending'`,
          [offerId],
        );
        await client.query(
          `INSERT INTO listing_offers (
             id, listing_id, buyer_id, seller_id,
             offer_price_gbp, original_price_gbp,
             counter_round, status, expires_at,
             conversation_id, parent_offer_id, metadata,
             offered_by_user_id, idempotency_key, request_hash
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8,
                   NULL, $9, $10::jsonb, $4, $11, $12)`,
          [
            counterOfferId,
            offer.listing_id,
            offer.buyer_id,
            offer.seller_id,
            counterPriceGbp,
            offer.original_price_gbp,
            counterRound + 1,
            expiresAt,
            offerId,
            JSON.stringify({
              smartSellDecision: 'counter',
              smartSellDecisionId: decisionId,
              smartSellPolicyVersion: policy.policy_version,
            }),
            `ssd_counter_${decisionId}`,
            crypto.createHash('sha256').update(
              JSON.stringify({
                parentOfferId: offerId,
                offerPriceGbp: counterPriceGbp,
                smartSellDecisionId: decisionId,
              }),
            ).digest('hex'),
          ],
        );
        await appendDomainEvent(client, {
          aggregateType: 'smart_sell_decision',
          aggregateId: decisionId,
          eventType: 'smart_sell_decision.counter',
          actorId: offer.seller_id,
          correlationId: request.id,
          idempotencyKey: deduplicationKey,
          deduplicationKey: `smart_sell_decision.counter:${counterOfferId}`,
          payload: {
            decisionId,
            offerId,
            counterOfferId,
            listingId: offer.listing_id,
            buyerId: offer.buyer_id,
            sellerId: offer.seller_id,
            counterPriceGbp,
            floorPriceGbp,
            policyVersion: policy.policy_version,
            counterRound: counterRound + 1,
            netProceedsGbp: net.netProceedsGbp,
            platformFeeGbp: net.platformFeeGbp,
          },
        });
      } else if (decision === 'escalate') {
        // Mark the offer with metadata indicating it needs seller attention.
        await client.query(
          `UPDATE listing_offers
           SET metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'smartSellDecision', 'escalate',
                  'smartSellDecisionId', $2,
                  'smartSellPolicyVersion', $3,
                  'requiresSellerAttention', true
                ),
               updated_at = NOW()
           WHERE id = $1`,
          [offerId, decisionId, policy.policy_version],
        );
      }

      await appendDomainEvent(client, {
        aggregateType: 'smart_sell_decision',
        aggregateId: decisionId,
        eventType: `smart_sell_decision.${decision}`,
        actorId: offer.seller_id,
        correlationId: request.id,
        idempotencyKey: deduplicationKey,
        deduplicationKey: `smart_sell_decision.${decision}:${decisionId}`,
        payload: {
          decisionId,
          policyId: policy.id,
          offerId,
          listingId: offer.listing_id,
          buyerId: offer.buyer_id,
          sellerId: offer.seller_id,
          decision,
          reason,
          offerPriceGbp,
          counterPriceGbp,
          netProceedsGbp: net.netProceedsGbp,
          platformFeeGbp: net.platformFeeGbp,
          grossSaleGbp: net.grossSaleGbp,
          policyVersion: policy.policy_version,
          counterRound,
        },
      });

      await client.query('COMMIT');
      try {
        await enqueueOutboxDrain();
      } catch (error) {
        app.log.error({ err: error, decisionId }, 'Failed to enqueue Smart Sell decision outbox');
      }
      return {
        ok: true,
        decision,
        decisionId,
        reason,
        counterPriceGbp,
        netProceeds: net,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error, offerId }, 'Failed to evaluate Smart Sell decision');
      reply.code(500);
      return { ok: false, error: 'Failed to evaluate Smart Sell decision' };
    } finally {
      client.release();
    }
  });
};
