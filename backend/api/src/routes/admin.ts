import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type Stripe from 'stripe';
import { config } from '../config.js';
import {
  getCountryPricingProfile,
  listCountryPricingQuotes,
  pricingTablesAvailable as onezePricingTablesAvailable,
  resolveCountryPricingQuote,
  setInternalFxRate,
  upsertCountryPricingProfile,
  validatePricingProfileInput,
} from '../lib/pricingEngine.js';
import { assertOnezeOperatorToken } from '../lib/onezeGovernance.js';
import {
  getLatestReconciliationRun,
} from '../lib/reconciliation.js';
import {
  getConfiguredClusters,
} from '../lib/countryCapabilities.js';
import { computePayoutSettlementBreakdown } from '../lib/payoutAccounting.js';
import { createStripeConnectPayoutTransfer } from '../lib/stripePayouts.js';

// ── Types (mirrored from index.ts) ─────────────────────────────────────

type PayoutRequestStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'cancelled';

const COMMERCE_ORDER_STATUSES = [
  'created',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
] as const;
type CommerceOrderStatus = (typeof COMMERCE_ORDER_STATUSES)[number];

type DbQueryable = Pool | PoolClient;

type AdminRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  stripe: Stripe | null;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  toJsonString: (value: unknown) => string;
  getApiError: (error: unknown) => { code: string; message: string; details?: Record<string, unknown> } | null;
  statusCodeForApiError: (code: string) => number;
  ensureSecurityAdminAccess: (
    request: {
      headers: Record<string, string | string[] | undefined>;
      authUser?: { role: string; userId: string };
    },
    reply: { code: (statusCode: number) => unknown }
  ) => { ok: false; error: string } | null;
  paymentTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  onezeArchitectureTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  onezeTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  orderParcelEventsTableAvailable: (client: DbQueryable) => Promise<boolean>;
  paymentDisputesTableAvailable: (client: DbQueryable) => Promise<boolean>;
  collectOnezeRiskDashboardMetrics: (
    client: DbQueryable,
    lookbackHours: number
  ) => Promise<{
    evaluatedAt: string;
    lookbackHours: number;
    countryFlows: unknown;
    totals: unknown;
    redemption: unknown;
    crossBorder: unknown;
    liquidity: {
      pendingWithdrawalUnits: unknown;
      operationalLiquidityUnits: unknown;
      stressIndex: unknown;
      stressLevel: unknown;
    };
    reservePolicy: unknown;
    exposure: unknown;
  }>;
  getPayoutPauseState: () => Promise<{
    paused: boolean;
    reason: string | null;
    reconciliationRunId: string | null;
    mismatchGbp: string | null;
  }>;
  asObject: (value: unknown) => Record<string, unknown>;
  roundTo: (value: number, decimals: number) => number;
  toPayoutRequestPayload: (row: Record<string, unknown>) => Record<string, unknown>;
  settlePayoutRequest: (
    client: PoolClient,
    input: {
      userId: string;
      requestId: string;
      targetStatus: string;
      providerPayoutRef?: string;
      failureReason?: string;
      metadata: Record<string, unknown>;
      source: string;
    }
  ) => Promise<{
    payoutRequest: Record<string, unknown> & { id: string; status: string };
    idempotent: boolean;
  }>;
  queuePayoutProcessedNotification: (input: {
    payoutRequest: Record<string, unknown>;
    source: string;
  }) => Promise<void>;
  sendCommerceOrderSmsNotifications: (input: {
    orderId: string;
    orderStatus: string;
    reason?: string;
  }) => Promise<void>;
};

