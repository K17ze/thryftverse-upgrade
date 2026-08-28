import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import Stripe from 'stripe';
import { config } from '../config.js';
import {
  moneyFromMajorDecimal,
  moneyFromMinor,
  moneyToMajorDecimal,
  type Money,
  type MoneyConversionTrace,
  type ProviderAmountUnit,
} from '../lib/money.js';
import {
  getOrCreateStripeCustomer,
  resolveActiveStripeMethod,
} from '../lib/stripePaymentMethods.js';
import {
  getOrCreateComplianceProfile,
} from '../lib/compliance.js';
import {
  isGatewayConfigured,
  resolveCountryCapabilities,
} from '../lib/countryCapabilities.js';
import {
  getAllowedGatewayIds,
  isGatewayAllowedForChannel,
  resolveChannelGateway,
} from '../lib/countryCapabilityPolicy.js';
import { getAvailableApmsForCorridor } from '../lib/alternativePaymentMethods.js';
import { getAvailableBnplForCorridor, computeBnplInstallmentPlan } from '../lib/bnplProviders.js';
import type { AuthenticatedUser } from '../lib/auth.js';

// ── Local helpers (mirrored from index.ts) ──

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeRequestHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function createRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

// ── Local types ──

interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

type DbQueryable = Pick<PoolClient, 'query'>;

type PaymentIntentChannel = 'commerce' | 'co-own' | 'wallet_topup' | 'wallet_withdrawal';
type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

interface PaymentIntentRow {
  id: string;
  user_id: string;
  gateway_id: string;
  channel: PaymentIntentChannel;
  order_id: string | null;
  coOwn_order_id: number | null;
  instrument_id: number | null;
  amount_gbp: number | string;
  amount_currency: string;
  amount_minor?: number | string | null;
  currency_exponent?: number | null;
  money_registry_version?: string | null;
  provider_amount?: string | null;
  provider_amount_unit?: ProviderAmountUnit | null;
  money_conversion_trace?: MoneyConversionTrace | null;
  money_quarantined?: boolean;
  status: PaymentIntentStatus;
  provider_intent_ref: string | null;
  client_secret: string | null;
  provider_status: string | null;
  next_action_url: string | null;
  sca_expires_at: string | null;
  settled_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  request_hash?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Dependency injection ──

type PaymentRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  stripe: Stripe | null;
  resolveAuthenticatedUserId: (request: { authUser?: AuthenticatedUser }, requestedUserId?: string) => string;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => ApiError;
  getApiError: (error: unknown) => ApiError | null;
  ensureUserExists: (userId: string) => Promise<void>;
  ensureSecurityAdminAccess: (
    request: { headers: Record<string, string | string[] | undefined>; authUser?: AuthenticatedUser },
    reply: { code: (statusCode: number) => unknown }
  ) => { ok: false; error: string } | null;
  paymentTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  ledgerTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  getLedgerAccountBalance: (client: DbQueryable, ownerType: string, ownerId: string, accountCode: string, currency?: string) => Promise<number>;
  toPaymentIntentPayload: (row: PaymentIntentRow) => Record<string, unknown>;
  toFiatMinor: (amountMajor: number, currency: string) => number;
  resolveDefaultGatewayForChannel: (channel: PaymentIntentChannel) => string;
  createGatewayPaymentIntent: (input: {
    gatewayId: string;
    intentId: string;
    channel: PaymentIntentChannel;
    money: Money;
    stripeCustomerId: string | null;
    stripePaymentMethodId: string | null;
    returnUrl?: string;
    webhookUrl?: string;
    platformFeeAmountGbp: number | null;
    radarSessionId?: string | null;
    metadata: Record<string, unknown>;
  }) => Promise<{
    providerIntentRef: string;
    clientSecret: string | null;
    providerStatus?: string | null;
    initialStatus: string;
    nextActionUrl?: string | null;
    scaExpiresAt?: string | null;
    providerAmount?: string | null;
    providerAmountUnit?: string | null;
    conversionTrace?: MoneyConversionTrace | null;
  }>;
  createGatewayRefund: (input: {
    gatewayId: string;
    intentId: string;
    providerIntentRef: string;
    money: Money;
    refundAmount: number;
    reason?: string;
    metadata: Record<string, unknown>;
  }) => Promise<{ providerRefundRef: string; refundStatus: 'pending' | 'succeeded' | 'failed' | 'cancelled' }>;
  transitionPaymentIntentStatus: (
    client: DbQueryable,
    input: {
      intentId: string;
      nextStatus: string;
      providerStatus?: string;
      nextActionUrl?: string | null;
      scaExpiresAt?: string | null;
      metadataPatch?: Record<string, unknown>;
    }
  ) => Promise<{ idempotent: boolean; intent: Record<string, unknown> }>;
  settlePaymentIntent: (
    client: DbQueryable,
    input: {
      intentId: string;
      finalStatus: string;
      providerFeeGbp?: number;
      providerAttemptRef?: string;
      failureCode?: string;
      failureMessage?: string;
      rawPayload?: Record<string, unknown>;
    }
  ) => Promise<{
    alreadyFinal: boolean;
    intent: Record<string, unknown>;
    orderSettlement?: { orderId: string } | null;
  }>;
  upsertPaymentRefund: (
    client: DbQueryable,
    input: {
      intentId: string;
      gatewayId: string;
      providerRefundRef: string;
      status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
      amount: number;
      currency: string;
      reason?: string;
      metadata: Record<string, unknown>;
      idempotencyKey?: string;
    }
  ) => Promise<void>;
  queueCommercePaymentNotifications: (input: {
    orderId: string;
    source: string;
  }) => Promise<void>;
  queueRefundCompletedNotification: (input: {
    userId: string;
    amountGbp: number;
    orderId?: string | null;
    source: string;
  }) => Promise<void>;
};

