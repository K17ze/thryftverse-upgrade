import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

type PriceAlertRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const createAlertSchema = z.object({
  listingId: z.string().min(2).max(120),
  triggerPrice: z.number().positive().max(1_000_000).optional(),
});

const deleteAlertSchema = z.object({
  listingId: z.string().min(2).max(120),
});

const alertParamsSchema = z.object({
  listingId: z.string().min(2).max(120),
});

type PriceAlertRow = {
  id: string;
  user_id: string;
  listing_id: string;
  trigger_price: string;
  enabled: boolean;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

export const registerPriceAlertRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: PriceAlertRouteDependencies) => {
  app.post("/price-alerts", async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = createAlertSchema.parse(request.body);

    const listingResult = await db.query<{ id: string; price: string }>(
      `SELECT id, price FROM listings WHERE id = $1 AND status = 'active' LIMIT 1`,
      [payload.listingId],
    );

    if (!listingResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Active listing not found" };
    }

    const currentPrice = Number(listingResult.rows[0].price);
    const triggerPrice = payload.triggerPrice ?? currentPrice;

    const alertId = `palert_${crypto.randomUUID()}`;

    const result = await db.query<PriceAlertRow>(
      `
        INSERT INTO price_alerts (id, user_id, listing_id, trigger_price, enabled)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (user_id, listing_id)
        DO UPDATE SET enabled = TRUE, trigger_price = EXCLUDED.trigger_price, updated_at = NOW()
        RETURNING id, user_id, listing_id, trigger_price, enabled, last_notified_at, created_at, updated_at
      `,
      [alertId, actorUserId, payload.listingId, triggerPrice],
    );

    const row = result.rows[0];

    reply.code(201);
    return {
      ok: true,
      alertId: row.id,
      enabled: row.enabled,
    };
  });

  app.delete("/price-alerts", async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = deleteAlertSchema.parse(request.body);

    await db.query(
      `UPDATE price_alerts SET enabled = FALSE, updated_at = NOW() WHERE user_id = $1 AND listing_id = $2`,
      [actorUserId, payload.listingId],
    );

    return { ok: true };
  });

  app.get("/price-alerts/:listingId", async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { listingId } = alertParamsSchema.parse(request.params);

    const result = await db.query<{ enabled: boolean }>(
      `SELECT enabled FROM price_alerts WHERE user_id = $1 AND listing_id = $2 AND enabled = TRUE LIMIT 1`,
      [actorUserId, listingId],
    );

    return {
      ok: true,
      enabled: (result.rowCount ?? 0) > 0,
    };
  });

  app.get("/price-alerts", async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const result = await db.query<PriceAlertRow>(
      `SELECT id, user_id, listing_id, trigger_price, enabled, last_notified_at, created_at, updated_at
       FROM price_alerts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [actorUserId],
    );

    return {
      ok: true,
      alerts: result.rows.map((row) => ({
        id: row.id,
        listingId: row.listing_id,
        triggerPrice: Number(row.trigger_price),
        enabled: row.enabled,
        lastNotifiedAt: row.last_notified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  });
};
