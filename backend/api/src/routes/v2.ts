import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type Stripe from 'stripe';
import { config } from '../config.js';
import {
  createMobileCustomerSession,
  getOrCreateStripeCustomer,
  syncStripePaymentMethodProjections,
} from '../lib/stripePaymentMethods.js';

// ── Types (mirrored from index.ts) ─────────────────────────────────────

type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

type PaymentIntentChannel = 'commerce' | 'co-own' | 'wallet_topup' | 'wallet_withdrawal';

type V2RouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest, requestedUserId?: string) => string;
  ensureUserExists: (userId: string) => Promise<void>;
  requireStripeMobilePaymentConfiguration: (
    reply: FastifyReply
  ) => { stripeClient: Stripe; publishableKey: string } | null;
};

export const registerV2Routes = ({
  app,
  db,
  resolveAuthenticatedUserId,
  ensureUserExists,
  requireStripeMobilePaymentConfiguration,
}: V2RouteDependencies) => {
  app.post('/v2/payments/customers/session', async (request, reply) => {
    z.object({}).strict().parse(request.body ?? {});
    const userId = resolveAuthenticatedUserId(request);
    const configured = requireStripeMobilePaymentConfiguration(reply);
    if (!configured) {
      return {
        ok: false,
        error: 'Tokenised card collection is not configured',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      };
    }

    await ensureUserExists(userId);
    const customer = await getOrCreateStripeCustomer({
      db,
      stripe: configured.stripeClient,
      userId,
    });
    const customerSession = await createMobileCustomerSession(
      configured.stripeClient,
      customer.customerId
    );

    return {
      ok: true,
      provider: 'stripe',
      customerId: customer.customerId,
      customerSessionClientSecret: customerSession.client_secret,
      publishableKey: configured.publishableKey,
    };
  });

  app.post('/v2/payments/setup-intents', async (request, reply) => {
    const bodySchema = z.object({
      idempotencyKey: z.string().min(12).max(180),
    }).strict();
    const payload = bodySchema.parse(request.body ?? {});
    const userId = resolveAuthenticatedUserId(request);
    const configured = requireStripeMobilePaymentConfiguration(reply);
    if (!configured) {
      return {
        ok: false,
        error: 'Tokenised card collection is not configured',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      };
    }

    await ensureUserExists(userId);
    const customer = await getOrCreateStripeCustomer({
      db,
      stripe: configured.stripeClient,
      userId,
    });
    const [setupIntent, customerSession] = await Promise.all([
      configured.stripeClient.setupIntents.create(
        {
          customer: customer.customerId,
          payment_method_types: ['card'],
          usage: 'off_session',
          metadata: {
            thryftverse_user_id: userId,
            purpose: 'saved_payment_method',
          },
        },
        {
          idempotencyKey: `setup:${userId}:${payload.idempotencyKey}`,
        }
      ),
      createMobileCustomerSession(configured.stripeClient, customer.customerId),
    ]);

    if (!setupIntent.client_secret) {
      reply.code(502);
      return {
        ok: false,
        error: 'Payment provider did not return a SetupIntent client secret',
        code: 'PAYMENT_PROVIDER_INVALID_RESPONSE',
      };
    }

    reply.code(201);
    return {
      ok: true,
      provider: 'stripe',
      setupIntentId: setupIntent.id,
      setupIntentClientSecret: setupIntent.client_secret,
      customerId: customer.customerId,
      customerSessionClientSecret: customerSession.client_secret,
      publishableKey: configured.publishableKey,
      merchantDisplayName: 'Thryftverse',
      returnUrl: 'thryftverse://payments/return',
    };
  });

  app.get('/v2/payments/methods', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const configured = requireStripeMobilePaymentConfiguration(reply);
    if (!configured) {
      return {
        ok: false,
        error: 'Tokenised card collection is not configured',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      };
    }

    await ensureUserExists(userId);
    const binding = await db.query<{ provider_customer_ref: string }>(
      `SELECT provider_customer_ref
       FROM stripe_payment_customers
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    if (!binding.rowCount) {
      return {
        ok: true,
        provider: 'stripe',
        items: [],
      };
    }
    const methods = await syncStripePaymentMethodProjections({
      db,
      stripe: configured.stripeClient,
      userId,
      customerId: binding.rows[0].provider_customer_ref,
      hmacSecret: config.paymentMetadataHmacSecret,
    });

    return {
      ok: true,
      provider: 'stripe',
      items: methods,
    };
  });

  app.delete('/v2/payments/methods/:providerMethodId', async (request, reply) => {
    const paramsSchema = z.object({
      providerMethodId: z.string().regex(/^pm_[A-Za-z0-9_]+$/).max(255),
    });
    const { providerMethodId } = paramsSchema.parse(request.params);
    const userId = resolveAuthenticatedUserId(request);
    const configured = requireStripeMobilePaymentConfiguration(reply);
    if (!configured) {
      return {
        ok: false,
        error: 'Tokenised card collection is not configured',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      };
    }

    const customer = await getOrCreateStripeCustomer({
      db,
      stripe: configured.stripeClient,
      userId,
    });
    const local = await db.query<{ status: string }>(
      `SELECT status
       FROM user_payment_methods
       WHERE user_id = $1
         AND provider = 'stripe'
         AND provider_customer_ref = $2
         AND provider_payment_method_ref = $3
       LIMIT 1`,
      [userId, customer.customerId, providerMethodId]
    );
    if (!local.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Payment method not found' };
    }
    if (local.rows[0].status === 'detached') {
      return { ok: true, idempotent: true };
    }

    const providerMethod = await configured.stripeClient.paymentMethods.retrieve(providerMethodId);
    const providerCustomerId =
      typeof providerMethod.customer === 'string'
        ? providerMethod.customer
        : providerMethod.customer?.id ?? null;
    if (providerCustomerId && providerCustomerId !== customer.customerId) {
      reply.code(404);
      return { ok: false, error: 'Payment method not found' };
    }
    if (providerCustomerId === customer.customerId) {
      await configured.stripeClient.paymentMethods.detach(providerMethodId);
    }

    await db.query(
      `UPDATE user_payment_methods
       SET status = 'detached', is_default = FALSE, detached_at = NOW(), updated_at = NOW()
       WHERE user_id = $1
         AND provider = 'stripe'
         AND provider_payment_method_ref = $2`,
      [userId, providerMethodId]
    );
    await syncStripePaymentMethodProjections({
      db,
      stripe: configured.stripeClient,
      userId,
      customerId: customer.customerId,
      hmacSecret: config.paymentMetadataHmacSecret,
    });

    return { ok: true, idempotent: false };
  });

  app.patch('/v2/payments/methods/:providerMethodId/default', async (request, reply) => {
    const paramsSchema = z.object({
      providerMethodId: z.string().regex(/^pm_[A-Za-z0-9_]+$/).max(255),
    });
    z.object({}).strict().parse(request.body ?? {});
    const { providerMethodId } = paramsSchema.parse(request.params);
    const userId = resolveAuthenticatedUserId(request);
    const configured = requireStripeMobilePaymentConfiguration(reply);
    if (!configured) {
      return {
        ok: false,
        error: 'Tokenised card collection is not configured',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      };
    }

    const customer = await getOrCreateStripeCustomer({
      db,
      stripe: configured.stripeClient,
      userId,
    });
    const ownedMethod = await db.query<{ is_default: boolean }>(
      `SELECT is_default
       FROM user_payment_methods
       WHERE user_id = $1
         AND provider = 'stripe'
         AND provider_customer_ref = $2
         AND provider_payment_method_ref = $3
         AND status = 'active'
       LIMIT 1`,
      [userId, customer.customerId, providerMethodId]
    );
    if (!ownedMethod.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Payment method not found' };
    }

    const alreadyDefault = ownedMethod.rows[0].is_default;
    if (!alreadyDefault) {
      await configured.stripeClient.customers.update(customer.customerId, {
        invoice_settings: {
          default_payment_method: providerMethodId,
        },
      });
    }
    const methods = await syncStripePaymentMethodProjections({
      db,
      stripe: configured.stripeClient,
      userId,
      customerId: customer.customerId,
      hmacSecret: config.paymentMetadataHmacSecret,
    });

    return {
      ok: true,
      idempotent: alreadyDefault,
      items: methods,
    };
  });

  app.post('/v2/payments/orders/:orderId/sheet', async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().min(4).max(64),
    });
    z.object({}).strict().parse(request.body ?? {});
    const { orderId } = paramsSchema.parse(request.params);
    const userId = resolveAuthenticatedUserId(request);
    const configured = requireStripeMobilePaymentConfiguration(reply);
    if (!configured) {
      return {
        ok: false,
        error: 'Tokenised card collection is not configured',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      };
    }

    const result = await db.query<{
      buyer_id: string;
      amount_currency: string;
      provider_intent_ref: string;
      client_secret: string | null;
      gateway_id: string;
      status: string;
    }>(
      `SELECT
         o.buyer_id,
         payment.amount_currency,
         payment.provider_intent_ref,
         payment.client_secret,
         payment.gateway_id,
         payment.status
       FROM orders o
       JOIN payment_intents payment ON payment.id = o.payment_intent_id
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );
    const row = result.rows[0];
    if (!row || row.buyer_id !== userId) {
      reply.code(404);
      return { ok: false, error: 'Order payment intent not found' };
    }
    if (row.gateway_id !== 'stripe_americas' || !row.client_secret) {
      reply.code(409);
      return {
        ok: false,
        error: 'This order is not eligible for Stripe PaymentSheet',
        code: 'PAYMENT_SHEET_UNAVAILABLE',
      };
    }
    if (['succeeded', 'failed', 'cancelled'].includes(row.status)) {
      reply.code(409);
      return {
        ok: false,
        error: `PaymentSheet cannot open from payment status '${row.status}'`,
        code: 'PAYMENT_INTENT_FINAL',
      };
    }

    const customer = await getOrCreateStripeCustomer({
      db,
      stripe: configured.stripeClient,
      userId,
    });
    const providerIntent = await configured.stripeClient.paymentIntents.retrieve(
      row.provider_intent_ref
    );
    const providerCustomerId =
      typeof providerIntent.customer === 'string'
        ? providerIntent.customer
        : providerIntent.customer?.id ?? null;
    if (providerCustomerId !== customer.customerId) {
      reply.code(409);
      return {
        ok: false,
        error: 'The payment intent is not bound to the authenticated customer',
        code: 'PAYMENT_CUSTOMER_MISMATCH',
      };
    }

    const customerSession = await createMobileCustomerSession(
      configured.stripeClient,
      customer.customerId
    );

    return {
      ok: true,
      provider: 'stripe',
      orderId,
      paymentIntentClientSecret: row.client_secret,
      customerId: customer.customerId,
      customerSessionClientSecret: customerSession.client_secret,
      publishableKey: configured.publishableKey,
      merchantDisplayName: 'Thryftverse',
      merchantCountryCode: config.stripeMerchantCountryCode,
      currency: row.amount_currency.toUpperCase(),
      returnUrl: 'thryftverse://payments/return',
      applePayEnabled: Boolean(config.stripeApplePayMerchantIdentifier),
      googlePayEnabled: config.stripeGooglePayEnabled,
    };
  });

  app.post('/v2/payments/intents/:intentId/sheet', async (request, reply) => {
    const { intentId } = z.object({
      intentId: z.string().min(4).max(140),
    }).parse(request.params);
    z.object({}).strict().parse(request.body ?? {});
    const userId = resolveAuthenticatedUserId(request);
    const configured = requireStripeMobilePaymentConfiguration(reply);
    if (!configured) {
      return {
        ok: false,
        error: 'Tokenised payment collection is not configured',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      };
    }

    const result = await db.query<{
      user_id: string;
      channel: PaymentIntentChannel;
      amount_currency: string;
      provider_intent_ref: string | null;
      client_secret: string | null;
      gateway_id: string;
      status: PaymentIntentStatus;
    }>(
      `SELECT
         user_id,
         channel,
         amount_currency,
         provider_intent_ref,
         client_secret,
         gateway_id,
         status
       FROM payment_intents
       WHERE id = $1
       LIMIT 1`,
      [intentId]
    );
    const row = result.rows[0];
    if (!row || row.user_id !== userId) {
      reply.code(404);
      return { ok: false, error: 'Payment intent not found' };
    }
    if (row.gateway_id !== 'stripe_americas' || !row.client_secret || !row.provider_intent_ref) {
      reply.code(409);
      return {
        ok: false,
        error: 'This payment intent is not eligible for Stripe PaymentSheet',
        code: 'PAYMENT_SHEET_UNAVAILABLE',
      };
    }
    if (['succeeded', 'failed', 'cancelled'].includes(row.status)) {
      reply.code(409);
      return {
        ok: false,
        error: `PaymentSheet cannot open from payment status '${row.status}'`,
        code: 'PAYMENT_INTENT_FINAL',
      };
    }

    const customer = await getOrCreateStripeCustomer({
      db,
      stripe: configured.stripeClient,
      userId,
    });
    const providerIntent = await configured.stripeClient.paymentIntents.retrieve(
      row.provider_intent_ref
    );
    const providerCustomerId =
      typeof providerIntent.customer === 'string'
        ? providerIntent.customer
        : providerIntent.customer?.id ?? null;
    if (providerCustomerId !== customer.customerId) {
      reply.code(409);
      return {
        ok: false,
        error: 'The payment intent is not bound to the authenticated customer',
        code: 'PAYMENT_CUSTOMER_MISMATCH',
      };
    }

    const customerSession = await createMobileCustomerSession(
      configured.stripeClient,
      customer.customerId
    );
    return {
      ok: true,
      provider: 'stripe',
      intentId,
      channel: row.channel,
      paymentIntentClientSecret: row.client_secret,
      customerId: customer.customerId,
      customerSessionClientSecret: customerSession.client_secret,
      publishableKey: configured.publishableKey,
      merchantDisplayName: 'Thryftverse',
      merchantCountryCode: config.stripeMerchantCountryCode,
      currency: row.amount_currency.toUpperCase(),
      returnUrl: 'thryftverse://payments/return',
      applePayEnabled: Boolean(config.stripeApplePayMerchantIdentifier),
      googlePayEnabled: config.stripeGooglePayEnabled,
    };
  });
};