export const registerPaymentRoutes = ({
  app,
  db,
  stripe,
  resolveAuthenticatedUserId,
  createApiError,
  getApiError,
  ensureUserExists,
  ensureSecurityAdminAccess,
  paymentTablesAvailable,
  ledgerTablesAvailable,
  getLedgerAccountBalance,
  toPaymentIntentPayload,
  toFiatMinor,
  resolveDefaultGatewayForChannel,
  createGatewayPaymentIntent,
  createGatewayRefund,
  transitionPaymentIntentStatus,
  settlePaymentIntent,
  upsertPaymentRefund,
  queueCommercePaymentNotifications,
  queueRefundCompletedNotification,
}: PaymentRouteDependencies) => {

app.get('/payments/gateways', async (request) => {
  const querySchema = z.object({
    userId: z.string().min(2).optional(),
    channel: z.enum(['commerce', 'co-own', 'wallet_topup', 'wallet_withdrawal']).optional(),
  });
  const { userId, channel } = querySchema.parse(request.query ?? {});

  let allowedGatewayIds: string[] | null = null;
  if (userId) {
    const actorUserId = resolveAuthenticatedUserId(request, userId);
    await ensureUserExists(actorUserId);

    const complianceProfile = await getOrCreateComplianceProfile(db, actorUserId);
    const capabilities = resolveCountryCapabilities({
      countryCode: complianceProfile.countryCode,
      residencyCountryCode: complianceProfile.residencyCountryCode,
    });

    allowedGatewayIds = getAllowedGatewayIds(capabilities, channel);
  }

  const tableCheck = await db.query<{ exists: boolean }>(
    `SELECT to_regclass('public.payment_gateways') IS NOT NULL AS exists`
  );

  if (!tableCheck.rows[0]?.exists) {
    const fallbackItems = [
      {
        id: 'stripe_americas',
        displayName: 'Stripe Americas',
        type: 'fiat',
        isActive: true,
      },
      {
        id: 'mollie_eu',
        displayName: 'Mollie Europe',
        type: 'fiat',
        isActive: true,
      },
      {
        id: 'razorpay_in',
        displayName: 'Razorpay India',
        type: 'fiat',
        isActive: true,
      },
      {
        id: 'flutterwave_africa',
        displayName: 'Flutterwave Africa',
        type: 'fiat',
        isActive: true,
      },
      {
        id: 'tap_gulf',
        displayName: 'Tap Payments Gulf',
        type: 'fiat',
        isActive: true,
      },
      {
        id: 'wise_global',
        displayName: 'Wise Global',
        type: 'fiat',
        isActive: true,
      },
    ];

    const filteredFallbackItems = fallbackItems.filter(
      (item) =>
        isGatewayConfigured(item.id)
        && (allowedGatewayIds === null || allowedGatewayIds.includes(item.id))
    );

    return {
      ok: true,
      items: filteredFallbackItems,
    };
  }

  const result = await db.query<{
    id: string;
    display_name: string;
    gateway_type: 'fiat' | 'stablecoin';
    is_active: boolean;
  }>(
    `
      SELECT id, display_name, gateway_type, is_active
      FROM payment_gateways
      WHERE is_active = TRUE
        AND ($1::text[] IS NULL OR id = ANY($1))
      ORDER BY id ASC
    `,
    [allowedGatewayIds]
  );

  return {
    ok: true,
    items: result.rows
      .filter((row) => isGatewayConfigured(row.id))
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        type: row.gateway_type,
        isActive: row.is_active,
      })),
  };
});

app.get('/payments/platform/summary', async (request, reply) => {
  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  if (!(await ledgerTablesAvailable(db))) {
    return {
      ok: true,
      balances: {
        platformRevenueGbp: 0,
        platformOperatingGbp: 0,
        escrowLiabilityGbp: 0,
      },
    };
  }

  const [platformRevenueGbp, platformOperatingGbp, escrowLiabilityGbp] = await Promise.all([
    getLedgerAccountBalance(db, 'platform', 'platform', 'platform_revenue'),
    getLedgerAccountBalance(db, 'platform', 'platform', 'platform_operating'),
    getLedgerAccountBalance(db, 'platform', 'platform', 'escrow_liability'),
  ]);

  return {
    ok: true,
    balances: {
      platformRevenueGbp,
      platformOperatingGbp,
      escrowLiabilityGbp,
    },
  };
});

app.get('/payments/apms/available', async (request, reply) => {
  const querySchema = z.object({
    country: z.string().min(2).max(2).optional(),
    currency: z.string().min(3).max(3).optional(),
  });
  const { country, currency } = querySchema.parse(request.query);

  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Authentication required' };
  }

  const apms = getAvailableApmsForCorridor(country ?? 'GB', currency ?? 'GBP');
  const configured: Array<{ type: string; label: string; configured: boolean }> = [];

  for (const apm of apms) {
    const isConfigured =
      apm === 'paypal'
        ? Boolean(config.paypalClientId && config.paypalClientSecret)
        : apm === 'ideal' || apm === 'bancontact'
          ? Boolean(config.mollieApiKey)
          : apm === 'upi'
            ? Boolean(config.razorpayKeyId && config.razorpayKeySecret)
            : false;

    configured.push({
      type: apm,
      label:
        apm === 'paypal' ? 'PayPal'
        : apm === 'ideal' ? 'iDEAL'
        : apm === 'bancontact' ? 'Bancontact'
        : apm === 'upi' ? 'UPI'
        : apm,
      configured: isConfigured,
    });
  }

  return {
    ok: true,
    apms: configured.filter((a) => a.configured),
  };
});

// ── Available BNPL providers + installment plans ────────────────────────
app.get('/payments/bnpl/available', async (request, reply) => {
  const querySchema = z.object({
    country: z.string().min(2).max(2).optional(),
    currency: z.string().min(3).max(3).optional(),
    amount: z.coerce.number().min(0).optional(),
  });
  const { country, currency, amount } = querySchema.parse(request.query);

  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Authentication required' };
  }

  const bnpls = getAvailableBnplForCorridor(country ?? 'GB', currency ?? 'GBP');
  const result = bnpls.map((type) => {
    const plan = amount && amount > 0 ? computeBnplInstallmentPlan(type, amount) : null;
    return {
      type,
      label:
        type === 'klarna' ? 'Klarna'
        : type === 'clearpay' ? 'Clearpay'
        : type === 'affirm' ? 'Affirm'
        : type,
      plan,
    };
  });

  return {
    ok: true,
    bnpls: result,
  };
});

