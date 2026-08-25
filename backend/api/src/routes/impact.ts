import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  calculateImpact,
  METHODOLOGY_VERSION,
  type ImpactResult,
} from '../lib/impactCalculator.js';

type ImpactRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const listingIdParamsSchema = z.object({
  id: z.string().min(2).max(120),
});

const orderIdParamsSchema = z.object({
  orderId: z.string().min(2).max(120),
});

interface ListingImpactRow {
  material_composition: string | null;
  weight_kg: string | null;
  category: string | null;
}

interface OrderImpactRow {
  buyer_id: string;
  listing_id: string;
}

interface LedgerAggregateRow {
  total_co2e_avoided_kg: string | null;
  item_count: string;
}

interface LedgerEntryRow {
  id: string;
  order_id: string | null;
  listing_id: string | null;
  co2e_avoided_kg: string;
  co2e_production_avoided_kg: string;
  co2e_eol_avoided_kg: string;
  co2e_shipping_kg: string;
  co2e_packaging_kg: string;
  methodology_version: string;
  factor_sources: string[];
  created_at: string;
}

function impactResultToResponse(result: ImpactResult) {
  return {
    available: true,
    co2eAvoidedKg: result.co2eAvoidedKg,
    co2eProductionAvoidedKg: result.co2eProductionAvoidedKg,
    co2eEolAvoidedKg: result.co2eEolAvoidedKg,
    co2eShippingKg: result.co2eShippingKg,
    co2ePackagingKg: result.co2ePackagingKg,
    methodologyVersion: result.methodologyVersion,
    factorSources: result.factorSources,
  };
}

export const registerImpactRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: ImpactRouteDependencies) => {
  app.get('/listings/:id/impact', async (request, reply) => {
    const { id: listingId } = listingIdParamsSchema.parse(request.params);

    const listingResult = await db.query<ListingImpactRow>(
      `SELECT material_composition, weight_kg::text, category
       FROM listings
       WHERE id = $1
       LIMIT 1`,
      [listingId],
    );

    if (!listingResult.rowCount) {
      reply.code(404);
      return { available: false, error: 'Listing not found' };
    }

    const row = listingResult.rows[0];
    if (!row.material_composition || !row.weight_kg) {
      return { available: false };
    }

    const weightKg = Number(row.weight_kg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      return { available: false };
    }

    const result = await calculateImpact(
      {
        material: row.material_composition,
        weightKg,
        category: row.category ?? '',
      },
      db,
    );

    if (!result) {
      return { available: false };
    }

    return impactResultToResponse(result);
  });

  app.get('/users/me/impact-ledger', async (request) => {
    const userId = resolveAuthenticatedUserId(request);

    const aggregateResult = await db.query<LedgerAggregateRow>(
      `SELECT
         COALESCE(SUM(co2e_avoided_kg), 0)::text AS total_co2e_avoided_kg,
         COUNT(*)::text AS item_count
       FROM user_impact_ledger
       WHERE user_id = $1`,
      [userId],
    );

    const entriesResult = await db.query<LedgerEntryRow>(
      `SELECT
         id, order_id, listing_id,
         co2e_avoided_kg::text, co2e_production_avoided_kg::text,
         co2e_eol_avoided_kg::text, co2e_shipping_kg::text,
         co2e_packaging_kg::text, methodology_version, factor_sources,
         created_at::text
       FROM user_impact_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId],
    );

    const aggregateRow = aggregateResult.rows[0];
    const totalCo2eAvoidedKg = Number(aggregateRow?.total_co2e_avoided_kg ?? 0);

    return {
      totalCo2eAvoidedKg,
      itemCount: Number(aggregateRow?.item_count ?? 0),
      entries: entriesResult.rows.map((entry) => ({
        id: entry.id,
        orderId: entry.order_id,
        listingId: entry.listing_id,
        co2eAvoidedKg: Number(entry.co2e_avoided_kg),
        co2eProductionAvoidedKg: Number(entry.co2e_production_avoided_kg),
        co2eEolAvoidedKg: Number(entry.co2e_eol_avoided_kg),
        co2eShippingKg: Number(entry.co2e_shipping_kg),
        co2ePackagingKg: Number(entry.co2e_packaging_kg),
        methodologyVersion: entry.methodology_version,
        factorSources: entry.factor_sources,
        createdAt: entry.created_at,
      })),
    };
  });

  app.post('/orders/:orderId/impact', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { orderId } = orderIdParamsSchema.parse(request.params);

    const orderResult = await db.query<OrderImpactRow>(
      `SELECT buyer_id, listing_id FROM orders WHERE id = $1 LIMIT 1`,
      [orderId],
    );

    if (!orderResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Order not found' };
    }

    const order = orderResult.rows[0];
    if (order.buyer_id !== actorUserId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden' };
    }

    const existingResult = await db.query<{ id: string }>(
      `SELECT id FROM user_impact_ledger WHERE order_id = $1 LIMIT 1`,
      [orderId],
    );
    if (existingResult.rowCount) {
      return { ok: true, ledgerId: existingResult.rows[0].id, alreadyMaterialised: true };
    }

    const listingResult = await db.query<ListingImpactRow>(
      `SELECT material_composition, weight_kg::text, category
       FROM listings
       WHERE id = $1
       LIMIT 1`,
      [order.listing_id],
    );

    if (!listingResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Listing not found' };
    }

    const row = listingResult.rows[0];
    if (!row.material_composition || !row.weight_kg) {
      return { ok: false, available: false };
    }

    const weightKg = Number(row.weight_kg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      return { ok: false, available: false };
    }

    const result = await calculateImpact(
      {
        material: row.material_composition,
        weightKg,
        category: row.category ?? '',
      },
      db,
    );

    if (!result) {
      return { ok: false, available: false };
    }

    const ledgerId = `imp_${crypto.randomUUID()}`;
    await db.query(
      `INSERT INTO user_impact_ledger (
         id, user_id, order_id, listing_id,
         co2e_avoided_kg, co2e_production_avoided_kg, co2e_eol_avoided_kg,
         co2e_shipping_kg, co2e_packaging_kg, methodology_version, factor_sources
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        ledgerId,
        order.buyer_id,
        orderId,
        order.listing_id,
        result.co2eAvoidedKg,
        result.co2eProductionAvoidedKg,
        result.co2eEolAvoidedKg,
        result.co2eShippingKg,
        result.co2ePackagingKg,
        result.methodologyVersion,
        result.factorSources,
      ],
    );

    reply.code(201);
    return {
      ok: true,
      ledgerId,
      alreadyMaterialised: false,
      impact: impactResultToResponse(result),
    };
  });
};

export { METHODOLOGY_VERSION };
