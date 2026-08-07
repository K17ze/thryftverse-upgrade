import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

type PriceAlertRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
  queueNotification: (input: {
    userId: string;
    title: string;
    body: string;
    eventType: string;
    payload: Record<string, unknown>;
    route: Record<string, unknown>;
    idempotencyKey: string;
  }) => Promise<string | null>;
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

type PriceAlertEvaluationDependencies = {
  db: Pool;
  listingId: string;
  priceEventId: number;
  previousPriceGbp: number;
  newPriceGbp: number;
  queueNotification: PriceAlertRouteDependencies['queueNotification'];
};

export async function evaluatePriceAlertsForListing({
  db,
  listingId,
  priceEventId,
  previousPriceGbp,
  newPriceGbp,
  queueNotification,
}: PriceAlertEvaluationDependencies): Promise<{ evaluated: number; triggered: number }> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const alerts = await client.query<{
      id: string;
      user_id: string;
      trigger_price: string;
      last_observed_price: string | null;
      listing_title: string;
    }>(
      `SELECT
         pa.id,
         pa.user_id,
         pa.trigger_price::text,
         pa.last_observed_price::text,
         l.title AS listing_title
       FROM price_alerts pa
       INNER JOIN listings l ON l.id = pa.listing_id
       WHERE pa.listing_id = $1 AND pa.enabled = TRUE
       ORDER BY pa.id
       FOR UPDATE OF pa`,
      [listingId],
    );

    let triggered = 0;
    for (const alert of alerts.rows) {
      const triggerPrice = Number(alert.trigger_price);
      const lastObserved = alert.last_observed_price == null
        ? previousPriceGbp
        : Number(alert.last_observed_price);
      const crossedThreshold =
        newPriceGbp < lastObserved
        && newPriceGbp <= triggerPrice;

      let notificationEventId: string | null = null;
      if (crossedThreshold) {
        notificationEventId = await queueNotification({
          userId: alert.user_id,
          title: 'Price drop',
          body: `${alert.listing_title} is now £${newPriceGbp.toFixed(2)}.`,
          eventType: 'price_drop',
          payload: {
            listingId,
            priceEventId,
            previousPriceGbp,
            newPriceGbp,
            triggerPriceGbp: triggerPrice,
          },
          route: {
            screen: 'ItemDetail',
            params: { itemId: listingId },
          },
          idempotencyKey: `price-alert:${alert.id}:event:${priceEventId}`,
        });
        triggered += 1;
      }

      await client.query(
        `UPDATE price_alerts
         SET last_observed_price = $2,
             last_price_event_id = $3,
             last_notified_at = CASE WHEN $4::boolean THEN NOW() ELSE last_notified_at END,
             notification_event_id = COALESCE($5, notification_event_id),
             triggered_count = triggered_count + CASE WHEN $4::boolean THEN 1 ELSE 0 END,
             updated_at = NOW()
         WHERE id = $1`,
        [alert.id, newPriceGbp, priceEventId, crossedThreshold, notificationEventId],
      );
    }

    await client.query('COMMIT');
    return { evaluated: alerts.rows.length, triggered };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const registerPriceAlertRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
  queueNotification,
}: PriceAlertRouteDependencies) => {
  app.post("/price-alerts", async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = createAlertSchema.parse(request.body);

    const listingResult = await db.query<{ id: string; price_gbp: string }>(
      `SELECT id, price_gbp::text FROM listings WHERE id = $1 AND status = 'active' LIMIT 1`,
      [payload.listingId],
    );

    if (!listingResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Active listing not found" };
    }

    const currentPrice = Number(listingResult.rows[0].price_gbp);
    const triggerPrice = payload.triggerPrice ?? currentPrice;

    const alertId = `palert_${crypto.randomUUID()}`;

    const result = await db.query<PriceAlertRow>(
      `
        INSERT INTO price_alerts (
          id, user_id, listing_id, trigger_price, enabled, last_observed_price
        )
        VALUES ($1, $2, $3, $4, TRUE, $5)
        ON CONFLICT (user_id, listing_id)
        DO UPDATE SET
          enabled = TRUE,
          trigger_price = EXCLUDED.trigger_price,
          last_observed_price = EXCLUDED.last_observed_price,
          updated_at = NOW()
        RETURNING id, user_id, listing_id, trigger_price, enabled, last_notified_at, created_at, updated_at
      `,
      [alertId, actorUserId, payload.listingId, triggerPrice, currentPrice],
    );

    const row = result.rows[0];

    reply.code(201);
    return {
      ok: true,
      alertId: row.id,
      enabled: row.enabled,
    };
  });

  app.post('/price-alerts/evaluate/:listingId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { listingId } = alertParamsSchema.parse(request.params);
    const listing = await db.query<{ seller_id: string }>(
      `SELECT seller_id FROM listings WHERE id = $1 LIMIT 1`,
      [listingId],
    );
    if (!listing.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Listing not found' };
    }
    if (listing.rows[0].seller_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Only the listing owner can evaluate its alerts' };
    }

    const latest = await db.query<{
      id: number;
      previous_price_gbp: string;
      new_price_gbp: string;
    }>(
      `SELECT id, previous_price_gbp::text, new_price_gbp::text
       FROM listing_price_events
       WHERE listing_id = $1
       ORDER BY changed_at DESC, id DESC
       LIMIT 1`,
      [listingId],
    );
    if (!latest.rowCount) {
      return { ok: true, evaluated: 0, triggered: 0 };
    }
    const event = latest.rows[0];
    const outcome = await evaluatePriceAlertsForListing({
      db,
      listingId,
      priceEventId: event.id,
      previousPriceGbp: Number(event.previous_price_gbp),
      newPriceGbp: Number(event.new_price_gbp),
      queueNotification,
    });
    return { ok: true, ...outcome };
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
