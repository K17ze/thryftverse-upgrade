/**
 * Seller fulfilment routes — shipping-label generation and handoff assertion.
 *
 * Extracted from index.ts so the seller-side fulfilment contract the
 * frontend calls (`useSellerFulfilmentActions`, `commerceApi`) is owned by
 * one small module rather than buried in the monolith.
 *
 *   POST /orders/:orderId/shipping-label
 *     Seller-auth'd, row-locked, idempotent. Reuses the same postcode
 *     context + country-capability carrier matching + createShipment +
 *     COALESCE persistence semantics as the settlement-time provisioning
 *     (provisionOrderShipmentIfMissing in index.ts). Returns provider error
 *     codes the client maps through classifyShippingError.
 *
 *   POST /orders/:orderId/fulfilment/handoff-assertion
 *     Records a seller "I dropped it off" claim as an idempotent
 *     order_parcel_events row (event_type 'handoff_asserted'). It is
 *     evidence, not truth — the canonical order status is NEVER mutated
 *     here; carrier webhooks remain the source of truth for shipping.
 *
 *   POST /orders/:orderId/fulfilment/carrier-exception
 *     Operator-recorded carrier failure report — 'lost' or 'damaged'
 *     (event_type CHECK widened by migration 325). These are discrete
 *     carrier facts, not flavours of a failed delivery attempt. The order
 *     status mapping mirrors applyOrderParcelEvent's 'delivery_failed'
 *     branch exactly: 'shipped' → 'delivery_failed' (the honest coarse
 *     state — the parcel cannot complete delivery as expected but may
 *     still recover), 'paid' records evidence without a transition, and
 *     delivered/terminal orders reject. The buyer is notified through the
 *     canonical notification queue.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import {
  roundTo,
  toJsonString,
  type DbQueryable,
} from '../lib/workerHelpers.js';
import { getOrCreateComplianceProfile } from '../lib/compliance.js';
import {
  resolveCountryCapabilities,
  type CapabilityCarrier,
} from '../lib/countryCapabilities.js';
import { createShipment } from '../lib/shippingProvider.js';
import { emitOrderCommerceCard } from '../lib/orderChatCards.js';

/** workerRuntime owns the canonical notification queue. Imported lazily —
 *  the module instantiates the Redis singleton at load time, which must not
 *  run in unit tests that never queue a notification (pattern:
 *  routes/streaming.ts). */
type QueueUserNotificationFn = (input: {
  userId: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  eventType?: string;
  actorUserId?: string;
  imageUrl?: string;
  route?: Record<string, unknown>;
  idempotencyKey?: string;
  forcePush?: boolean;
}) => Promise<string | null>;

const queueUserNotificationLazy: QueueUserNotificationFn = async (input) => {
  const mod = await import('../lib/workerRuntime.js');
  return mod.queueUserNotification(input);
};

type OrderRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string | null;
  status: string;
  address_id: number | string | null;
  postage_fee_gbp: number | string | null;
  shipping_carrier_id: string | null;
  shipping_provider: string | null;
  tracking_number: string | null;
  shipping_label_url: string | null;
  shipping_quote_gbp: number | string | null;
};

const ORDER_SELECT = `
  SELECT
    id,
    buyer_id,
    seller_id,
    listing_id,
    status,
    address_id,
    postage_fee_gbp,
    shipping_carrier_id,
    shipping_provider,
    tracking_number,
    shipping_label_url,
    shipping_quote_gbp
  FROM orders
  WHERE id = $1
  LIMIT 1
  FOR UPDATE
`;