app.post('/payments/intents', async (request, reply) => {
  const bodySchema = z.object({
    userId: z.string().min(2).optional(),
    gatewayId: z.string().min(2).max(80).optional(),
    instrumentId: z.coerce.number().int().positive().optional(),
    orderId: z.string().min(4).max(64).optional(),
    coOwnOrderId: z.coerce.number().int().positive().optional(),
    channel: z.enum(['commerce', 'co-own', 'wallet_topup', 'wallet_withdrawal']).optional(),
    money: z.object({
      currency: z.string().length(3),
      minorAmount: z.string().regex(/^\d+$/),
    }).optional(),
    amountGbp: z.number().positive().optional(),
    amountCurrency: z.string().length(3).optional(),
    idempotencyKey: z.string().min(6).max(140).optional(),
    returnUrl: z.string().url().optional(),
    webhookUrl: z.string().url().optional(),
    metadata: z.record(z.unknown()).optional(),
    radarSessionId: z.string().min(4).max(200).optional(),
  });

  const payload = bodySchema.parse(request.body);
  const actorUserId = resolveAuthenticatedUserId(request, payload.userId);
  let requestedMoney: Money | null = null;
  try {
    requestedMoney = payload.money
      ? moneyFromMinor(payload.money.currency, payload.money.minorAmount)
      : null;
  } catch (error) {
    reply.code(400);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid canonical money payload',
      code: 'MONEY_INVALID',
    };
  }
  const legacyCurrency = (payload.amountCurrency ?? 'GBP').toUpperCase();
  if (payload.money && payload.amountGbp !== undefined) {
    reply.code(400);
    return {
      ok: false,
      error: 'Provide canonical money or legacy amountGbp, not both',
      code: 'AMBIGUOUS_MONEY_INPUT',
    };
  }
  if (!payload.money && payload.amountGbp !== undefined && legacyCurrency !== 'GBP') {
    reply.code(400);
    return {
      ok: false,
      error: 'Legacy amountGbp can only be used with GBP; send money.minorAmount for other currencies',
      code: 'LEGACY_CURRENCY_MISMATCH',
    };
  }
  const paymentRequestHash = computeRequestHash({
    userId: actorUserId,
    gatewayId: payload.gatewayId ?? null,
    instrumentId: payload.instrumentId ?? null,
    orderId: payload.orderId ?? null,
    coOwnOrderId: payload.coOwnOrderId ?? null,
    channel: payload.channel ?? null,
    amountGbp: payload.amountGbp ?? null,
    money: requestedMoney,
    amountCurrency: legacyCurrency,
    returnUrl: payload.returnUrl ?? null,
  });

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  if (payload.orderId && payload.coOwnOrderId) {
    reply.code(400);
    return {
      ok: false,
      error: 'Provide either orderId or coOwnOrderId, not both',
    };
  }

  if (!payload.orderId && !payload.coOwnOrderId && !payload.channel) {
    reply.code(400);
    return {
      ok: false,
      error: 'A payment intent source is required (orderId, coOwnOrderId, or channel)',
    };
  }
  if (
    (payload.orderId || payload.coOwnOrderId)
    && (
      payload.money
      || payload.amountGbp !== undefined
      || payload.amountCurrency !== undefined
    )
  ) {
    reply.code(400);
    return {
      ok: false,
      error: 'Order payment amount and currency are derived by the server',
      code: 'SERVER_DERIVED_MONEY_REQUIRED',
    };
  }
  if (
    (request as FastifyRequest & { apiVersion?: string }).apiVersion === 'v1'
    && !payload.orderId
    && !payload.coOwnOrderId
    && !payload.money
  ) {
    reply.code(400);
    return {
      ok: false,
      error: 'Versioned wallet payment intents require money.currency and money.minorAmount',
      code: 'CANONICAL_MONEY_REQUIRED',
    };
  }

  if (payload.idempotencyKey) {
    const existing = await db.query<PaymentIntentRow>(
      `
        SELECT
          id,
          user_id,
          gateway_id,
          channel,
          order_id,
          coOwn_order_id,
          instrument_id,
          amount_gbp,
          amount_currency,
          amount_minor,
          currency_exponent,
          money_registry_version,
          provider_amount,
          provider_amount_unit,
          money_conversion_trace,
          money_quarantined,
          status,
          provider_intent_ref,
          client_secret,
          provider_status,
          next_action_url,
          sca_expires_at,
          settled_at,
          failure_code,
          failure_message,
          request_hash,
          created_at,
          updated_at
        FROM payment_intents
        WHERE idempotency_key = $1
          AND user_id = $2
        LIMIT 1
      `,
      [payload.idempotencyKey, actorUserId]
    );

    if (existing.rowCount) {
      if (
        existing.rows[0].request_hash
        && existing.rows[0].request_hash !== paymentRequestHash
      ) {
        reply.code(409);
        return {
          ok: false,
          error: 'Idempotency key was already used with a different payment payload',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        };
      }
      return {
        ok: true,
        idempotent: true,
        intent: toPaymentIntentPayload(existing.rows[0]),
      };
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(actorUserId);

    const actorProfile = await getOrCreateComplianceProfile(client, actorUserId);
    const actorCapabilities = resolveCountryCapabilities({
      countryCode: actorProfile.countryCode,
      residencyCountryCode: actorProfile.residencyCountryCode,
    });
    const defaultGatewayForChannel = (
      intentChannel: PaymentIntentChannel,
      requestedGatewayId?: string
    ): string => resolveChannelGateway(
      actorCapabilities,
      intentChannel,
      requestedGatewayId,
      resolveDefaultGatewayForChannel(intentChannel)
    );

    let channel: PaymentIntentChannel;
    let paymentMoney: Money;
    let amountGbp: number;
    let gatewayId = defaultGatewayForChannel('commerce', payload.gatewayId);
    let orderId: string | null = null;
    let coOwnOrderId: number | null = null;
    let platformFeeAmountGbp: number | null = null;
    let selectedPaymentMethodProjectionId: number | null = null;

    if (payload.orderId) {
      // Fetch order with seller info
      // Note: Using platform Stripe account (Vinted/Depop model)
      // Funds go to platform account, ledger tracks seller payable for escrow
      const order = await client.query<{
        id: string;
        buyer_id: string;
        seller_id: string;
        total_gbp: number | string;
        status: string;
        payment_intent_id: string | null;
        payment_method_id: number | string | null;
        address_id: number | string | null;
        shipping_quote_id: string | null;
        checkout_expires_at: string | null;
        reservation_status: string | null;
        reservation_expires_at: string | null;
      }>(
        `
          SELECT
            o.id,
            o.buyer_id,
            o.seller_id,
            o.total_gbp,
            o.status,
            o.payment_intent_id,
            o.payment_method_id,
            o.address_id,
            o.shipping_quote_id,
            o.checkout_expires_at::text,
            reservation.status AS reservation_status,
            reservation.expires_at::text AS reservation_expires_at
          FROM orders o
          LEFT JOIN listing_checkout_reservations reservation
            ON reservation.order_id = o.id
          WHERE o.id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [payload.orderId]
      );

      const orderRow = order.rows[0];
      if (!orderRow) {
        await client.query('ROLLBACK');
        reply.code(404);
        return {
          ok: false,
          error: 'Order not found',
        };
      }

      if (orderRow.buyer_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(400);
        return {
          ok: false,
          error: 'Order does not belong to this user',
        };
      }

      if (orderRow.status !== 'created') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Order cannot create a payment intent from status '${orderRow.status}'`,
        };
      }
      if (!orderRow.address_id || !orderRow.shipping_quote_id) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Delivery address and a current shipping quote are required before payment',
          code: 'CHECKOUT_DETAILS_REQUIRED',
        };
      }

      const checkoutExpiry = orderRow.reservation_expires_at
        ?? orderRow.checkout_expires_at;
      if (
        checkoutExpiry
        && (
          orderRow.reservation_status !== 'active'
          || Date.parse(checkoutExpiry) <= Date.now()
        )
      ) {
        await client.query(
          `UPDATE orders
           SET status = 'cancelled', updated_at = NOW()
           WHERE id = $1 AND status = 'created'`,
          [orderRow.id]
        );
        await client.query(
          `INSERT INTO order_events (
             order_id, event_type, actor_id, source, deduplication_key, metadata
           )
           VALUES ($1, 'reservation.expired', $2, 'payment_intent', $3, $4::jsonb)
           ON CONFLICT (order_id, deduplication_key)
             WHERE deduplication_key IS NOT NULL
           DO NOTHING`,
          [
            orderRow.id,
            actorUserId,
            `reservation.expired:${orderRow.id}`,
            toJsonString({ expiresAt: checkoutExpiry }),
          ]
        );
        await client.query('COMMIT');
        reply.code(410);
        return {
          ok: false,
          error: 'Checkout reservation has expired',
          code: 'CHECKOUT_RESERVATION_EXPIRED',
        };
      }

      if (orderRow.payment_intent_id) {
        const boundIntent = await client.query<PaymentIntentRow>(
          `SELECT
             id, user_id, gateway_id, channel, order_id, coOwn_order_id,
             instrument_id, amount_gbp, amount_currency, status,
             provider_intent_ref, client_secret, provider_status,
             next_action_url, sca_expires_at, settled_at,
             failure_code, failure_message, created_at, updated_at
           FROM payment_intents
           WHERE id = $1
           LIMIT 1`,
          [orderRow.payment_intent_id]
        );
        if (boundIntent.rowCount) {
          await client.query('COMMIT');
          return {
            ok: true,
            idempotent: true,
            intent: toPaymentIntentPayload(boundIntent.rows[0]),
          };
        }
      }

      channel = 'commerce';
      amountGbp = Number(orderRow.total_gbp);
      paymentMoney = moneyFromMajorDecimal('GBP', String(orderRow.total_gbp));
      orderId = orderRow.id;
      selectedPaymentMethodProjectionId = orderRow.payment_method_id
        ? Number(orderRow.payment_method_id)
        : null;
      gatewayId = defaultGatewayForChannel(channel, payload.gatewayId);

      // Calculate platform fee (5% + £0.70 fixed)
      // Note: Fee is tracked in ledger, not extracted via Stripe Connect
      const platformChargeRate = 0.05;
      const platformChargeFixed = 0.70;
      const subtotalGbp = amountGbp / (1 + platformChargeRate);
      platformFeeAmountGbp = roundTo(subtotalGbp * platformChargeRate + platformChargeFixed, 2);
    } else if (payload.coOwnOrderId) {
      const coOwnOrder = await client.query<{
        id: number;
        user_id: string;
        total_gbp: number | string;
      }>(
        'SELECT id, user_id, total_gbp FROM coOwn_orders WHERE id = $1 LIMIT 1',
        [payload.coOwnOrderId]
      );

      const coOwnOrderRow = coOwnOrder.rows[0];
      if (!coOwnOrderRow) {
        await client.query('ROLLBACK');
        reply.code(404);
        return {
          ok: false,
          error: 'Co-Own order not found',
        };
      }

      if (coOwnOrderRow.user_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(400);
        return {
          ok: false,
          error: 'Co-Own order does not belong to this user',
        };
      }

      channel = 'co-own';
      amountGbp = Number(coOwnOrderRow.total_gbp);
      paymentMoney = moneyFromMajorDecimal('GBP', String(coOwnOrderRow.total_gbp));
      coOwnOrderId = coOwnOrderRow.id;
      gatewayId = defaultGatewayForChannel(channel, payload.gatewayId);
    } else {
      channel = payload.channel as PaymentIntentChannel;
      if (!requestedMoney && (!payload.amountGbp || !Number.isFinite(payload.amountGbp) || payload.amountGbp <= 0)) {
        await client.query('ROLLBACK');
        reply.code(400);
        return {
          ok: false,
          error: 'money.minorAmount is required for wallet payment intents',
        };
      }

      paymentMoney = requestedMoney
        ?? moneyFromMajorDecimal('GBP', roundTo(payload.amountGbp ?? 0, 2).toFixed(2));
      amountGbp = paymentMoney.currency === 'GBP'
        ? Number(moneyToMajorDecimal(paymentMoney))
        : 0;
      gatewayId = defaultGatewayForChannel(channel, payload.gatewayId);
    }

    if (!isGatewayAllowedForChannel(actorCapabilities, channel, gatewayId)) {
      await client.query('ROLLBACK');
      reply.code(403);
      return {
        ok: false,
        error: 'Gateway is unavailable in your country policy for this payment channel',
      };
    }

    if (!isGatewayConfigured(gatewayId)) {
      await client.query('ROLLBACK');
      reply.code(503);
      return {
        ok: false,
        error: 'Payment gateway for your region is not yet available. Contact support.',
        gatewayId,
      };
    }

    const gateway = await client.query<{ id: string }>(
      'SELECT id FROM payment_gateways WHERE id = $1 AND is_active = TRUE LIMIT 1',
      [gatewayId]
    );

    if (!gateway.rowCount) {
      await client.query('ROLLBACK');
      reply.code(400);
      return {
        ok: false,
        error: 'Gateway is not available for this intent',
      };
    }

    if (payload.instrumentId) {
      const instrument = await client.query<{ id: number }>(
        `
          SELECT id
          FROM payment_instruments
          WHERE id = $1 AND user_id = $2
          LIMIT 1
        `,
        [payload.instrumentId, actorUserId]
      );

      if (!instrument.rowCount) {
        await client.query('ROLLBACK');
        reply.code(400);
        return {
          ok: false,
          error: 'Instrument does not belong to this user',
        };
      }
    }

    let stripeCustomerId: string | null = null;
    let stripePaymentMethodId: string | null = null;
    if (gatewayId === 'stripe_americas') {
      if (!stripe) {
        await client.query('ROLLBACK');
        reply.code(503);
        return {
          ok: false,
          error: 'Stripe payment collection is not configured',
          code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        };
      }

      const customer = await getOrCreateStripeCustomer({
        db: client,
        stripe,
        userId: actorUserId,
      });
      stripeCustomerId = customer.customerId;

      if (selectedPaymentMethodProjectionId) {
        const selectedMethod = await resolveActiveStripeMethod({
          db: client,
          userId: actorUserId,
          projectionId: selectedPaymentMethodProjectionId,
        });
        if (!selectedMethod || selectedMethod.customerId !== stripeCustomerId) {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'The selected payment method must be added again before checkout',
            code: 'PAYMENT_METHOD_RECOLLECTION_REQUIRED',
          };
        }
        stripePaymentMethodId = selectedMethod.paymentMethodId;
      }
    }

    const intentId = createRuntimeId('pi');
    const gatewayIntent = await createGatewayPaymentIntent({
      gatewayId,
      intentId,
      channel,
      money: paymentMoney,
      stripeCustomerId,
      stripePaymentMethodId,
      returnUrl: payload.returnUrl,
      webhookUrl: payload.webhookUrl,
      platformFeeAmountGbp,
      radarSessionId: payload.radarSessionId ?? null,
      metadata: {
        ...(payload.metadata ?? {}),
        userId: actorUserId,
        orderId,
        coOwnOrderId,
        platformFeeAmountGbp,
      },
    });

    const inserted = await client.query<PaymentIntentRow>(
      `
        INSERT INTO payment_intents (
          id,
          user_id,
          gateway_id,
          channel,
          order_id,
          coOwn_order_id,
          instrument_id,
          amount_gbp,
          amount_currency,
          amount_minor,
          currency_exponent,
          money_registry_version,
          provider_amount,
          provider_amount_unit,
          money_conversion_trace,
          status,
          provider_intent_ref,
          client_secret,
          provider_status,
          next_action_url,
          sca_expires_at,
          idempotency_key,
          request_hash,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15::jsonb,
          $16, $17, $18, $19, $20, $21, $22, $23, $24::jsonb
        )
        RETURNING
          id,
          user_id,
          gateway_id,
          channel,
          order_id,
          coOwn_order_id,
          instrument_id,
          amount_gbp,
          amount_currency,
          amount_minor,
          currency_exponent,
          money_registry_version,
          provider_amount,
          provider_amount_unit,
          money_conversion_trace,
          money_quarantined,
          status,
          provider_intent_ref,
          client_secret,
          provider_status,
          next_action_url,
          sca_expires_at,
          settled_at,
          failure_code,
          failure_message,
          created_at,
          updated_at
      `,
      [
        intentId,
        actorUserId,
        gatewayId,
        channel,
        orderId,
        coOwnOrderId,
        payload.instrumentId ?? null,
        moneyToMajorDecimal(paymentMoney),
        paymentMoney.currency,
        paymentMoney.minorAmount,
        paymentMoney.exponent,
        paymentMoney.registryVersion,
        gatewayIntent.providerAmount,
        gatewayIntent.providerAmountUnit,
        toJsonString(gatewayIntent.conversionTrace),
        gatewayIntent.initialStatus,
        gatewayIntent.providerIntentRef,
        gatewayIntent.clientSecret,
        gatewayIntent.providerStatus ?? null,
        gatewayIntent.nextActionUrl ?? null,
        gatewayIntent.scaExpiresAt ?? null,
        payload.idempotencyKey ?? null,
        paymentRequestHash,
        toJsonString({
          ...(payload.metadata ?? {}),
          canonicalMoney: paymentMoney,
          providerConversion: gatewayIntent.conversionTrace,
        }),
      ]
    );

    if (orderId) {
      const bound = await client.query(
        `UPDATE orders
         SET payment_intent_id = $2, updated_at = NOW()
         WHERE id = $1
           AND status = 'created'
           AND (payment_intent_id IS NULL OR payment_intent_id = $2)`,
        [orderId, intentId]
      );
      if (!bound.rowCount) {
        throw createApiError(
          'ORDER_PAYMENT_INTENT_CONFLICT',
          'Order already has a different payment attempt'
        );
      }
      await client.query(
        `INSERT INTO order_events (
           order_id, event_type, actor_id, source, deduplication_key, metadata
         )
         VALUES ($1, 'payment.required', $2, 'payment_intent', $3, $4::jsonb)
         ON CONFLICT (order_id, deduplication_key)
           WHERE deduplication_key IS NOT NULL
         DO NOTHING`,
        [
          orderId,
          actorUserId,
          `payment.required:${intentId}`,
          toJsonString({ intentId, gatewayId, amountGbp }),
        ]
      );
    }

    await client.query('COMMIT');

    // ── Inline settlement for 1ZE internal gateway ──
    // The 1ZE payment is atomic — the intent is already 'succeeded'.
    // Settle inline to post ledger entries (debit 1ZE wallet, credit
    // escrow) and advance the order to 'paid' without waiting for a
    // webhook or explicit confirm call.
    if (gatewayId === 'oneze_internal' && gatewayIntent.initialStatus === 'succeeded') {
      try {
        const settleClient = await db.connect();
        try {
          await settleClient.query('BEGIN');
          const settled = await settlePaymentIntent(settleClient, {
            intentId,
            finalStatus: 'succeeded',
            providerAttemptRef: gatewayIntent.providerIntentRef,
            rawPayload: { gateway: 'oneze_internal', settledAt: new Date().toISOString() },
          });
          await settleClient.query('COMMIT');

          reply.code(201);
          return {
            ok: true,
            idempotent: false,
            intent: settled.intent,
          };
        } catch (inlineSettleError) {
          await settleClient.query('ROLLBACK');
          request.log.error(
            { err: inlineSettleError, intentId },
            '1ZE inline settlement failed — intent is succeeded but order not settled'
          );
          // Fall through to return the succeeded intent as-is.
        } finally {
          settleClient.release();
        }
      } catch (settleClientError) {
        request.log.error(
          { err: settleClientError, intentId },
          'Failed to acquire client for 1ZE inline settlement'
        );
      }
    }

    reply.code(201);
    return {
      ok: true,
      idempotent: false,
      intent: toPaymentIntentPayload(inserted.rows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      throw apiError;
    }
    request.log.error({ err: error }, 'Failed to create payment intent');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to create payment intent',
    };
  } finally {
    client.release();
  }
});