export const registerAdminRoutes = ({
  app,
  db,
  stripe,
  createApiError,
  toJsonString,
  getApiError,
  statusCodeForApiError,
  ensureSecurityAdminAccess,
  paymentTablesAvailable,
  onezeArchitectureTablesAvailable,
  onezeTablesAvailable,
  orderParcelEventsTableAvailable,
  paymentDisputesTableAvailable,
  collectOnezeRiskDashboardMetrics,
  getPayoutPauseState,
  asObject,
  roundTo,
  toPayoutRequestPayload,
  settlePayoutRequest,
  queuePayoutProcessedNotification,
  sendCommerceOrderSmsNotifications,
}: AdminRouteDependencies) => {
  app.post('/admin/1ze/fx-rate', async (request, reply) => {
    const bodySchema = z.object({
      baseCurrency: z.string().length(3),
      quoteCurrency: z.string().length(3),
      rate: z.number().positive(),
      reason: z.string().max(240).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    try {
      const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
      assertOnezeOperatorToken(operatorToken);
    } catch {
      reply.code(401);
      return {
        ok: false,
        error: 'Missing or invalid operator token',
      };
    }

    if (!(await onezePricingTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze controlled pricing tables are unavailable. Run migrations first.',
      };
    }

    const payload = bodySchema.parse(request.body ?? {});
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await setInternalFxRate(client, {
        baseCurrency: payload.baseCurrency,
        quoteCurrency: payload.quoteCurrency,
        rate: payload.rate,
        source: 'operator',
        metadata: {
          ...(payload.metadata ?? {}),
          reason: payload.reason ?? null,
          updatedBy: request.authUser?.userId ?? 'operator',
        },
      });

      const quotes = await listCountryPricingQuotes(client);

      await client.query('COMMIT');
      return {
        ok: true,
        fx: {
          baseCurrency: payload.baseCurrency.toUpperCase(),
          quoteCurrency: payload.quoteCurrency.toUpperCase(),
          rate: Number(payload.rate.toFixed(8)),
        },
        matrixSize: quotes.length,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      const apiError = getApiError(error);
      if (apiError) {
        reply.code(statusCodeForApiError(apiError.code));
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      request.log.error({ err: error, payload }, 'Failed to update internal FX rate');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to update internal FX rate',
      };
    } finally {
      client.release();
    }
  });

  app.get('/admin/1ze/pricing-health', async (request, reply) => {
    try {
      const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
      assertOnezeOperatorToken(operatorToken);
    } catch {
      reply.code(401);
      return {
        ok: false,
        error: 'Missing or invalid operator token',
      };
    }

    if (!(await onezePricingTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze controlled pricing tables are unavailable. Run migrations first.',
      };
    }

    try {
      const quotes = await listCountryPricingQuotes(db);

      return {
        ok: true,
        matrixSize: quotes.length,
        quotes,
      };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to evaluate 1ze pricing health');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to evaluate pricing health',
      };
    }
  });

  app.get('/admin/1ze/risk-dashboard', async (request, reply) => {
    const querySchema = z.object({
      lookbackHours: z.coerce.number().int().min(1).max(24 * 30).default(24),
    });

    try {
      const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
      assertOnezeOperatorToken(operatorToken);
    } catch {
      reply.code(401);
      return {
        ok: false,
        error: 'Missing or invalid operator token',
      };
    }

    if (
      !(await onezePricingTablesAvailable(db))
      || !(await onezeArchitectureTablesAvailable(db))
      || !(await onezeTablesAvailable(db))
    ) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze risk dashboard dependencies are unavailable. Run migrations first.',
      };
    }

    const payload = querySchema.parse(request.query);

    try {
      const metrics = await collectOnezeRiskDashboardMetrics(db, payload.lookbackHours);

      return {
        ok: true,
        dashboard: {
          evaluatedAt: metrics.evaluatedAt,
          lookbackHours: metrics.lookbackHours,
          countryFlows: metrics.countryFlows,
          totals: metrics.totals,
          redemption: metrics.redemption,
          crossBorder: metrics.crossBorder,
          liquidity: {
            pendingWithdrawalUnits: metrics.liquidity.pendingWithdrawalUnits,
            operationalLiquidityUnits: metrics.liquidity.operationalLiquidityUnits,
            stressIndex: metrics.liquidity.stressIndex,
            stressLevel: metrics.liquidity.stressLevel,
          },
          reservePolicy: metrics.reservePolicy,
          exposure: metrics.exposure,
        },
      };
    } catch (error) {
      request.log.error({ err: error, payload }, 'Failed to evaluate 1ze risk dashboard');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to evaluate 1ze risk dashboard',
      };
    }
  });

  app.get('/admin/payouts/pending-review', async (request, reply) => {
    const securityError = ensureSecurityAdminAccess(request, reply);
    if (securityError) {
      return securityError;
    }

    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100),
    });
    const { limit } = querySchema.parse(request.query);

    if (!(await paymentTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: 'Payment settlement tables are unavailable. Run migrations first.',
      };
    }

    const result = await db.query<{
      id: string;
      user_id: string;
      payout_account_id: number;
      amount_gbp: number | string;
      amount_currency: string;
      status: PayoutRequestStatus;
      provider_payout_ref: string | null;
      failure_reason: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
      updated_at: string;
      gateway_id: string;
    }>(
      `
        SELECT
          pr.id,
          pr.user_id,
          pr.payout_account_id,
          pr.amount_gbp,
          pr.amount_currency,
          pr.status,
          pr.provider_payout_ref,
          pr.failure_reason,
          pr.metadata,
          pr.created_at::text,
          pr.updated_at::text,
          pa.gateway_id
        FROM payout_requests pr
        INNER JOIN payout_accounts pa ON pa.id = pr.payout_account_id
        WHERE pr.status = 'requested'
          AND (
            pr.amount_gbp > $1
            OR pr.metadata @> '{"manualReviewRequired": true}'::jsonb
            OR pr.metadata @> '{"nameMismatch": true}'::jsonb
          )
        ORDER BY pr.created_at ASC
        LIMIT $2
      `,
      [config.payoutManualReviewThresholdGbp, limit]
    );

    return {
      ok: true,
      items: result.rows.map((row) => ({
        ...toPayoutRequestPayload(row),
        gatewayId: row.gateway_id,
        flags: {
          manualReviewRequired: Boolean(asObject(row.metadata).manualReviewRequired),
          nameMismatch: Boolean(asObject(row.metadata).nameMismatch),
        },
      })),
    };
  });

  app.get('/admin/reconciliation/report', async (request, reply) => {
    const securityError = ensureSecurityAdminAccess(request, reply);
    if (securityError) {
      return securityError;
    }

    const [latest, pauseState] = await Promise.all([
      getLatestReconciliationRun(db),
      getPayoutPauseState(),
    ]);
    const clusters = getConfiguredClusters();
    const activeClusters = clusters.filter((cluster) => cluster.configured);

    const client = await db.connect();
    let strandedEscrowCount = 0;
    let lostDisputesCount = 0;
    let parcelEventsAvailable = false;
    let disputesTableAvailable = false;

    try {
      [parcelEventsAvailable, disputesTableAvailable] = await Promise.all([
        orderParcelEventsTableAvailable(client),
        paymentDisputesTableAvailable(client),
      ]);

      const strandedResult = parcelEventsAvailable
        ? await client.query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM orders o
            WHERE o.status IN ('paid', 'shipped')
              AND COALESCE(o.shipped_at, o.updated_at, o.created_at) <= NOW() - INTERVAL '30 days'
              AND NOT EXISTS (
                SELECT 1
                FROM order_parcel_events ope
                WHERE ope.order_id = o.id
                  AND ope.event_type IN ('delivered', 'collection_confirmed')
              )
          `
        )
        : await client.query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM orders o
            WHERE o.status IN ('paid', 'shipped')
              AND COALESCE(o.shipped_at, o.updated_at, o.created_at) <= NOW() - INTERVAL '30 days'
          `
        );

      strandedEscrowCount = Number(strandedResult.rows[0]?.count ?? '0');

      if (disputesTableAvailable) {
        const disputesResult = await client.query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM payment_disputes
            WHERE status = 'lost'
          `
        );

        lostDisputesCount = Number(disputesResult.rows[0]?.count ?? '0');
      }
    } finally {
      client.release();
    }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      latest,
      payouts: {
        paused: pauseState.paused,
        reason: pauseState.reason ?? null,
        reconciliationRunId: pauseState.reconciliationRunId ?? null,
        mismatchGbp: pauseState.mismatchGbp ?? null,
      },
      clusters: {
        active: activeClusters,
        all: clusters,
      },
      operational: {
        strandedEscrow: {
          thresholdDays: 30,
          count: strandedEscrowCount,
          source: parcelEventsAvailable ? 'orders_with_parcel_events' : 'orders_status_age_only',
        },
        disputes: {
          lostCount: lostDisputesCount,
          tableAvailable: disputesTableAvailable,
        },
      },
    };
  });

  app.post('/admin/payouts/:requestId/review', async (request, reply) => {
    const securityError = ensureSecurityAdminAccess(request, reply);
    if (securityError) {
      return securityError;
    }

    const paramsSchema = z.object({
      requestId: z.string().min(4).max(140),
    });
    const bodySchema = z.object({
      status: z.enum(['processing', 'paid', 'failed', 'cancelled']),
      note: z.string().max(400).optional(),
      providerPayoutRef: z.string().min(4).max(140).optional(),
      failureReason: z.string().max(240).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    const { requestId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body);

    if (!(await paymentTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: 'Payment settlement tables are unavailable. Run migrations first.',
      };
    }

    const lookup = await db.query<{
      id: string;
      user_id: string;
      amount_gbp: number | string;
      amount_currency: string;
      status: PayoutRequestStatus;
      provider_payout_ref: string | null;
      metadata: Record<string, unknown>;
      gateway_id: string;
      provider_account_ref: string;
      payout_account_status: 'pending' | 'active' | 'disabled';
    }>(
      `SELECT
         pr.id,
         pr.user_id,
         pr.amount_gbp,
         pr.amount_currency,
         pr.status,
         pr.provider_payout_ref,
         pr.metadata,
         pa.gateway_id,
         pa.provider_account_ref,
         pa.status AS payout_account_status
       FROM payout_requests pr
       JOIN payout_accounts pa ON pa.id = pr.payout_account_id
       WHERE pr.id = $1
       LIMIT 1`,
      [requestId]
    );

    if (!lookup.rowCount) {
      reply.code(404);
      return {
        ok: false,
        error: 'Payout request not found',
      };
    }

    if ((payload.status === 'processing' || payload.status === 'paid')) {
      const pauseState = await getPayoutPauseState();
      if (pauseState.paused) {
        reply.code(409);
        return {
          ok: false,
          error: 'Payouts are temporarily paused for reconciliation review.',
          pause: {
            reason: pauseState.reason ?? null,
            reconciliationRunId: pauseState.reconciliationRunId ?? null,
            mismatchGbp: pauseState.mismatchGbp ?? null,
          },
        };
      }
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const settled = await settlePayoutRequest(client, {
        userId: lookup.rows[0].user_id,
        requestId,
        targetStatus: payload.status,
        providerPayoutRef: payload.providerPayoutRef,
        failureReason: payload.failureReason,
        metadata: {
          ...(payload.metadata ?? {}),
          review: {
            note: payload.note ?? null,
            reviewedAt: new Date().toISOString(),
            reviewedBy: request.authUser?.userId ?? 'admin_token',
          },
        },
        source: 'admin_review',
      });

      await client.query('COMMIT');

      if (!settled.idempotent && settled.payoutRequest.status === 'paid') {
        try {
          await queuePayoutProcessedNotification({
            payoutRequest: settled.payoutRequest,
            source: 'admin_review',
          });
        } catch (notificationError) {
          request.log.error(
            {
              err: notificationError,
              requestId,
              userId: lookup.rows[0].user_id,
            },
            'Failed to queue payout notification after admin payout review update'
          );
        }
      }

      return {
        ok: true,
        idempotent: settled.idempotent,
        payoutRequest: settled.payoutRequest,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const apiError = getApiError(error);
      if (apiError) {
        reply.code(statusCodeForApiError(apiError.code));
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      request.log.error({ err: error, requestId }, 'Unable to review payout request');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to review payout request',
      };
    } finally {
      client.release();
    }
  });

  app.post('/admin/payouts/:requestId/approve', async (request, reply) => {
    const securityError = ensureSecurityAdminAccess(request, reply);
    if (securityError) {
      return securityError;
    }

    const paramsSchema = z.object({
      requestId: z.string().min(4).max(140),
    });
    const bodySchema = z.object({
      note: z.string().max(400).optional(),
      providerPayoutRef: z.string().min(4).max(140).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    const { requestId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    if (!(await paymentTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: 'Payment settlement tables are unavailable. Run migrations first.',
      };
    }

    const lookup = await db.query<{
      id: string;
      user_id: string;
      amount_gbp: number | string;
      amount_currency: string;
      status: PayoutRequestStatus;
      provider_payout_ref: string | null;
      metadata: Record<string, unknown>;
      gateway_id: string;
      provider_account_ref: string;
      payout_account_status: 'pending' | 'active' | 'disabled';
    }>(
      `SELECT
         pr.id,
         pr.user_id,
         pr.amount_gbp,
         pr.amount_currency,
         pr.status,
         pr.provider_payout_ref,
         pr.metadata,
         pa.gateway_id,
         pa.provider_account_ref,
         pa.status AS payout_account_status
       FROM payout_requests pr
       JOIN payout_accounts pa ON pa.id = pr.payout_account_id
       WHERE pr.id = $1
       LIMIT 1`,
      [requestId]
    );

    if (!lookup.rowCount) {
      reply.code(404);
      return {
        ok: false,
        error: 'Payout request not found',
      };
    }

    const pauseState = await getPayoutPauseState();
    if (pauseState.paused) {
      reply.code(409);
      return {
        ok: false,
        error: 'Payouts are temporarily paused for reconciliation review.',
        pause: {
          reason: pauseState.reason ?? null,
          reconciliationRunId: pauseState.reconciliationRunId ?? null,
          mismatchGbp: pauseState.mismatchGbp ?? null,
        },
      };
    }

    const payoutRow = lookup.rows[0];
    let providerPayoutRef =
      payload.providerPayoutRef?.trim()
      ?? payoutRow.provider_payout_ref
      ?? null;
    let providerExecutionMetadata: Record<string, unknown> = {};

    if (payoutRow.status === 'paid' && !providerPayoutRef) {
      reply.code(409);
      return {
        ok: false,
        error: 'This legacy paid payout is missing a provider reference and requires reconciliation review',
        code: 'PAYOUT_PROVIDER_REF_REQUIRED',
      };
    }

    if (!providerPayoutRef && payoutRow.status !== 'paid') {
      if (
        payoutRow.gateway_id !== 'stripe_americas'
        || payoutRow.payout_account_status !== 'active'
        || !stripe
      ) {
        reply.code(503);
        return {
          ok: false,
          error: 'No live payout provider is available for this payout account',
          code: 'PAYOUT_PROVIDER_UNAVAILABLE',
        };
      }

      if (payoutRow.amount_currency.toUpperCase() !== 'GBP') {
        reply.code(503);
        return {
          ok: false,
          error: 'Automatic provider payout currently supports verified GBP payout accounts only',
          code: 'PAYOUT_CURRENCY_UNSUPPORTED',
        };
      }

      const connectAccount = await db.query<{
        stripe_account_id: string;
        payouts_enabled: boolean;
      }>(
        `SELECT stripe_account_id, payouts_enabled
         FROM stripe_connect_accounts
         WHERE user_id = $1
           AND stripe_account_id = $2
         LIMIT 1`,
        [payoutRow.user_id, payoutRow.provider_account_ref]
      );

      if (!connectAccount.rowCount || !connectAccount.rows[0].payouts_enabled) {
        reply.code(409);
        return {
          ok: false,
          error: 'Stripe payout onboarding is incomplete for this account',
          code: 'PAYOUT_ONBOARDING_REQUIRED',
        };
      }

      let livePayoutsEnabled = false;
      try {
        const liveConnectAccount = await stripe.accounts.retrieve(
          payoutRow.provider_account_ref
        );
        livePayoutsEnabled = liveConnectAccount.payouts_enabled;
      } catch (error) {
        request.log.error(
          { err: error, requestId, userId: payoutRow.user_id },
          'Unable to verify Stripe Connect payout account'
        );
        reply.code(502);
        return {
          ok: false,
          error: 'The payout provider could not verify this connected account',
          code: 'PAYOUT_PROVIDER_UNCONFIRMED',
        };
      }

      if (!livePayoutsEnabled) {
        await db.query(
          `UPDATE payout_accounts
           SET status = 'pending', updated_at = NOW()
           WHERE gateway_id = 'stripe_americas'
             AND provider_account_ref = $1`,
          [payoutRow.provider_account_ref]
        );
        reply.code(409);
        return {
          ok: false,
          error: 'Stripe has paused payouts for this connected account',
          code: 'PAYOUT_ONBOARDING_REQUIRED',
        };
      }

      const payoutMetadata = asObject(payoutRow.metadata);
      const approvalMetadata = asObject(payload.metadata);
      const payoutBreakdown = computePayoutSettlementBreakdown({
        amountGbp: Number(payoutRow.amount_gbp),
        networkFeeGbp: Number(
          approvalMetadata.networkFeeGbp
          ?? payoutMetadata.networkFeeGbp
          ?? 0
        ),
        spreadGbp: Number(
          approvalMetadata.spreadGbp
          ?? payoutMetadata.spreadGbp
          ?? 0
        ),
      });

      if (!payoutBreakdown.isValid || payoutBreakdown.netPayoutGbp <= 0) {
        reply.code(400);
        return {
          ok: false,
          error: 'Payout deductions leave no transferable provider amount',
          code: 'PAYOUT_INVALID_DEDUCTIONS',
        };
      }

      const processingClient = await db.connect();
      try {
        await processingClient.query('BEGIN');
        await settlePayoutRequest(processingClient, {
          userId: payoutRow.user_id,
          requestId,
          targetStatus: 'processing',
          metadata: {
            ...(payload.metadata ?? {}),
            providerExecution: {
              provider: 'stripe_connect',
              destinationAccountId: payoutRow.provider_account_ref,
              initiatedAt: new Date().toISOString(),
            },
          },
          source: 'admin_review',
        });
        await processingClient.query('COMMIT');
      } catch (error) {
        await processingClient.query('ROLLBACK');
        throw error;
      } finally {
        processingClient.release();
      }

      try {
        // ── Idempotency guard: skip the provider call if we already have a ref ──
        // If the payout was already submitted to the provider (e.g., on a retry),
        // reuse the existing provider_payout_ref instead of creating a duplicate
        // transfer. Stripe's idempotency key would catch it, but this avoids
        // the unnecessary API call and makes the guard explicit at the DB level.
        if (providerPayoutRef) {
          request.log.info(
            { requestId, providerPayoutRef },
            'Payout already has a provider reference — skipping provider call (idempotent)'
          );
          providerExecutionMetadata = {
            provider: 'stripe_connect',
            providerPayoutRef,
            destinationAccountId: payoutRow.provider_account_ref,
            idempotent: true,
            reusedExistingRef: true,
          };
        } else {
          const providerTransfer = await createStripeConnectPayoutTransfer(stripe, {
            requestId,
            userId: payoutRow.user_id,
            destinationAccountId: payoutRow.provider_account_ref,
            netAmountGbp: payoutBreakdown.netPayoutGbp,
          });
          providerPayoutRef = providerTransfer.providerTransferRef;
          providerExecutionMetadata = {
            provider: 'stripe_connect',
            providerPayoutRef,
            destinationAccountId: providerTransfer.destinationAccountId,
            amountMinor: providerTransfer.amountMinor,
            currency: providerTransfer.currency,
            confirmedAt: new Date().toISOString(),
          };
        }
      } catch (error) {
        request.log.error(
          { err: error, requestId, userId: payoutRow.user_id },
          'Stripe Connect payout transfer was not confirmed'
        );
        reply.code(502);
        return {
          ok: false,
          error: 'The payout provider did not confirm the transfer. The request remains processing and can be retried safely.',
          code: 'PAYOUT_PROVIDER_UNCONFIRMED',
        };
      }
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const settled = await settlePayoutRequest(client, {
        userId: payoutRow.user_id,
        requestId,
        targetStatus: 'paid',
        providerPayoutRef: providerPayoutRef ?? undefined,
        metadata: {
          ...(payload.metadata ?? {}),
          providerExecution:
            Object.keys(providerExecutionMetadata).length > 0
              ? providerExecutionMetadata
              : {
                  provider: 'manual_external_confirmation',
                  providerPayoutRef,
                  confirmedAt: new Date().toISOString(),
                },
          review: {
            action: 'approve',
            note: payload.note ?? null,
            reviewedAt: new Date().toISOString(),
            reviewedBy: request.authUser?.userId ?? 'admin_token',
          },
        },
        source: 'admin_review',
      });

      await client.query('COMMIT');

      if (!settled.idempotent && settled.payoutRequest.status === 'paid') {
        try {
          await queuePayoutProcessedNotification({
            payoutRequest: settled.payoutRequest,
            source: 'admin_review',
          });
        } catch (notificationError) {
          request.log.error(
            {
              err: notificationError,
              requestId,
              userId: payoutRow.user_id,
            },
            'Failed to queue payout notification after admin payout approval'
          );
        }
      }

      return {
        ok: true,
        idempotent: settled.idempotent,
        payoutRequest: settled.payoutRequest,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const apiError = getApiError(error);
      if (apiError) {
        reply.code(statusCodeForApiError(apiError.code));
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      request.log.error({ err: error, requestId }, 'Unable to approve payout request');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to approve payout request',
      };
    } finally {
      client.release();
    }
  });

  app.post('/admin/payouts/:requestId/reject', async (request, reply) => {
    const securityError = ensureSecurityAdminAccess(request, reply);
    if (securityError) {
      return securityError;
    }

    const paramsSchema = z.object({
      requestId: z.string().min(4).max(140),
    });
    const bodySchema = z.object({
      reason: z.string().min(2).max(240),
      note: z.string().max(400).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    const { requestId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    if (!(await paymentTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: 'Payment settlement tables are unavailable. Run migrations first.',
      };
    }

    const lookup = await db.query<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM payout_requests WHERE id = $1 LIMIT 1',
      [requestId]
    );

    if (!lookup.rowCount) {
      reply.code(404);
      return {
        ok: false,
        error: 'Payout request not found',
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const settled = await settlePayoutRequest(client, {
        userId: lookup.rows[0].user_id,
        requestId,
        targetStatus: 'failed',
        failureReason: payload.reason,
        metadata: {
          ...(payload.metadata ?? {}),
          review: {
            action: 'reject',
            note: payload.note ?? null,
            reason: payload.reason,
            reviewedAt: new Date().toISOString(),
            reviewedBy: request.authUser?.userId ?? 'admin_token',
          },
        },
        source: 'admin_review',
      });

      await client.query('COMMIT');

      return {
        ok: true,
        idempotent: settled.idempotent,
        payoutRequest: settled.payoutRequest,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const apiError = getApiError(error);
      if (
        apiError?.code === 'PAYOUT_INVALID_TRANSITION'
        || apiError?.code === 'PAYOUT_PENDING_INSUFFICIENT'
        || apiError?.code === 'PAYOUT_REVIEW_REQUIRED'
        || apiError?.code === 'PAYOUTS_PAUSED'
      ) {
        reply.code(409);
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      request.log.error({ err: error, requestId }, 'Unable to reject payout request');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to reject payout request',
      };
    } finally {
      client.release();
    }
  });

  app.post('/admin/orders/:orderId/force-status', async (request, reply) => {
    const securityError = ensureSecurityAdminAccess(request, reply);
    if (securityError) {
      return securityError;
    }

    const paramsSchema = z.object({
      orderId: z.string().min(4).max(64),
    });
    const bodySchema = z.object({
      status: z.enum(COMMERCE_ORDER_STATUSES),
      note: z.string().max(400).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<{ id: string; status: CommerceOrderStatus }>(
        'SELECT id, status FROM orders WHERE id = $1 LIMIT 1 FOR UPDATE',
        [orderId]
      );

      if (!existing.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return {
          ok: false,
          error: 'Order not found',
        };
      }

      const previousStatus = existing.rows[0].status;
      const updated = await client.query<{
        id: string;
        status: CommerceOrderStatus;
        updated_at: string;
      }>(
        `
          UPDATE orders
          SET
            status = $2,
            shipped_at = CASE
              WHEN $2 = 'shipped' THEN COALESCE(shipped_at, NOW())
              ELSE shipped_at
            END,
            delivered_at = CASE
              WHEN $2 = 'delivered' THEN COALESCE(delivered_at, NOW())
              ELSE delivered_at
            END,
            shipping_metadata = COALESCE(shipping_metadata, '{}'::jsonb) || $3::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, status, updated_at::text
        `,
        [
          orderId,
          payload.status,
          toJsonString({
            forceStatus: {
              previousStatus,
              nextStatus: payload.status,
              note: payload.note ?? null,
              actedBy: request.authUser?.userId ?? 'admin_token',
              actedAt: new Date().toISOString(),
              ...(payload.metadata ?? {}),
            },
          }),
        ]
      );

      await client.query('COMMIT');

      if (previousStatus !== updated.rows[0].status) {
        sendCommerceOrderSmsNotifications({
          orderId: updated.rows[0].id,
          orderStatus: updated.rows[0].status,
          reason: payload.note,
        }).catch(() => {});
      }

      return {
        ok: true,
        id: updated.rows[0].id,
        previousStatus,
        status: updated.rows[0].status,
        forced: previousStatus !== updated.rows[0].status,
        updatedAt: updated.rows[0].updated_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error, orderId }, 'Unable to force order status transition');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to force order status transition',
      };
    } finally {
      client.release();
    }
  });

  app.get('/admin/orders/stuck', async (request, reply) => {
    const securityError = ensureSecurityAdminAccess(request, reply);
    if (securityError) {
      return securityError;
    }

    const querySchema = z.object({
      paidOlderHours: z.coerce.number().int().min(1).max(240).default(24),
      limit: z.coerce.number().int().min(1).max(400).default(200),
    });
    const { paidOlderHours, limit } = querySchema.parse(request.query);

    const client = await db.connect();
    try {
      const parcelEventsAvailable = await orderParcelEventsTableAvailable(client);
      const result = parcelEventsAvailable
        ? await client.query<{
          id: string;
          buyer_id: string;
          seller_id: string;
          listing_id: string;
          status: string;
          total_gbp: number | string;
          tracking_number: string | null;
          created_at: string;
          updated_at: string;
          shipped_at: string | null;
          latest_parcel_event_type: string | null;
          latest_parcel_event_at: string | null;
          age_hours: string;
        }>(
          `
            WITH latest_parcel_event AS (
              SELECT DISTINCT ON (ope.order_id)
                ope.order_id,
                ope.event_type,
                COALESCE(ope.occurred_at, ope.created_at) AS event_at
              FROM order_parcel_events ope
              ORDER BY ope.order_id, COALESCE(ope.occurred_at, ope.created_at) DESC
            )
            SELECT
              o.id,
              o.buyer_id,
              o.seller_id,
              o.listing_id,
              o.status,
              o.total_gbp,
              o.tracking_number,
              o.created_at::text,
              o.updated_at::text,
              o.shipped_at::text,
              lpe.event_type AS latest_parcel_event_type,
              lpe.event_at::text AS latest_parcel_event_at,
              EXTRACT(EPOCH FROM (NOW() - COALESCE(o.shipped_at, o.updated_at))) / 3600 AS age_hours
            FROM orders o
            LEFT JOIN latest_parcel_event lpe ON lpe.order_id = o.id
            WHERE
              (o.status = 'created' AND o.created_at <= NOW() - INTERVAL '2 hours')
              OR (
                o.status = 'paid'
                AND (
                  o.updated_at <= NOW() - make_interval(hours => $1::int)
                  OR COALESCE(lpe.event_type, '') IN (
                    'picked_up',
                    'in_transit',
                    'out_for_delivery',
                    'delivered',
                    'collection_confirmed'
                  )
                )
              )
              OR (
                o.status = 'shipped'
                AND (
                  COALESCE(o.shipped_at, o.updated_at) <= NOW() - INTERVAL '7 days'
                  OR COALESCE(lpe.event_type, '') IN ('delivered', 'collection_confirmed')
                )
              )
            ORDER BY o.updated_at ASC
            LIMIT $2
          `,
          [paidOlderHours, limit]
        )
        : await client.query<{
          id: string;
          buyer_id: string;
          seller_id: string;
          listing_id: string;
          status: string;
          total_gbp: number | string;
          tracking_number: string | null;
          created_at: string;
          updated_at: string;
          shipped_at: string | null;
          latest_parcel_event_type: string | null;
          latest_parcel_event_at: string | null;
          age_hours: string;
        }>(
          `
            SELECT
              o.id,
              o.buyer_id,
              o.seller_id,
              o.listing_id,
              o.status,
              o.total_gbp,
              o.tracking_number,
              o.created_at::text,
              o.updated_at::text,
              o.shipped_at::text,
              NULL::text AS latest_parcel_event_type,
              NULL::text AS latest_parcel_event_at,
              EXTRACT(EPOCH FROM (NOW() - COALESCE(o.shipped_at, o.updated_at))) / 3600 AS age_hours
            FROM orders o
            WHERE
              (o.status = 'created' AND o.created_at <= NOW() - INTERVAL '2 hours')
              OR (o.status = 'paid' AND o.updated_at <= NOW() - make_interval(hours => $1::int))
              OR (o.status = 'shipped' AND COALESCE(o.shipped_at, o.updated_at) <= NOW() - INTERVAL '7 days')
            ORDER BY o.updated_at ASC
            LIMIT $2
          `,
          [paidOlderHours, limit]
        );

      return {
        ok: true,
        items: result.rows.map((row) => ({
          id: row.id,
          buyerId: row.buyer_id,
          sellerId: row.seller_id,
          listingId: row.listing_id,
          status: row.status,
          totalGbp: Number(row.total_gbp),
          trackingNumber: row.tracking_number,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          shippedAt: row.shipped_at,
          latestParcelEventType: row.latest_parcel_event_type,
          latestParcelEventAt: row.latest_parcel_event_at,
          ageHours: roundTo(Number(row.age_hours), 2),
        })),
      };
    } finally {
      client.release();
    }
  });
};