async function resolveUserPrimaryPostcode(
  client: DbQueryable,
  userId: string,
): Promise<string | null> {
  const result = await client.query<{ postcode: string }>(
    `SELECT postcode
     FROM user_addresses
     WHERE user_id = $1
     ORDER BY is_default DESC, updated_at DESC, created_at DESC
     LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.postcode ?? null;
}

async function complianceProfilesAvailable(client: DbQueryable): Promise<boolean> {
  const result = await client.query<{ ready: boolean }>(
    `SELECT to_regclass('public.user_compliance_profiles') IS NOT NULL AS ready`,
  );
  return result.rows[0]?.ready === true;
}

async function orderParcelEventsAvailable(client: DbQueryable): Promise<boolean> {
  const result = await client.query<{ ready: boolean }>(
    `SELECT to_regclass('public.order_parcel_events') IS NOT NULL AS ready`,
  );
  return result.rows[0]?.ready === true;
}

/** True when a persisted tracking/label artifact already satisfies the call. */
function hasShippingArtifact(order: OrderRow): boolean {
  const syntheticTracking = `TV-${order.id.toUpperCase()}`;
  return Boolean(
    order.shipping_label_url
    || (order.tracking_number && order.tracking_number !== syntheticTracking)
  );
}

export interface OrderFulfilmentRouteDeps {
  app: FastifyInstance;
  db: Pool;
  /** Injectable for tests — defaults to the live provider adapter. */
  createShipmentFn?: typeof createShipment;
  /** Injectable for tests — defaults to the real commerce-card emitter. */
  emitOrderCommerceCardFn?: typeof emitOrderCommerceCard;
  /** Injectable for tests — defaults to the canonical notification queue
   *  (lazy-imported workerRuntime.queueUserNotification). */
  queueUserNotificationFn?: QueueUserNotificationFn;
}

export function registerOrderFulfilmentRoutes({
  app,
  db,
  createShipmentFn = createShipment,
  emitOrderCommerceCardFn = emitOrderCommerceCard,
  queueUserNotificationFn = queueUserNotificationLazy,
}: OrderFulfilmentRouteDeps): void {
  // ─── POST /orders/:orderId/shipping-label ──────────────────────────────────
  app.post('/orders/:orderId/shipping-label', async (request, reply) => {
    const paramsSchema = z.object({ orderId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      // Optional carrier hint — matches by carrier id or display label.
      carrier: z.string().min(1).max(80).optional(),
    });
    const { orderId } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body ?? {});
    const userId = request.authUser?.userId;
    const isAdmin = request.authUser?.role === 'admin';

    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Authentication required' };
    }

    const client = await db.connect();
    let emitLabelCard = false;
    let labelCardTracking: string | null = null;
    let labelCardCarrier: string | null = null;
    try {
      await client.query('BEGIN');

      const orderResult = await client.query<OrderRow>(ORDER_SELECT, [orderId]);
      const order = orderResult.rows[0];
      if (!order) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' };
      }

      if (order.seller_id !== userId && !isAdmin) {
        await client.query('ROLLBACK');
        reply.code(403);
        return {
          ok: false,
          error: 'Only the seller can generate a shipping label for this order',
          code: 'FORBIDDEN',
        };
      }

      // Idempotent: a persisted label/tracking artifact is returned as-is.
      if (hasShippingArtifact(order)) {
        await client.query('COMMIT');
        return {
          ok: true,
          orderId: order.id,
          alreadyExists: true,
          trackingNumber: order.tracking_number,
          shippingProvider: order.shipping_provider,
          shippingLabelUrl: order.shipping_label_url,
          shippingQuoteGbp:
            order.shipping_quote_gbp === null ? null : Number(order.shipping_quote_gbp),
        };
      }

      // Labels are only generated for paid orders awaiting dispatch — a
      // 'shipped' order without a label was dispatched manually and a new
      // carrier label would contradict the recorded handoff.
      if (order.status !== 'paid') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Shipping labels can only be generated for paid orders (status: ${order.status})`,
          code: order.status === 'shipped' ? 'ORDER_ALREADY_SHIPPED' : 'ORDER_NOT_PAID',
        };
      }

      // Postcode context — mirrors provisionOrderShipmentIfMissing: the
      // checkout-selected address first, then the buyer's primary address;
      // the seller's primary address is the origin.
      const destinationPostcode = order.address_id
        ? (
            await client.query<{ postcode: string }>(
              'SELECT postcode FROM user_addresses WHERE id = $1 AND user_id = $2 LIMIT 1',
              [order.address_id, order.buyer_id],
            )
          ).rows[0]?.postcode ?? null
        : await resolveUserPrimaryPostcode(client, order.buyer_id);
      const originPostcode = await resolveUserPrimaryPostcode(client, order.seller_id);

      if (!originPostcode || !destinationPostcode) {
        await client.query('ROLLBACK');
        reply.code(422);
        return {
          ok: false,
          error: 'Shipping addresses are incomplete — origin or destination postcode is missing',
          code: 'INVALID_DESTINATION',
          details: { code: 'INVALID_DESTINATION', reason: 'postcode_context_missing' },
        };
      }

      // Carrier matching — the order's checkout-selected carrier first, then
      // the request's carrier hint (id or display label), then the first
      // carrier the buyer's country capability profile allows.
      let carriers: CapabilityCarrier[] = resolveCountryCapabilities({
        countryCode: 'GB',
      }).postage.carriers;
      try {
        if (await complianceProfilesAvailable(client)) {
          const buyerProfile = await getOrCreateComplianceProfile(client, order.buyer_id);
          const capabilities = resolveCountryCapabilities({
            countryCode: buyerProfile.countryCode,
            residencyCountryCode: buyerProfile.residencyCountryCode,
          });
          if (capabilities.postage.carriers.length > 0) {
            carriers = capabilities.postage.carriers;
          }
        }
      } catch {
        // Default carrier profile when compliance context is unavailable.
      }

      const wanted = body.carrier?.trim().toLowerCase() ?? null;
      const selectedCarrier =
        carriers.find((carrier) => carrier.id === order.shipping_carrier_id)
        ?? (wanted
          ? carriers.find(
              (carrier) =>
                carrier.id.toLowerCase() === wanted
                || carrier.label.toLowerCase() === wanted,
            )
          : undefined)
        ?? carriers[0]
        ?? {
          id: order.shipping_carrier_id ?? 'evri',
          label: 'Evri',
          priceFromGbp: 2.9,
          etaMinDays: 2,
          etaMaxDays: 4,
          tracking: true,
        };

      const shipment = await createShipmentFn({
        orderId: order.id,
        carrierId: selectedCarrier.id,
        carrierLabel: selectedCarrier.label,
        originPostcode,
        destinationPostcode,
        declaredValueGbp:
          order.postage_fee_gbp === null ? undefined : Number(order.postage_fee_gbp),
      });

      const resolvedQuoteGbp = roundTo(
        Math.max(
          0,
          order.postage_fee_gbp !== null
            ? Number(order.postage_fee_gbp)
            : shipment.priceGbp ?? selectedCarrier.priceFromGbp,
        ),
        2,
      );

      // COALESCE — a concurrent winner keeps its artifacts; the loser still
      // commits harmlessly and the response reflects what we generated.
      const persisted = await client.query<OrderRow>(
        `UPDATE orders
         SET
           shipping_carrier_id = COALESCE(shipping_carrier_id, $2),
           shipping_provider = COALESCE(shipping_provider, $3),
           tracking_number = COALESCE(tracking_number, $4),
           shipping_label_url = COALESCE(shipping_label_url, $5),
           shipping_quote_gbp = COALESCE(shipping_quote_gbp, $6),
           shipping_metadata = COALESCE(shipping_metadata, '{}'::jsonb) || $7::jsonb,
           updated_at = NOW()
         WHERE id = $1
         RETURNING tracking_number, shipping_provider, shipping_label_url, shipping_quote_gbp`,
        [
          order.id,
          selectedCarrier.id,
          shipment.provider,
          shipment.trackingNumber,
          shipment.labelUrl,
          resolvedQuoteGbp,
          toJsonString({
            shipment: {
              carrierId: selectedCarrier.id,
              provider: shipment.provider,
              trackingNumber: shipment.trackingNumber,
              labelUrl: shipment.labelUrl,
              quoteGbp: resolvedQuoteGbp,
              live: shipment.live,
              metadata: shipment.metadata,
              provisionedAt: new Date().toISOString(),
              provisionedBy: 'seller_label_request',
            },
          }),
        ],
      );

      const persistedRow = persisted.rows[0];
      emitLabelCard = true;
      labelCardTracking = persistedRow?.tracking_number ?? shipment.trackingNumber;
      labelCardCarrier = persistedRow?.shipping_provider ?? shipment.provider;

      await client.query('COMMIT');

      reply.code(201);
      return {
        ok: true,
        orderId: order.id,
        alreadyExists: false,
        trackingNumber: persistedRow?.tracking_number ?? shipment.trackingNumber,
        shippingProvider: persistedRow?.shipping_provider ?? shipment.provider,
        shippingLabelUrl: persistedRow?.shipping_label_url ?? shipment.labelUrl,
        shippingQuoteGbp:
          persistedRow?.shipping_quote_gbp === null
            ? null
            : Number(persistedRow?.shipping_quote_gbp ?? resolvedQuoteGbp),
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Client may already be released.
      }
      // Honest provider errors — createShipment throws createApiError with
      // codes classifyShippingError understands (SHIPPING_PROVIDER_UNAVAILABLE
      // → LABEL_PROVIDER_UNAVAILABLE on the client).
      const code = (error as { code?: unknown }).code;
      const message = error instanceof Error ? error.message : 'Shipping label generation failed';
      if (typeof code === 'string') {
        const status =
          code === 'SHIPPING_PROVIDER_UNAVAILABLE'
            ? 503
            : code === 'INVALID_DESTINATION' || code === 'PARCEL_OUT_OF_BOUNDS'
              ? 422
              : code === 'RATE_LIMITED'
                ? 429
                : 502;
        reply.code(status);
        return {
          ok: false,
          error: message,
          code,
          details: { code },
        };
      }
      request.log.error({ err: error, orderId }, 'Shipping label generation failed');
      reply.code(502);
      return {
        ok: false,
        error: 'Shipping label generation failed',
        code: 'LABEL_GENERATION_UNAVAILABLE',
        details: { code: 'LABEL_GENERATION_UNAVAILABLE' },
      };
    } finally {
      client.release();
      if (emitLabelCard) {
        await emitOrderCommerceCardFn({
          orderId,
          stateType: 'label_created',
          trackingNumber: labelCardTracking,
          carrier: labelCardCarrier,
          log: request.log,
        }).catch((cardError) => {
          request.log.warn(
            { err: cardError, orderId },
            'Failed to emit label_created card after label request',
          );
        });
      }
    }
  });

  // ─── POST /orders/:orderId/fulfilment/handoff-assertion ────────────────────
  // The seller asserts "I dropped the parcel off". This is a CLAIM recorded
  // as a parcel event for the fulfilment timeline — it must NOT transition
  // orders.status; carrier webhooks remain the source of truth.
  app.post('/orders/:orderId/fulfilment/handoff-assertion', async (request, reply) => {
    const paramsSchema = z.object({ orderId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      trackingNumber: z.string().min(1).max(128).optional(),
      shippingProvider: z.string().min(1).max(64).optional(),
      labelUrl: z.string().url().optional(),
    });
    const { orderId } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body ?? {});
    const userId = request.authUser?.userId;
    const isAdmin = request.authUser?.role === 'admin';

    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Authentication required' };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      if (!(await orderParcelEventsAvailable(client))) {
        await client.query('ROLLBACK');
        reply.code(503);
        return {
          ok: false,
          error: 'Order parcel event tables are unavailable. Run migrations first.',
        };
      }

      const orderResult = await client.query<OrderRow>(ORDER_SELECT, [orderId]);
      const order = orderResult.rows[0];
      if (!order) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' };
      }

      if (order.seller_id !== userId && !isAdmin) {
        await client.query('ROLLBACK');
        reply.code(403);
        return {
          ok: false,
          error: 'Only the seller can assert handoff for this order',
          code: 'FORBIDDEN',
        };
      }

      if (order.status !== 'paid') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Handoff can only be asserted while the order is paid and awaiting dispatch (status: ${order.status})`,
          code: 'ORDER_NOT_PAID',
          status: order.status,
        };
      }

      const providerEventId = `handoff_asserted:${order.id}`;
      const inserted = await client.query<{
        occurred_at: string;
        payload: Record<string, unknown> | null;
      }>(
        `INSERT INTO order_parcel_events (
           order_id, provider, event_type, provider_event_id, tracking_id,
           occurred_at, payload
         )
         VALUES ($1, $2, 'handoff_asserted', $3, $4, NOW(), $5::jsonb)
         ON CONFLICT (provider, provider_event_id)
           WHERE provider_event_id IS NOT NULL
         DO NOTHING
         RETURNING occurred_at::text, payload`,
        [
          order.id,
          body.shippingProvider ?? order.shipping_provider ?? 'seller_assertion',
          providerEventId,
          body.trackingNumber ?? order.tracking_number ?? null,
          toJsonString({
            assertedBy: userId,
            trackingNumber: body.trackingNumber ?? order.tracking_number ?? null,
            shippingProvider: body.shippingProvider ?? order.shipping_provider ?? null,
            labelUrl: body.labelUrl ?? order.shipping_label_url ?? null,
          }),
        ],
      );

      let handoffClaimedAt: string;
      if (inserted.rowCount && inserted.rows[0]?.occurred_at) {
        handoffClaimedAt = inserted.rows[0].occurred_at;
      } else {
        // Idempotent replay — serve the originally recorded claim.
        const existing = await client.query<{ occurred_at: string }>(
          `SELECT occurred_at::text
           FROM order_parcel_events
           WHERE provider = $1 AND provider_event_id = $2
           LIMIT 1`,
          [
            body.shippingProvider ?? order.shipping_provider ?? 'seller_assertion',
            providerEventId,
          ],
        );
        if (!existing.rowCount) {
          await client.query('ROLLBACK');
          reply.code(500);
          return { ok: false, error: 'Failed to record handoff assertion' };
        }
        handoffClaimedAt = existing.rows[0].occurred_at;
      }

      await client.query('COMMIT');
      return {
        ok: true,
        orderId: order.id,
        handoffClaimedAt,
        status: order.status,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Client may already be released.
      }
      request.log.error({ err: error, orderId }, 'Handoff assertion failed');
      reply.code(500);
      return { ok: false, error: 'Unable to record handoff assertion' };
    } finally {
      client.release();
    }
  });

  // ─── POST /orders/:orderId/fulfilment/carrier-exception ──────────────────
  // An operator records a carrier-reported 'lost' or 'damaged' parcel —
  // discrete carrier facts (audit R40), persisted as their own event_type
  // (migration 325) rather than collapsing into a generic delivery failure.
  //
  // Order-status mapping: the orders.status enum has no lost/damaged state,
  // so the event folds into 'delivery_failed' — the fitting coarse state
  // (migration 313: "carrier attempted/lost the parcel; may still recover").
  // The transition rule mirrors applyOrderParcelEvent's delivery_failed
  // branch exactly: only 'shipped' advances; 'paid' is anomalous evidence
  // recorded without a transition; a later carrier scan can still
  // re-advance the order. Escrow is unaffected — the sweep only pays
  // 'delivered' orders.
  app.post('/orders/:orderId/fulfilment/carrier-exception', async (request, reply) => {
    const paramsSchema = z.object({ orderId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      eventType: z.enum(['lost', 'damaged']),
      provider: z.string().min(1).max(64).optional(),
      providerEventId: z.string().min(3).max(180).optional(),
      trackingNumber: z.string().min(1).max(128).optional(),
      occurredAt: z.string().datetime().optional(),
      note: z.string().max(500).optional(),
    });
    const { orderId } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body ?? {});
    const userId = request.authUser?.userId;
    const isAdmin = request.authUser?.role === 'admin';

    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Authentication required' };
    }

    // Operator-recorded carrier truth — a buyer or seller assertion about
    // a lost/damaged parcel goes through support/returns, not this path.
    if (!isAdmin) {
      reply.code(403);
      return {
        ok: false,
        error: 'Only an operator can record a carrier exception for this order',
        code: 'FORBIDDEN',
      };
    }

    const client = await db.connect();
    let notifyBuyerId: string | null = null;
    try {
      await client.query('BEGIN');

      if (!(await orderParcelEventsAvailable(client))) {
        await client.query('ROLLBACK');
        reply.code(503);
        return {
          ok: false,
          error: 'Order parcel event tables are unavailable. Run migrations first.',
        };
      }

      const orderResult = await client.query<OrderRow>(ORDER_SELECT, [orderId]);
      const order = orderResult.rows[0];
      if (!order) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' };
      }

      // The parcel must plausibly be in carrier hands. 'delivered'/
      // 'completed' orders claiming damage are item-condition disputes
      // (returns/SNAD), not carrier parcel events; 'returned'/'refunded'/
      // 'cancelled' are terminal for the shipment.
      if (!['paid', 'shipped', 'delivery_failed'].includes(order.status)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Carrier exceptions can only be recorded while the parcel is in the fulfilment window (status: ${order.status})`,
          code: 'ORDER_INVALID_STATE',
          status: order.status,
        };
      }

      const provider = body.provider ?? order.shipping_provider ?? 'carrier_exception';
      // Deterministic dedupe when the caller has no carrier event id — a
      // second 'lost' report on the same order replays, never duplicates.
      const providerEventId = body.providerEventId ?? `carrier_${body.eventType}:${order.id}`;
      const inserted = await client.query<{
        occurred_at: string;
        received_at: string;
      }>(
        `INSERT INTO order_parcel_events (
           order_id, provider, event_type, provider_event_id, tracking_id,
           occurred_at, payload
         )
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7::jsonb)
         ON CONFLICT (provider, provider_event_id)
           WHERE provider_event_id IS NOT NULL
         DO NOTHING
         RETURNING occurred_at::text, received_at::text`,
        [
          order.id,
          provider,
          body.eventType,
          providerEventId,
          body.trackingNumber ?? order.tracking_number ?? null,
          body.occurredAt ?? null,
          toJsonString({
            reportedBy: userId,
            note: body.note ?? null,
            carrierEventType: body.eventType,
            source: 'carrier_exception',
          }),
        ],
      );

      const recorded = (inserted.rowCount ?? 0) > 0;
      let occurredAt = inserted.rows[0]?.occurred_at ?? null;
      if (!recorded) {
        // Idempotent replay — serve the originally recorded event time.
        const existing = await client.query<{ occurred_at: string | null; received_at: string }>(
          `SELECT occurred_at::text, received_at::text
           FROM order_parcel_events
           WHERE provider = $1 AND provider_event_id = $2
           LIMIT 1`,
          [provider, providerEventId],
        );
        occurredAt = existing.rows[0]?.occurred_at ?? existing.rows[0]?.received_at ?? null;
      }

      // Order status: 'shipped' → 'delivery_failed' only (mirrors
      // applyOrderParcelEvent — 'paid' stays; the parcel was never provably
      // in carrier hands, so the event is evidence, not a transition).
      let status = order.status;
      if (order.status === 'shipped') {
        const updated = await client.query<{ status: string }>(
          `UPDATE orders
           SET status = 'delivery_failed', updated_at = NOW()
           WHERE id = $1 AND status = 'shipped'
           RETURNING status`,
          [order.id],
        );
        status = updated.rows[0]?.status ?? order.status;
      }

      // Buyer hears about a recorded carrier failure only while the parcel
      // is genuinely in carrier hands — a 'paid' order's pre-dispatch
      // exception is evidence for ops, not a buyer-facing fact yet.
      notifyBuyerId = recorded && status === 'delivery_failed' ? order.buyer_id : null;

      await client.query('COMMIT');
      return {
        ok: true,
        orderId: order.id,
        eventType: body.eventType,
        recorded,
        duplicate: !recorded,
        occurredAt,
        status,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Client may already be released.
      }
      request.log.error({ err: error, orderId }, 'Carrier exception recording failed');
      reply.code(500);
      return { ok: false, error: 'Unable to record carrier exception' };
    } finally {
      client.release();
      if (notifyBuyerId) {
        await queueUserNotificationFn({
          userId: notifyBuyerId,
          title: body.eventType === 'lost' ? 'Parcel reported lost' : 'Parcel reported damaged',
          body: body.eventType === 'lost'
            ? 'The carrier reported your parcel as lost. Funds stay held while this is resolved.'
            : 'The carrier reported your parcel was damaged in transit. Funds stay held while this is resolved.',
          eventType: `order_parcel_${body.eventType}`,
          payload: {
            event: `order_parcel_${body.eventType}`,
            orderId,
            eventType: body.eventType,
          },
          route: { screen: 'OrderDetail', params: { orderId } },
          idempotencyKey: `order_parcel_${body.eventType}_buyer_${orderId}`,
          metadata: { source: 'carrier_exception' },
        }).catch((notificationError) => {
          request.log.warn(
            { err: notificationError, orderId, eventType: body.eventType },
            'Failed to queue buyer carrier-exception notification',
          );
        });
      }
    }
  });
}