app.get('/payments/intents/:intentId', async (request, reply) => {
  const paramsSchema = z.object({ intentId: z.string().min(4).max(120) });
  const { intentId } = paramsSchema.parse(request.params);

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const result = await db.query<PaymentIntentRow>(
    `
      SELECT
        id,
        user_id,
        gateway_id,
        channel,
        order_id,
        coOwn_order_id,
        instrument_id,
        amount_gbp,
        amount_currency,
        amount_minor,
        currency_exponent,
        money_registry_version,
        provider_amount,
        provider_amount_unit,
        money_conversion_trace,
        money_quarantined,
        status,
        provider_intent_ref,
        client_secret,
        provider_status,
        next_action_url,
        sca_expires_at,
        settled_at,
        failure_code,
        failure_message,
        created_at,
        updated_at
      FROM payment_intents
      WHERE id = $1
      LIMIT 1
    `,
    [intentId]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return {
      ok: false,
      error: 'Payment intent not found',
    };
  }

  if (!request.authUser || (request.authUser.role !== 'admin' && request.authUser.userId !== row.user_id)) {
    reply.code(403);
    return {
      ok: false,
      error: 'Forbidden: payment intent access denied',
    };
  }

  return {
    ok: true,
    intent: toPaymentIntentPayload(row),
  };
});

