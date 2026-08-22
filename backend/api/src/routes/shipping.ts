import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  isCarrierLiveConfigured,
  getShippingQuotes,
  normalizeAndVerifyShippingWebhook,
} from '../lib/shippingProvider.js';
import { resolveCountryCapabilities } from '../lib/countryCapabilities.js';
import { getOrCreateComplianceProfile } from '../lib/compliance.js';

type ShippingRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createRuntimeId: (prefix: string) => string;
  toJsonString: (value: unknown) => string;
  normalizePostcode: (value: string) => string;
  ensureUserExists: (userId: string) => Promise<void>;
  resolveUserPrimaryPostcode: (client: Pool, userId: string) => Promise<string | null>;
  onezeP2pTablesAvailable: (client: Pool) => Promise<boolean>;
  applyOrderParcelEvent: (
    client: Pool,
    input: {
      orderId: string;
      provider: string;
      eventType: string;
      providerEventId: string;
      trackingId?: string;
      occurredAt: string;
      payload: Record<string, unknown>;
      source: string;
    }
  ) => Promise<{
    idempotent: boolean;
    order: {
      id: string;
      buyerId: string;
      sellerId: string;
      status: string;
      trackingNumber: string | null;
      shippingProvider: string | null;
    };
    parcelEvent: Record<string, unknown>;
    settlement: { sellerPayableReleasedGbp: string | null };
  }>;
  queueCommerceParcelSettlementNotifications: (input: {
    orderId: string;
    buyerId: string;
    sellerId: string;
    orderStatus: string;
    sellerPayableReleasedGbp: string | null;
    source: string;
    provider: string;
    eventType: string;
  }) => Promise<void>;
  sendCommerceOrderSmsNotifications: (input: {
    orderId: string;
    orderStatus: string;
    trackingNumber: string | null;
    shippingProvider: string | null;
  }) => Promise<void>;
  getApiError: (error: unknown) => { code: string; message: string; details?: Record<string, unknown> } | null;
};