app.post('/payments/intents/:intentId/confirm', async (request, reply) => {
  const paramsSchema = z.object({ intentId: z.string().min(4).max(120) });
  const bodySchema = z.object({
    simulateStatus: z.enum(['processing', 'succeeded', 'failed', 'cancelled']).default('processing'),
    providerFeeGbp: z.number().min(0).optional(),
    providerAttemptRef: z.string().min(4).max(140).optional(),
    providerStatus: z.string().max(120).optional(),
    nextActionUrl: z.string().url().optional(),
    scaExpiresAt: z.string().datetime().optional(),
    failureCode: z.string().max(80).optional(),
    failureMessage: z.string().max(240).optional(),
    payload: z.record(z.unknown()).optional(),
  });

  const { intentId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const ownerCheck = await client.query<{ user_id: string }>(
      `
        SELECT user_id
        FROM payment_intents
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [intentId]
    );

    const ownerRow = ownerCheck.rows[0];
    if (!ownerRow) {
      await client.query('ROLLBACK');
      reply.code(404);
      return {
        ok: false,
        error: 'Payment intent not found',
      };
    }

    if (!request.authUser || (request.authUser.role !== 'admin' && request.authUser.userId !== ownerRow.user_id)) {
      await client.query('ROLLBACK');
      reply.code(403);
      return {
        ok: false,
        error: 'Forbidden: payment intent access denied',
      };
    }

    if (payload.simulateStatus !== 'processing') {
      if (config.nodeEnv === 'production' && request.authUser?.role !== 'admin') {
        await client.query('ROLLBACK');
        reply.code(403);
        return {
          ok: false,
          error: 'Forbidden: terminal status simulation is not allowed in production for non-admin users',
        };
      }
    }

    if (payload.simulateStatus === 'processing') {
      const transitioned = await transitionPaymentIntentStatus(client, {
        intentId,
        nextStatus: 'processing',
        providerStatus: payload.providerStatus ?? 'processing',
        nextActionUrl: payload.nextActionUrl ?? null,
        scaExpiresAt: payload.scaExpiresAt ?? null,
        metadataPatch: {
          source: 'manual_confirm',
          ...(payload.payload ?? {}),
        },
      });

      await client.query('COMMIT');
      return {
        ok: true,
        alreadyFinal: false,
        idempotent: transitioned.idempotent,
        intent: transitioned.intent,
      };
    }

    const settled = await settlePaymentIntent(client, {
      intentId,
      finalStatus: payload.simulateStatus,
      providerFeeGbp: payload.providerFeeGbp,
      providerAttemptRef: payload.providerAttemptRef,
      failureCode: payload.failureCode,
      failureMessage: payload.failureMessage,
      rawPayload: {
        source: 'manual_confirm',
        ...(payload.payload ?? {}),
      },
    });

    await client.query('COMMIT');

    if (!settled.alreadyFinal && payload.simulateStatus === 'succeeded' && settled.orderSettlement?.orderId) {
      try {
        await queueCommercePaymentNotifications({
          orderId: settled.orderSettlement.orderId,
          source: 'manual_confirm',
        });
      } catch (notificationError) {
        request.log.error(
          {
            err: notificationError,
            orderId: settled.orderSettlement.orderId,
          },
          'Failed to queue payment notifications after manual payment confirm'
        );
      }
    }

    return {
      ok: true,
      alreadyFinal: settled.alreadyFinal,
      intent: settled.intent,
      orderSettlement: settled.orderSettlement,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if ((error as Error).message === 'PAYMENT_INTENT_NOT_FOUND') {
      reply.code(404);
      return {
        ok: false,
        error: 'Payment intent not found',
      };
    }

    const apiError = getApiError(error);
    if (apiError?.code === 'PAYMENT_INTENT_INVALID_TRANSITION') {
      reply.code(409);
      return {
        ok: false,
        error: apiError.message,
      };
    }

    request.log.error({ err: error, intentId }, 'Failed to confirm payment intent');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to confirm payment intent',
    };
  } finally {
    client.release();
  }
});

app.post('/payments/intents/:intentId/refunds', async (request, reply) => {
  const paramsSchema = z.object({ intentId: z.string().min(4).max(120) });
  const bodySchema = z.object({
    amount: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    reason: z.string().max(240).optional(),
    idempotencyKey: z.string().min(4).max(255).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const { intentId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const intentResult = await client.query<PaymentIntentRow>(
      `
        SELECT
          id,
          user_id,
          gateway_id,
          channel,
          order_id,
          coOwn_order_id,
          instrument_id,
          amount_gbp,
          amount_currency,
          amount_minor,
          currency_exponent,
          money_registry_version,
          provider_amount,
          provider_amount_unit,
          money_conversion_trace,
          money_quarantined,
          status,
          provider_intent_ref,
          client_secret,
          provider_status,
          next_action_url,
          sca_expires_at,
          settled_at,
          failure_code,
          failure_message,
          created_at,
          updated_at
        FROM payment_intents
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [intentId]
    );

    const intent = intentResult.rows[0];
    if (!intent) {
      await client.query('ROLLBACK');
      reply.code(404);
      return {
        ok: false,
        error: 'Payment intent not found',
      };
    }

    if (!request.authUser || (request.authUser.role !== 'admin' && request.authUser.userId !== intent.user_id)) {
      await client.query('ROLLBACK');
      reply.code(403);
      return {
        ok: false,
        error: 'Forbidden: payment intent access denied',
      };
    }

    if (intent.status !== 'succeeded') {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Refunds can only be initiated for succeeded payment intents',
      };
    }

    const amount = roundTo(payload.amount ?? Number(intent.amount_gbp), 2);
    const currency = (payload.currency ?? intent.amount_currency ?? 'GBP').toUpperCase();

    // Remaining-refundable guard: reject if the requested amount exceeds
    // the unrefunded balance of the intent.
    const refundedResult = await client.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM payment_refunds
       WHERE intent_id = $1 AND status IN ('succeeded', 'pending')`,
      [intentId]
    );
    const alreadyRefunded = Number(refundedResult.rows[0].total ?? '0');
    const remainingRefundable = Number(intent.amount_gbp) - alreadyRefunded;
    if (amount > remainingRefundable + 0.001) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: `Refund amount ${amount} exceeds remaining refundable ${remainingRefundable.toFixed(2)}`,
        code: 'REFUND_EXCEEDS_REMAINING',
      };
    }

    // Idempotency check: if an idempotency key is provided and a refund
    // with that key already exists for this intent, replay the cached result.
    if (payload.idempotencyKey) {
      const existingRefund = await client.query<{
        id: string;
        status: string;
        amount: number | string;
        currency: string;
        provider_refund_ref: string;
      }>(
        `SELECT id, status, amount, currency, provider_refund_ref
         FROM payment_refunds
         WHERE intent_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [intentId, payload.idempotencyKey]
      );
      if (existingRefund.rowCount) {
        await client.query('COMMIT');
        return {
          ok: true,
          idempotent: true,
          refund: {
            intentId,
            gatewayId: intent.gateway_id,
            providerRefundRef: existingRefund.rows[0].provider_refund_ref,
            status: existingRefund.rows[0].status,
            amount: Number(existingRefund.rows[0].amount),
            currency: existingRefund.rows[0].currency,
          },
        };
      }
    }

    let providerRefundRef = createRuntimeId(`refund_${intent.gateway_id}`);
    let refundStatus: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'unknown' = 'pending';

    // Dispatch to the appropriate provider for a backed refund.
    // All configured gateways now return money to the buyer's instrument
    // rather than only recording a local ledger entry.
    if (intent.provider_intent_ref) {
      const refundMoney = moneyFromMinor(
        currency,
        String(
          toFiatMinor(amount, currency)
        )
      );
      const gatewayRefund = await createGatewayRefund({
        gatewayId: intent.gateway_id,
        intentId,
        providerIntentRef: intent.provider_intent_ref,
        money: refundMoney,
        refundAmount: amount,
        reason: payload.reason,
        metadata: {
          source: 'manual_refund_request',
          refundOperationId: providerRefundRef,
          ...(payload.metadata ?? {}),
        },
      });
      providerRefundRef = gatewayRefund.providerRefundRef;
      refundStatus = gatewayRefund.refundStatus;
    }

    await upsertPaymentRefund(client, {
      intentId,
      gatewayId: intent.gateway_id,
      providerRefundRef,
      status: refundStatus,
      amount,
      currency,
      reason: payload.reason,
      idempotencyKey: payload.idempotencyKey,
      metadata: {
        source: 'manual_refund_request',
        ...(payload.metadata ?? {}),
      },
    });

    await client.query('COMMIT');

    if (refundStatus === 'succeeded') {
      try {
        await queueRefundCompletedNotification({
          userId: intent.user_id,
          amountGbp: amount,
          orderId: intent.order_id,
          source: 'manual_refund_request',
        });
      } catch (notificationError) {
        request.log.error(
          {
            err: notificationError,
            intentId,
            orderId: intent.order_id,
          },
          'Failed to queue refund notifications after manual refund request'
        );
      }
    }

    reply.code(201);
    return {
      ok: true,
      refund: {
        intentId,
        gatewayId: intent.gateway_id,
        providerRefundRef,
        status: refundStatus,
        amount,
        currency,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ err: error, intentId }, 'Failed to initiate refund');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to initiate refund',
    };
  } finally {
    client.release();
  }
});

app.get('/payments/intents/:intentId/refunds', async (request, reply) => {
  const paramsSchema = z.object({ intentId: z.string().min(4).max(120) });
  const { intentId } = paramsSchema.parse(request.params);

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const intentOwner = await db.query<{ user_id: string }>(
    'SELECT user_id FROM payment_intents WHERE id = $1 LIMIT 1',
    [intentId]
  );

  const ownerRow = intentOwner.rows[0];
  if (!ownerRow) {
    reply.code(404);
    return {
      ok: false,
      error: 'Payment intent not found',
    };
  }

  if (!request.authUser || (request.authUser.role !== 'admin' && request.authUser.userId !== ownerRow.user_id)) {
    reply.code(403);
    return {
      ok: false,
      error: 'Forbidden: payment intent access denied',
    };
  }

  const result = await db.query<{
    id: string;
    intent_id: string;
    gateway_id: string;
    amount: string;
    currency: string;
    status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    provider_refund_ref: string;
    reason: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT
        id,
        intent_id,
        gateway_id,
        amount::text,
        currency,
        status,
        provider_refund_ref,
        reason,
        metadata,
        created_at::text,
        updated_at::text
      FROM payment_refunds
      WHERE intent_id = $1
      ORDER BY created_at DESC
    `,
    [intentId]
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      intentId: row.intent_id,
      gatewayId: row.gateway_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      providerRefundRef: row.provider_refund_ref,
      reason: row.reason,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
});

app.get('/payments/disputes', async (request, reply) => {
  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  const querySchema = z.object({
    status: z.enum(['open', 'warning', 'needs_response', 'won', 'lost', 'closed']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(80),
  });
  const { status, limit } = querySchema.parse(request.query);

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const result = await db.query<{
    id: string;
    intent_id: string | null;
    gateway_id: string;
    provider_dispute_ref: string;
    status: 'open' | 'warning' | 'needs_response' | 'won' | 'lost' | 'closed';
    amount: string;
    currency: string;
    reason: string | null;
    evidence_due_at: string | null;
    evidence_submitted_at: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT
        id,
        intent_id,
        gateway_id,
        provider_dispute_ref,
        status,
        amount::text,
        currency,
        reason,
        evidence_due_at::text,
        evidence_submitted_at::text,
        metadata,
        created_at::text,
        updated_at::text
      FROM payment_disputes
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY updated_at DESC
      LIMIT $2
    `,
    [status ?? null, limit]
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      intentId: row.intent_id,
      gatewayId: row.gateway_id,
      providerDisputeRef: row.provider_dispute_ref,
      status: row.status,
      amount: Number(row.amount),
      currency: row.currency,
      reason: row.reason,
      evidenceDueAt: row.evidence_due_at,
      evidenceSubmittedAt: row.evidence_submitted_at,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
});

// ── Dispute detail ──────────────────────────────────────────────────────
app.get('/payments/disputes/:disputeId', async (request, reply) => {
  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  const { disputeId } = z.object({
    disputeId: z.string().min(4).max(120),
  }).parse(request.params);

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const result = await db.query<{
    id: string;
    intent_id: string | null;
    gateway_id: string;
    provider_dispute_ref: string;
    status: 'open' | 'warning' | 'needs_response' | 'won' | 'lost' | 'closed';
    amount: string;
    currency: string;
    reason: string | null;
    evidence_due_at: string | null;
    evidence_submitted_at: string | null;
    evidence_payload: Record<string, unknown>;
    evidence_provider_ref: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT
        id,
        intent_id,
        gateway_id,
        provider_dispute_ref,
        status,
        amount::text,
        currency,
        reason,
        evidence_due_at::text,
        evidence_submitted_at::text,
        evidence_payload,
        evidence_provider_ref,
        metadata,
        created_at::text,
        updated_at::text
      FROM payment_disputes
      WHERE id = $1
      LIMIT 1
    `,
    [disputeId]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'Dispute not found' };
  }

  const eventsResult = await db.query<{
    id: number;
    event_type: string;
    actor_id: string | null;
    payload: Record<string, unknown>;
    created_at: string;
  }>(
    `
      SELECT id, event_type, actor_id, payload, created_at::text
      FROM payment_dispute_events
      WHERE dispute_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [disputeId]
  );

  return {
    ok: true,
    dispute: {
      id: row.id,
      intentId: row.intent_id,
      gatewayId: row.gateway_id,
      providerDisputeRef: row.provider_dispute_ref,
      status: row.status,
      amount: Number(row.amount),
      currency: row.currency,
      reason: row.reason,
      evidenceDueAt: row.evidence_due_at,
      evidenceSubmittedAt: row.evidence_submitted_at,
      evidencePayload: row.evidence_payload,
      evidenceProviderRef: row.evidence_provider_ref,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    events: eventsResult.rows.map((e) => ({
      id: Number(e.id),
      eventType: e.event_type,
      actorId: e.actor_id,
      payload: e.payload,
      createdAt: e.created_at,
    })),
  };
});

// ── Dispute evidence submission ─────────────────────────────────────────
app.post('/payments/disputes/:disputeId/evidence', async (request, reply) => {
  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  const { disputeId } = z.object({
    disputeId: z.string().min(4).max(120),
  }).parse(request.params);

  const bodySchema = z.object({
    evidence: z.record(z.unknown()),
    submitToProvider: z.boolean().default(true),
  });
  const payload = bodySchema.parse(request.body ?? {});

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const disputeResult = await client.query<{
      id: string;
      intent_id: string | null;
      gateway_id: string;
      provider_dispute_ref: string;
      status: string;
      evidence_submitted_at: string | null;
    }>(
      `SELECT id, intent_id, gateway_id, provider_dispute_ref, status, evidence_submitted_at
       FROM payment_disputes
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [disputeId]
    );

    const dispute = disputeResult.rows[0];
    if (!dispute) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Dispute not found' };
    }

    if (dispute.status === 'won' || dispute.status === 'lost' || dispute.status === 'closed') {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: `Cannot submit evidence for a dispute with status '${dispute.status}'`,
      };
    }

    if (dispute.evidence_submitted_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Evidence has already been submitted for this dispute',
      };
    }

    let evidenceProviderRef: string | null = null;
    const actorUserId = request.authUser?.userId ?? null;

    // Submit evidence to the provider when supported.
    if (payload.submitToProvider && dispute.gateway_id === 'stripe_americas' && config.stripeSecretKey) {
      const stripe = new Stripe(config.stripeSecretKey, {
        apiVersion: '2024-06-20',
      });
      try {
        const evidenceResponse = await stripe.disputes.update(
          dispute.provider_dispute_ref,
          payload.evidence as Stripe.DisputeUpdateParams
        );
        evidenceProviderRef = evidenceResponse.id ?? null;
      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error({ err: error, disputeId }, 'Stripe dispute evidence submission failed');
        reply.code(502);
        return {
          ok: false,
          error: 'Stripe rejected the dispute evidence submission',
        };
      }
    }
    // For Razorpay/Mollie/Flutterwave/Tap: evidence is stored locally only.
    // These providers do not expose a synchronous evidence submission API;
    // the platform documents its response and uses it in representment.

    const now = new Date().toISOString();
    await client.query(
      `UPDATE payment_disputes
       SET evidence_submitted_at = $2,
           evidence_payload = $3::jsonb,
           evidence_provider_ref = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [
        disputeId,
        now,
        toJsonString(payload.evidence),
        evidenceProviderRef,
      ]
    );

    await client.query(
      `INSERT INTO payment_dispute_events (dispute_id, event_type, actor_id, payload)
       VALUES ($1, 'evidence_submitted', $2, $3::jsonb)`,
      [
        disputeId,
        actorUserId,
        toJsonString({
          evidence: payload.evidence,
          evidenceProviderRef,
          submittedToProvider: payload.submitToProvider,
          gatewayId: dispute.gateway_id,
        }),
      ]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      disputeId,
      evidenceSubmittedAt: now,
      evidenceProviderRef,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ err: error, disputeId }, 'Failed to submit dispute evidence');
    reply.code(500);
    return { ok: false, error: 'Unable to submit dispute evidence' };
  } finally {
    client.release();
  }
});