export const registerShippingRoutes = ({
  app,
  db,
  createRuntimeId,
  toJsonString,
  normalizePostcode,
  ensureUserExists,
  resolveUserPrimaryPostcode,
  onezeP2pTablesAvailable,
  applyOrderParcelEvent,
  queueCommerceParcelSettlementNotifications,
  sendCommerceOrderSmsNotifications,
  getApiError,
}: ShippingRouteDependencies) => {
  app.post('/shipping/serviceability', async (request, reply) => {
    const bodySchema = z.object({
      buyerId: z.string().min(2).optional(),
      fromPostcode: z.string().min(2).max(24).optional(),
      toPostcode: z.string().min(2).max(24).optional(),
      countryCode: z.string().length(2).optional(),
      residencyCountryCode: z.string().length(2).nullable().optional(),
    });

    const payload = bodySchema.parse(request.body);
    const authUser = request.authUser;
    if (!authUser) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
      };
    }

    if (payload.buyerId && authUser.role !== 'admin' && authUser.userId !== payload.buyerId) {
      reply.code(403);
      return {
        ok: false,
        error: 'Forbidden: user context mismatch',
      };
    }

    const actorUserId = payload.buyerId ?? authUser.userId;

    let capabilities = resolveCountryCapabilities({
      countryCode: payload.countryCode ?? 'GB',
      residencyCountryCode: payload.residencyCountryCode,
    });

    if (actorUserId) {
      try {
        if (await onezeP2pTablesAvailable(db)) {
          const profile = await getOrCreateComplianceProfile(db, actorUserId);
          capabilities = resolveCountryCapabilities({
            countryCode: profile.countryCode,
            residencyCountryCode: profile.residencyCountryCode,
          });
        }
      } catch {
        // Falls back to countryCode/default policy.
      }
    }

    const carriers = capabilities.postage.carriers.map((carrier) => ({
      id: carrier.id,
      label: carrier.label,
      priceFromGbp: carrier.priceFromGbp,
      etaMinDays: carrier.etaMinDays,
      etaMaxDays: carrier.etaMaxDays,
      tracking: carrier.tracking,
      liveConfigured: isCarrierLiveConfigured(carrier.id),
    }));

    const fromPostcode = payload.fromPostcode ? normalizePostcode(payload.fromPostcode) : null;
    const toPostcode = payload.toPostcode ? normalizePostcode(payload.toPostcode) : null;
    const serviceable = true;

    return {
      ok: true,
      capabilities: {
        countryCluster: capabilities.countryCluster,
        countryCode: capabilities.countryCode,
        effectiveCountryCode: capabilities.effectiveCountryCode,
        policyVersion: capabilities.policyVersion,
      },
      serviceability: {
        fromPostcode,
        toPostcode,
        serviceable,
      },
      carriers,
    };
  });

  app.post('/shipping/quote', async (request, reply) => {
    const bodySchema = z.object({
      buyerId: z.string().min(2).optional(),
      listingId: z.string().min(2).optional(),
      sellerId: z.string().min(2).optional(),
      addressId: z.coerce.number().int().positive().optional(),
      originPostcode: z.string().min(2).max(24).optional(),
      destinationPostcode: z.string().min(2).max(24).optional(),
      preferredCarrierId: z.string().min(2).max(80).optional(),
      parcelWeightKg: z.number().positive().max(40).optional(),
      declaredValueGbp: z.number().positive().max(20000).optional(),
    });

    const payload = bodySchema.parse(request.body);

    const authUser = request.authUser;
    if (!authUser) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
      };
    }

    if (payload.buyerId && authUser.role !== 'admin' && authUser.userId !== payload.buyerId) {
      reply.code(403);
      return {
        ok: false,
        error: 'Forbidden: user context mismatch',
      };
    }

    const actorUserId = payload.buyerId ?? authUser.userId;

    await ensureUserExists(actorUserId);

    let sellerId = payload.sellerId ?? null;
    if (!sellerId && payload.listingId) {
      const listing = await db.query<{ seller_id: string }>(
        'SELECT seller_id FROM listings WHERE id = $1 LIMIT 1',
        [payload.listingId]
      );
      sellerId = listing.rows[0]?.seller_id ?? null;
    }

    if (!sellerId && !payload.originPostcode) {
      reply.code(400);
      return {
        ok: false,
        error: 'Seller context is required (sellerId, listingId, or originPostcode)',
      };
    }

    let destinationPostcode = payload.destinationPostcode
      ? normalizePostcode(payload.destinationPostcode)
      : null;

    if (!destinationPostcode && payload.addressId) {
      const address = await db.query<{ postcode: string }>(
        'SELECT postcode FROM user_addresses WHERE id = $1 AND user_id = $2 LIMIT 1',
        [payload.addressId, actorUserId]
      );
      destinationPostcode = address.rows[0]?.postcode ? normalizePostcode(address.rows[0].postcode) : null;
    }

    if (!destinationPostcode) {
      destinationPostcode = await resolveUserPrimaryPostcode(db, actorUserId);
      destinationPostcode = destinationPostcode ? normalizePostcode(destinationPostcode) : null;
    }

    let originPostcode = payload.originPostcode
      ? normalizePostcode(payload.originPostcode)
      : null;

    if (!originPostcode && sellerId) {
      const sellerPostcode = await resolveUserPrimaryPostcode(db, sellerId);
      originPostcode = sellerPostcode ? normalizePostcode(sellerPostcode) : null;
    }

    if (!originPostcode || !destinationPostcode) {
      reply.code(422);
      return {
        ok: false,
        error: 'Unable to resolve origin and destination postcodes for shipping quote',
      };
    }

    let capabilities = resolveCountryCapabilities({
      countryCode: 'GB',
    });

    try {
      if (await onezeP2pTablesAvailable(db)) {
        const profile = await getOrCreateComplianceProfile(db, actorUserId);
        capabilities = resolveCountryCapabilities({
          countryCode: profile.countryCode,
          residencyCountryCode: profile.residencyCountryCode,
        });
      }
    } catch {
      // Falls back to GB capability profile.
    }

    const carriers = [...capabilities.postage.carriers];

    if (carriers.length === 0) {
      return {
        ok: true,
        source: 'fallback',
        originPostcode,
        destinationPostcode,
        recommendedQuote: null,
        quotes: [],
        unavailableReason: 'Shipping quote not available for your region',
      };
    }

    if (payload.preferredCarrierId) {
      carriers.sort((left, right) => {
        if (left.id === payload.preferredCarrierId) {
          return -1;
        }
        if (right.id === payload.preferredCarrierId) {
          return 1;
        }
        return 0;
      });
    }

    const quoteResult = await getShippingQuotes({
      preferredCarriers: carriers.slice(0, 5),
      originPostcode,
      destinationPostcode,
      parcelWeightKg: payload.parcelWeightKg,
      declaredValueGbp: payload.declaredValueGbp,
    });

    const quoteExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const quotes = await Promise.all(quoteResult.quotes.map(async (quote) => {
      const quoteId = createRuntimeId('shipq');
      const quoteSnapshot = {
        quoteId,
        buyerId: actorUserId,
        sellerId,
        listingId: payload.listingId ?? null,
        addressId: payload.addressId ?? null,
        carrierId: quote.carrierId,
        priceGbp: quote.priceGbp,
        currency: 'GBP',
        source: quote.source,
        expiresAt: quoteExpiresAt,
      };
      const quoteHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(quoteSnapshot))
        .digest('hex');
      if (payload.listingId && sellerId) {
        await db.query(
          `INSERT INTO commerce_shipping_quotes (
             id, buyer_id, seller_id, listing_id, address_id,
             carrier_id, carrier_label, price_gbp, currency, source,
             quote_hash, provider_reference, metadata, expires_at
           )
           VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, 'GBP', $9,
             $10, $11, $12::jsonb, $13
           )`,
          [
            quoteId,
            actorUserId,
            sellerId,
            payload.listingId,
            payload.addressId ?? null,
            quote.carrierId,
            quote.carrierLabel,
            quote.priceGbp,
            quote.source,
            quoteHash,
            typeof quote.metadata.quoteRef === 'string'
              ? quote.metadata.quoteRef
              : null,
            toJsonString(quote.metadata),
            quoteExpiresAt,
          ]
        );
      }

      return {
        quoteId: payload.listingId && sellerId ? quoteId : null,
        quoteHash: payload.listingId && sellerId ? quoteHash : null,
        expiresAt: payload.listingId && sellerId ? quoteExpiresAt : null,
        carrierId: quote.carrierId,
        label: quote.carrierLabel,
        priceFromGbp: quote.priceGbp,
        etaMinDays: quote.etaMinDays,
        etaMaxDays: quote.etaMaxDays,
        tracking: quote.tracking,
        live: quote.live,
        source: quote.source,
        metadata: quote.metadata,
      };
    }));

    const recommendedQuote = quotes[0] ?? null;

    return {
      ok: true,
      source: quoteResult.source,
      originPostcode,
      destinationPostcode,
      recommendedQuote,
      quotes,
    };
  });

  const handleShippingWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({
      carrier: z.string().min(2).max(40),
    });

    const { carrier } = paramsSchema.parse(request.params);

    const rawBody =
      typeof request.rawBody === 'string'
        ? request.rawBody
        : Buffer.isBuffer(request.rawBody)
          ? request.rawBody.toString('utf8')
          : toJsonString(request.body ?? {});

    const verification = await normalizeAndVerifyShippingWebhook(
      carrier,
      request.headers as Record<string, unknown>,
      rawBody,
      request.body
    );

    if (!verification.verified || !verification.event) {
      reply.code(401);
      return {
        ok: false,
        error: verification.reason ?? 'Invalid shipping webhook payload',
      };
    }

    const event = verification.event;

    let orderId = event.orderId;
    if (!orderId && event.trackingNumber) {
      const orderByTracking = await db.query<{ id: string }>(
        `
        SELECT id
        FROM orders
        WHERE tracking_number = $1
        LIMIT 1
      `,
        [event.trackingNumber]
      );
      orderId = orderByTracking.rows[0]?.id ?? null;
    }

    if (!orderId) {
      return {
        ok: true,
        accepted: true,
        unresolved: true,
        reason: 'No order linked to shipping webhook payload',
        event: {
          provider: event.provider,
          providerEventId: event.providerEventId,
          trackingNumber: event.trackingNumber,
        },
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const applied = await applyOrderParcelEvent(client, {
        orderId,
        provider: event.provider,
        eventType: event.eventType,
        providerEventId: event.providerEventId,
        trackingId: event.trackingNumber ?? undefined,
        occurredAt: event.occurredAt,
        payload: {
          ...event.metadata,
          source: 'shipping_webhook',
          carrier: event.provider,
        },
        source: 'shipping_webhook',
      });

      await client.query('COMMIT');

      if (!applied.idempotent) {
        try {
          await queueCommerceParcelSettlementNotifications({
            orderId: applied.order.id,
            buyerId: applied.order.buyerId,
            sellerId: applied.order.sellerId,
            orderStatus: applied.order.status,
            sellerPayableReleasedGbp: applied.settlement.sellerPayableReleasedGbp,
            source: 'shipping_webhook',
            provider: event.provider,
            eventType: event.eventType,
          });
        } catch (notificationError) {
          request.log.error(
            {
              err: notificationError,
              orderId: applied.order.id,
              provider: event.provider,
              eventType: event.eventType,
            },
            'Failed to queue parcel settlement notifications from shipping webhook'
          );
        }
      }

      sendCommerceOrderSmsNotifications({
        orderId: applied.order.id,
        orderStatus: applied.order.status,
        trackingNumber: applied.order.trackingNumber,
        shippingProvider: applied.order.shippingProvider,
      }).catch(() => {});

      return {
        ok: true,
        accepted: true,
        unresolved: false,
        idempotent: applied.idempotent,
        order: applied.order,
        parcelEvent: applied.parcelEvent,
        settlement: applied.settlement,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const apiError = getApiError(error);
      if (apiError?.code === 'ORDER_NOT_FOUND') {
        reply.code(202);
        return {
          ok: true,
          accepted: true,
          unresolved: true,
          reason: apiError.message,
        };
      }

      if (apiError?.code === 'ORDER_NOT_READY' || apiError?.code === 'ORDER_INVALID_STATE') {
        reply.code(409);
        return {
          ok: false,
          error: apiError.message,
        };
      }

      if (apiError?.code === 'ESCROW_INSUFFICIENT') {
        reply.code(409);
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      request.log.error({ err: error, carrier, orderId }, 'Unable to process shipping webhook');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to process shipping webhook',
      };
    } finally {
      client.release();
    }
  };

  app.post('/webhooks/shipping/:carrier', async (request, reply) => handleShippingWebhook(request, reply));
  app.post('/shipping/webhooks/:carrier', async (request, reply) => handleShippingWebhook(request, reply));
};