if (config.nodeEnv !== 'production') {
app.post('/payments/webhooks/mock', async (request, reply) => {
  if (config.nodeEnv === 'production') {
    reply.code(404);
    return {
      ok: false,
      error: 'Mock endpoints are disabled in production',
    };
  }

  const bodySchema = z.object({
    gatewayId: z.string().min(2).max(80).default('mock_fiat_gbp'),
    providerEventId: z.string().min(4).max(140),
    eventType: z.string().min(3).max(120),
    intentId: z.string().min(4).max(120),
    status: z.enum(['succeeded', 'failed', 'cancelled']),
    providerFeeGbp: z.number().min(0).optional(),
    failureCode: z.string().max(80).optional(),
    failureMessage: z.string().max(240).optional(),
    payload: z.record(z.unknown()).optional(),
  });

  const payload = bodySchema.parse(request.body);

  if (!config.apiEnableMockWebhooks) {
    reply.code(404);
    return {
      ok: false,
      error: 'Mock payment webhook endpoint is disabled',
    };
  }

  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const gateway = await client.query<{ id: string }>(
      'SELECT id FROM payment_gateways WHERE id = $1 LIMIT 1',
      [payload.gatewayId]
    );

    if (!gateway.rowCount) {
      await client.query('ROLLBACK');
      reply.code(400);
      return {
        ok: false,
        error: 'Webhook gateway is unknown',
      };
    }

    const intentExists = await client.query<{ id: string }>(
      'SELECT id FROM payment_intents WHERE id = $1 LIMIT 1',
      [payload.intentId]
    );

    if (!intentExists.rowCount) {
      await client.query('ROLLBACK');
      reply.code(404);
      return {
        ok: false,
        error: 'Payment intent not found for webhook event',
      };
    }

    const webhookInsert = await client.query<{ id: number }>(
      `
        INSERT INTO payment_webhook_events (
          gateway_id,
          provider_event_id,
          event_type,
          intent_id,
          payload
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (gateway_id, provider_event_id)
        DO NOTHING
        RETURNING id
      `,
      [
        payload.gatewayId,
        payload.providerEventId,
        payload.eventType,
        payload.intentId,
        toJsonString(payload.payload ?? {}),
      ]
    );

    if (!webhookInsert.rowCount) {
      await client.query('COMMIT');
      return {
        ok: true,
        duplicate: true,
      };
    }

    const settled = await settlePaymentIntent(client, {
      intentId: payload.intentId,
      finalStatus: payload.status,
      providerFeeGbp: payload.providerFeeGbp,
      providerAttemptRef: payload.providerEventId,
      failureCode: payload.failureCode,
      failureMessage: payload.failureMessage,
      rawPayload: {
        source: 'mock_webhook',
        eventType: payload.eventType,
        ...(payload.payload ?? {}),
      },
    });

    await client.query(
      'UPDATE payment_webhook_events SET processed_at = NOW() WHERE id = $1',
      [webhookInsert.rows[0].id]
    );

    await client.query('COMMIT');
    return {
      ok: true,
      duplicate: false,
      intent: settled.intent,
      orderSettlement: settled.orderSettlement,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if ((error as Error).message === 'PAYMENT_INTENT_NOT_FOUND') {
      reply.code(404);
      return {
        ok: false,
        error: 'Payment intent not found for webhook event',
      };
    }

    request.log.error({ err: error, payload }, 'Failed to process mock payment webhook');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to process webhook event',
    };
  } finally {
    client.release();
  }
});
}

};
