import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import {
  enqueueAuctionSweepJob,
  enqueueOnezeMintReserveJob,
} from '../lib/queues.js';
import {
  getLatestReconciliationRun,
  getPerIntentReconciliationItems,
  perIntentReconciliationTableAvailable,
  runPerIntentReconciliation,
  type PerIntentReconciliationStatus,
} from '../lib/reconciliation.js';
import {
  pricingTablesAvailable as onezePricingTablesAvailable,
} from '../lib/pricingEngine.js';
import {
  verifyAndNormalizeWebhook,
  type ProviderSlug,
} from '../lib/paymentProviders.js';

// ── Types (mirrored from index.ts) ─────────────────────────────────────

type DbQueryable = Pool | PoolClient;

const PARCEL_EVENT_TYPES = [
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'collection_confirmed',
  'delivery_failed',
  'returned',
] as const;
type ParcelEventType = (typeof PARCEL_EVENT_TYPES)[number];

type PaymentIntentTerminalStatus = 'succeeded' | 'failed' | 'cancelled';

interface PaymentIntentRow {
  id: string;
  user_id: string;
  gateway_id: string;
  channel: string;
  order_id: string | null;
  coOwn_order_id: number | null;
  instrument_id: number | null;
  amount_gbp: number | string;
  amount_currency: string;
  amount_minor?: number | string | null;
  currency_exponent?: number | null;
  money_registry_version?: string | null;
  provider_amount?: string | null;
  provider_amount_unit?: unknown | null;
  money_conversion_trace?: unknown | null;
  money_quarantined?: boolean;
  status: string;
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

type OpsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  toJsonString: (value: unknown) => string;
  createRuntimeId: (prefix: string) => string;
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
  ledgerTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  onezeArchitectureTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  onezeMintFlowTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  getPayoutPauseState: () => Promise<{
    paused: boolean;
    reason: string | null;
    reconciliationRunId: string | null;
    mismatchGbp: string | null;
  }>;
  runPlatformReconciliation: (reason: string, runDate?: string) => Promise<{ runDate: string }>;
  runPlatformRevenueSweep: (reason: string) => Promise<unknown>;
  runOpsAlerting: (reason: string) => Promise<unknown>;
  runOnezeReconciliation: (reason: string) => Promise<unknown>;
  runOnezeDailyAttestation: (reason: string) => Promise<unknown>;
  syncOnezeInternalFxRatesFromProvider: (reason: string) => Promise<unknown>;
  runOnezeAutomaticSpreadAdjustment: (
    reason: string,
    options: { ignoreEnabled: boolean }
  ) => Promise<unknown>;
  releaseCommerceOrderEscrowToSeller: (
    client: PoolClient,
    input: {
      orderId: string;
      sellerId: string;
      subtotalGbp: number;
      parcelProvider: string;
      parcelEventType: ParcelEventType;
    }
  ) => Promise<{ released: boolean }>;
  loadMintOperationById: (
    client: DbQueryable,
    operationId: string,
    options: { forUpdate: boolean }
  ) => Promise<Record<string, unknown> | null>;
  toMintOperationPayload: (row: Record<string, unknown>) => Record<string, unknown>;
  ensureLedgerAccount: (
    client: PoolClient,
    ownerType: string,
    ownerId: string,
    code: string
  ) => Promise<string>;
  appendLedgerEntry: (
    client: PoolClient,
    input: {
      accountId: string;
      counterpartyAccountId: string;
      direction: 'debit' | 'credit';
      amountGbp: number;
      sourceType: string;
      sourceId: string;
      lineType: string;
      metadata: Record<string, unknown>;
    }
  ) => Promise<void>;
  findPaymentIntentByProviderRef: (
    client: PoolClient,
    gatewayId: string,
    providerIntentRef: string
  ) => Promise<PaymentIntentRow | null>;
  settlePaymentIntent: (
    client: PoolClient,
    input: {
      intentId: string;
      finalStatus: PaymentIntentTerminalStatus;
      providerAttemptRef?: string;
      rawPayload?: Record<string, unknown>;
    }
  ) => Promise<unknown>;
};

export const registerOpsRoutes = ({
  app,
  db,
  createApiError,
  toJsonString,
  createRuntimeId,
  getApiError,
  statusCodeForApiError,
  ensureSecurityAdminAccess,
  paymentTablesAvailable,
  ledgerTablesAvailable,
  onezeArchitectureTablesAvailable,
  onezeMintFlowTablesAvailable,
  getPayoutPauseState,
  runPlatformReconciliation,
  runPlatformRevenueSweep,
  runOpsAlerting,
  runOnezeReconciliation,
  runOnezeDailyAttestation,
  syncOnezeInternalFxRatesFromProvider,
  runOnezeAutomaticSpreadAdjustment,
  releaseCommerceOrderEscrowToSeller,
  loadMintOperationById,
  toMintOperationPayload,
  ensureLedgerAccount,
  appendLedgerEntry,
  findPaymentIntentByProviderRef,
  settlePaymentIntent,
}: OpsRouteDependencies) => {
  app.post('/ops/auctions/sweep', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    await enqueueAuctionSweepJob('manual');
    return {
      ok: true,
      queued: true,
    };
  });

  app.post('/ops/reconciliation/run', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    const bodySchema = z.object({
      runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    });

    const payload = bodySchema.parse(request.body ?? {});

    if (!(await paymentTablesAvailable(db)) || !(await ledgerTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: 'Payment settlement or ledger tables are unavailable. Run migrations first.',
      };
    }

    try {
      const run = await runPlatformReconciliation('manual', payload.runDate);
      const pauseState = await getPayoutPauseState();

      // Per-intent reconciliation: catches compensating errors invisible
      // to the daily aggregate.
      let perIntent: { mismatchCount: number } | null = null;
      try {
        if (await perIntentReconciliationTableAvailable(db)) {
          const perIntentResult = await runPerIntentReconciliation(db, {
            runDate: run.runDate,
            mismatchThresholdGbp: 0.01,
          });
          perIntent = { mismatchCount: perIntentResult.mismatchCount };
        }
      } catch (perIntentError) {
        request.log.error(
          { err: perIntentError, runDate: run.runDate },
          'Per-intent reconciliation failed (non-fatal)'
        );
      }

      return {
        ok: true,
        run,
        perIntent,
        payouts: {
          paused: pauseState.paused,
          reason: pauseState.reason ?? null,
          reconciliationRunId: pauseState.reconciliationRunId ?? null,
        },
      };
    } catch (error) {
      const apiError = getApiError(error);
      if (apiError?.code === 'RECONCILIATION_TABLES_UNAVAILABLE') {
        reply.code(503);
        return {
          ok: false,
          error: apiError.message,
        };
      }

      request.log.error({ err: error, runDate: payload.runDate }, 'Failed manual reconciliation run');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to run reconciliation',
      };
    }
  });

  app.get('/ops/reconciliation/latest', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    const latest = await getLatestReconciliationRun(db);
    const pauseState = await getPayoutPauseState();

    return {
      ok: true,
      latest,
      payouts: {
        paused: pauseState.paused,
        reason: pauseState.reason ?? null,
        reconciliationRunId: pauseState.reconciliationRunId ?? null,
        mismatchGbp: pauseState.mismatchGbp ?? null,
      },
    };
  });

  // ── Per-intent reconciliation items (drill-down) ────────────────────────
  app.get('/ops/reconciliation/per-intent', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    const querySchema = z.object({
      runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      status: z.enum(['matched', 'mismatch', 'missing_ledger', 'missing_intent']).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    });
    const { runDate, status, limit } = querySchema.parse(request.query);

    if (!(await perIntentReconciliationTableAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: 'Per-intent reconciliation table is unavailable. Run migration 093 first.',
      };
    }

    const items = await getPerIntentReconciliationItems(db, {
      runDate,
      status: status as PerIntentReconciliationStatus | undefined,
      limit,
    });

    return {
      ok: true,
      runDate,
      items,
      mismatchCount: items.filter(
        (i) => i.status === 'mismatch' || i.status === 'missing_ledger'
      ).length,
    };
  });

  // ── Seller first-sale review queue ──────────────────────────────────────
  // Lists pending first-sale reviews for admin action.
  app.get('/ops/seller-first-sale-reviews', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    const querySchema = z.object({
      status: z.enum(['pending', 'approved', 'rejected', 'escalated']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    });
    const { status, limit } = querySchema.parse(request.query);

    const reviews = await db.query<{
      id: number;
      seller_id: string;
      order_id: string;
      review_status: string;
      risk_score: number | null;
      review_notes: string | null;
      reviewed_by: string | null;
      reviewed_at: string | null;
      created_at: string;
    }>(
      `SELECT id, seller_id, order_id, review_status, risk_score, review_notes,
              reviewed_by, reviewed_at::text, created_at::text
       FROM seller_first_sale_reviews
       ${status ? 'WHERE review_status = $2' : ''}
       ORDER BY created_at DESC
       LIMIT $1`,
      status ? [limit, status] : [limit]
    );

    return {
      ok: true,
      reviews: reviews.rows,
    };
  });

  // Approve or reject a first-sale review.
  app.post('/ops/seller-first-sale-reviews/:reviewId/action', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    const paramsSchema = z.object({ reviewId: z.coerce.number().int().positive() });
    const { reviewId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      action: z.enum(['approve', 'reject', 'escalate']),
      notes: z.string().max(2000).optional(),
    });
    const { action, notes } = bodySchema.parse(request.body);

    const newStatus =
      action === 'approve' ? 'approved'
      : action === 'reject' ? 'rejected'
      : 'escalated';

    const updated = await db.query<{ id: number; seller_id: string; order_id: string }>(
      `UPDATE seller_first_sale_reviews
       SET review_status = $2, review_notes = $3, reviewed_by = $4,
           reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND review_status = 'pending'
       RETURNING id, seller_id, order_id`,
      [reviewId, newStatus, notes ?? null, request.authUser?.userId ?? null]
    );

    if (!updated.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Review not found or already actioned' };
    }

    return { ok: true, review: updated.rows[0] };
  });

  // ── Escrow release sweep ────────────────────────────────────────────────
  // Releases seller escrow for orders whose buyer-protection hold has expired.
  // Called by a cron worker or manually by an admin. Skips orders with open
  // disputes to prevent releasing funds that may need to be reversed.
  app.post('/ops/escrow/release-sweep', async (request, reply) => {
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

    const bodySchema = z.object({
      batchSize: z.coerce.number().int().min(1).max(500).default(100),
    });
    const { batchSize } = bodySchema.parse(request.body ?? {});

    const client = await db.connect();
    const released: Array<{ orderId: string; sellerId: string; amountGbp: number }> = [];
    try {
      await client.query('BEGIN');

      // Find orders whose hold has expired and escrow has not been released.
      const dueOrders = await client.query<{
        id: string;
        seller_id: string;
        subtotal_gbp: string | number;
      }>(
        `
          SELECT id, seller_id, subtotal_gbp::text
          FROM orders
          WHERE escrow_release_scheduled_at IS NOT NULL
            AND escrow_released_at IS NULL
            AND escrow_release_scheduled_at <= NOW()
            AND status = 'delivered'
          ORDER BY escrow_release_scheduled_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [batchSize]
      );

      for (const order of dueOrders.rows) {
        // Skip if there's an open dispute on this order's payment intent.
        const openDispute = await client.query<{ exists: boolean }>(
          `
            SELECT EXISTS (
              SELECT 1 FROM payment_disputes d
              JOIN payment_intents i ON i.id = d.intent_id
              WHERE i.order_id = $1
                AND d.status IN ('open', 'warning', 'needs_response')
                AND d.evidence_submitted_at IS NULL
            ) AS exists
          `,
          [order.id]
        );
        if (openDispute.rows[0]?.exists) {
          continue;
        }

        // Skip orders with pending first-sale reviews.
        try {
          const pendingReview = await client.query<{ exists: boolean }>(
            `SELECT EXISTS (
              SELECT 1 FROM seller_first_sale_reviews
              WHERE order_id = $1 AND review_status = 'pending'
             ) AS exists`,
            [order.id]
          );
          if (pendingReview.rows[0]?.exists) {
            continue;
          }
        } catch {
          // Table may not exist yet — skip this check.
        }

        if (await ledgerTablesAvailable(client)) {
          const release = await releaseCommerceOrderEscrowToSeller(client, {
            orderId: order.id,
            sellerId: order.seller_id,
            subtotalGbp: Number(order.subtotal_gbp),
            parcelProvider: 'release_sweep',
            parcelEventType: 'delivered' as ParcelEventType,
          });
          if (release.released) {
            await client.query(
              `UPDATE orders SET escrow_released_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [order.id]
            );
            released.push({
              orderId: order.id,
              sellerId: order.seller_id,
              amountGbp: Number(order.subtotal_gbp),
            });
          }
        }
      }

      await client.query('COMMIT');

      return {
        ok: true,
        releasedCount: released.length,
        released,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error }, 'Escrow release sweep failed');
      reply.code(500);
      return { ok: false, error: 'Escrow release sweep failed' };
    } finally {
      client.release();
    }
  });

  app.post('/ops/platform-revenue/sweep', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    try {
      const result = await runPlatformRevenueSweep('manual');
      return {
        ok: true,
        result,
      };
    } catch (error) {
      const apiError = getApiError(error);
      if (apiError?.code === 'LEDGER_TABLES_UNAVAILABLE') {
        reply.code(503);
        return {
          ok: false,
          error: apiError.message,
        };
      }

      if (apiError?.code === 'PLATFORM_SWEEP_EXTERNAL_TRANSFER_REQUIRED') {
        reply.code(503);
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      if (apiError?.code === 'PLATFORM_SWEEP_EXTERNAL_TRANSFER_FAILED') {
        reply.code(502);
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      request.log.error({ err: error }, 'Failed manual platform revenue sweep run');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to run platform revenue sweep',
      };
    }
  });

  app.post('/ops/alerts/run', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    try {
      const result = await runOpsAlerting('manual');
      return {
        ok: true,
        result,
      };
    } catch (error) {
      request.log.error({ err: error }, 'Failed manual ops alerting run');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to run ops alerting checks',
      };
    }
  });

  app.get('/ops/payouts/pause', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    const pauseState = await getPayoutPauseState();
    return {
      ok: true,
      payouts: {
        paused: pauseState.paused,
        reason: pauseState.reason ?? null,
        reconciliationRunId: pauseState.reconciliationRunId ?? null,
        mismatchGbp: pauseState.mismatchGbp ?? null,
      },
    };
  });

  app.post('/ops/oneze/reconcile', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    if (!(await onezeArchitectureTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze wallet architecture tables are unavailable. Run migrations first.',
      };
    }

    const snapshot = await runOnezeReconciliation('manual');
    return {
      ok: true,
      snapshot,
    };
  });

  app.post('/ops/oneze/attest', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    if (!(await onezeArchitectureTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze wallet architecture tables are unavailable. Run migrations first.',
      };
    }

    const attestation = await runOnezeDailyAttestation('manual');
    return {
      ok: true,
      attestation,
    };
  });

  app.post('/ops/oneze/fx-sync', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    if (!(await onezePricingTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze controlled pricing tables are unavailable. Run migrations first.',
      };
    }

    try {
      const result = await syncOnezeInternalFxRatesFromProvider('manual');
      return {
        ok: true,
        sync: result,
      };
    } catch (error) {
      request.log.error({ err: error }, 'Failed manual 1ze FX sync');
      reply.code(502);
      return {
        ok: false,
        error: 'Unable to sync FX rates from provider',
      };
    }
  });

  app.post('/ops/oneze/auto-adjust', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    if (!(await onezePricingTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze controlled pricing tables are unavailable. Run migrations first.',
      };
    }

    try {
      const result = await runOnezeAutomaticSpreadAdjustment('manual', {
        ignoreEnabled: true,
      });

      return {
        ok: true,
        adjustment: result,
      };
    } catch (error) {
      const apiError = getApiError(error);
      if (apiError) {
        reply.code(statusCodeForApiError(apiError.code));
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      request.log.error({ err: error }, 'Failed manual 1ze automatic spread adjustment');
      reply.code(500);
      return {
        ok: false,
        error: 'Unable to execute automatic spread adjustment',
      };
    }
  });

  app.post('/ops/oneze/mint/:operationId/retry', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    const paramsSchema = z.object({
      operationId: z.string().min(3),
    });

    const { operationId } = paramsSchema.parse(request.params);

    if (!(await onezeMintFlowTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze mint flow tables are unavailable. Run migrations first.',
      };
    }

    const operation = await loadMintOperationById(db, operationId, {
      forUpdate: false,
    });

    if (!operation) {
      reply.code(404);
      return {
        ok: false,
        error: 'Mint operation not found',
      };
    }

    await enqueueOnezeMintReserveJob({
      mintOperationId: (operation as { id: string }).id,
      initiatedBy: request.authUser?.userId ?? 'security_admin',
      reason: 'manual_retry',
    });

    return {
      ok: true,
      enqueued: true,
      operation: toMintOperationPayload(operation),
    };
  });

  // ── Payout schedule sweep ───────────────────────────────────────────────
  // Batch-creates payout_requests for sellers with scheduled payouts whose
  // available balance exceeds their minimum. Called by a daily cron.
  app.post('/ops/payouts/schedule-sweep', async (request, reply) => {
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

    const payoutPauseState = await getPayoutPauseState();
    if (payoutPauseState.paused) {
      reply.code(503);
      return {
        ok: false,
        error: 'Payouts temporarily paused for reconciliation review.',
      };
    }

    // Find payout accounts with a scheduled payout due.
    const dueAccounts = await db.query<{
      id: number;
      user_id: string;
      currency: string;
      payout_minimum_gbp: string;
    }>(
      `
        SELECT id, user_id, currency, payout_minimum_gbp::text
        FROM payout_accounts
        WHERE status = 'active'
          AND payout_schedule != 'on_demand'
          AND next_scheduled_payout_at IS NOT NULL
          AND next_scheduled_payout_at <= NOW()
        ORDER BY next_scheduled_payout_at ASC
        LIMIT 200
      `
    );

    const created: Array<{ userId: string; payoutAccountId: number; amountGbp: number }> = [];

    for (const account of dueAccounts.rows) {
      const minimumGbp = Number(account.payout_minimum_gbp) || config.payoutDefaultMinimumGbp;

      // Sum available seller_payable balance (released, not yet requested).
      const balanceResult = await db.query<{ available_gbp: string }>(
        `
          SELECT COALESCE(SUM(amount_gbp), 0)::text AS available_gbp
          FROM ledger_entries
          WHERE account_id = (
            SELECT id FROM ledger_accounts
            WHERE owner_type = 'user' AND owner_id = $1 AND code = 'seller_payable'
            LIMIT 1
          )
          AND direction = 'credit'
          AND created_at <= NOW()
        `,
        [account.user_id]
      );
      const availableGbp = Number(balanceResult.rows[0]?.available_gbp ?? '0');

      if (availableGbp < minimumGbp) {
        // Reschedule for next cycle.
        await db.query(
          `UPDATE payout_accounts SET next_scheduled_payout_at = NULL WHERE id = $1`,
          [account.id]
        );
        continue;
      }

      // Create a payout request for the available balance.
      const requestId = createRuntimeId('po');
      try {
        await db.query(
          `INSERT INTO payout_requests (id, user_id, payout_account_id, amount_gbp, amount_currency, status, idempotency_key, request_hash, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'requested', $6, $7, $8::jsonb, NOW(), NOW())`,
          [
            requestId,
            account.user_id,
            account.id,
            availableGbp,
            account.currency,
            `sched_${account.id}_${new Date().toISOString().slice(0, 10)}`,
            `sched_${account.id}_${new Date().toISOString().slice(0, 10)}`,
            toJsonString({ source: 'schedule_sweep' }),
          ]
        );
        created.push({
          userId: account.user_id,
          payoutAccountId: account.id,
          amountGbp: availableGbp,
        });
      } catch (error) {
        request.log.error({ err: error, userId: account.user_id }, 'Scheduled payout creation failed');
      }

      // Clear the next scheduled payout time.
      await db.query(
        `UPDATE payout_accounts SET next_scheduled_payout_at = NULL, updated_at = NOW() WHERE id = $1`,
        [account.id]
      );
    }

    return {
      ok: true,
      createdCount: created.length,
      created,
    };
  });

  // ── Reserve release sweep ───────────────────────────────────────────────
  // Releases rolling reserve holds whose holding period has expired.
  app.post('/ops/payouts/reserve-release-sweep', async (request, reply) => {
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

    const dueHolds = await db.query<{
      id: number;
      user_id: string;
      order_id: string;
      held_amount_gbp: string;
    }>(
      `
        SELECT id, user_id, order_id, held_amount_gbp::text
        FROM payout_reserve_holds
        WHERE released_at IS NULL
          AND release_eligible_at <= NOW()
        ORDER BY release_eligible_at ASC
        LIMIT 200
      `
    );

    const released: Array<{ holdId: number; userId: string; amountGbp: number }> = [];

    for (const hold of dueHolds.rows) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        // Credit the held amount back to seller_payable.
        const sellerPayableAccountId = await ensureLedgerAccount(
          client,
          'user',
          hold.user_id,
          'seller_payable'
        );
        const reserveAccountId = await ensureLedgerAccount(
          client,
          'platform',
          'platform',
          'reserve_hold'
        );

        const heldAmount = Number(hold.held_amount_gbp);
        await appendLedgerEntry(client, {
          accountId: reserveAccountId,
          counterpartyAccountId: sellerPayableAccountId,
          direction: 'debit',
          amountGbp: heldAmount,
          sourceType: 'reserve_release',
          sourceId: String(hold.id),
          lineType: 'reserve_release',
          metadata: { orderId: hold.order_id, holdId: hold.id },
        });
        await appendLedgerEntry(client, {
          accountId: sellerPayableAccountId,
          counterpartyAccountId: reserveAccountId,
          direction: 'credit',
          amountGbp: heldAmount,
          sourceType: 'reserve_release',
          sourceId: String(hold.id),
          lineType: 'reserve_release',
          metadata: { orderId: hold.order_id, holdId: hold.id },
        });

        await client.query(
          `UPDATE payout_reserve_holds SET released_at = NOW() WHERE id = $1`,
          [hold.id]
        );

        await client.query('COMMIT');
        released.push({
          holdId: Number(hold.id),
          userId: hold.user_id,
          amountGbp: heldAmount,
        });
      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error({ err: error, holdId: hold.id }, 'Reserve release failed');
      } finally {
        client.release();
      }
    }

    return {
      ok: true,
      releasedCount: released.length,
      released,
    };
  });

  // ── Webhook dead-letter queue retry sweep ──────────────────────────────
  // Retries failed webhook events with exponential backoff. Called by a
  // cron worker or manually by an admin.
  app.post('/ops/webhooks/retry-sweep', async (request, reply) => {
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

    const bodySchema = z.object({
      batchSize: z.coerce.number().int().min(1).max(100).default(20),
    });
    const { batchSize } = bodySchema.parse(request.body ?? {});

    const dueItems = await db.query<{
      id: number;
      gateway_id: string;
      provider_event_id: string;
      event_type: string;
      intent_id: string | null;
      raw_payload: Record<string, unknown>;
      attempts: number;
      max_attempts: number;
    }>(
      `
        SELECT id, gateway_id, provider_event_id, event_type, intent_id,
               raw_payload, attempts, max_attempts
        FROM webhook_processing_outbox
        WHERE status IN ('pending', 'failed')
          AND next_retry_at <= NOW()
          AND attempts < max_attempts
        ORDER BY next_retry_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [batchSize]
    );

    const retried: Array<{ id: number; status: string; error?: string }> = [];

    for (const item of dueItems.rows) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        // Mark as processing.
        await client.query(
          `UPDATE webhook_processing_outbox
           SET status = 'processing', last_attempt_at = NOW(), attempts = attempts + 1, updated_at = NOW()
           WHERE id = $1`,
          [item.id]
        );

        // Re-normalize and re-process the webhook event.
        const provider: ProviderSlug = item.gateway_id === 'stripe_americas' ? 'stripe'
          : item.gateway_id === 'razorpay_in' ? 'razorpay'
          : item.gateway_id === 'mollie_eu' ? 'mollie'
          : item.gateway_id === 'flutterwave_africa' ? 'flutterwave'
          : item.gateway_id === 'tap_gulf' ? 'tap'
          : item.gateway_id === 'wise_global' ? 'wise'
          : 'stripe';

        const verification = await verifyAndNormalizeWebhook(
          provider,
          toJsonString(item.raw_payload),
          {},
          item.raw_payload
        );

        if (!verification.verified || !verification.event) {
          throw new Error(verification.reason ?? 'Webhook re-verification failed');
        }

        const event = verification.event;
        let intentRow: PaymentIntentRow | null = null;
        if (event.intentId) {
          const byId = await client.query<PaymentIntentRow>(
            `SELECT id, user_id, gateway_id, channel, order_id, coOwn_order_id, instrument_id,
                    amount_gbp, amount_currency, amount_minor, currency_exponent, money_registry_version,
                    provider_amount, provider_amount_unit, money_conversion_trace, money_quarantined,
                    status, provider_intent_ref, client_secret, provider_status, next_action_url,
                    sca_expires_at, settled_at, failure_code, failure_message, created_at, updated_at
             FROM payment_intents WHERE id = $1 LIMIT 1`,
            [event.intentId]
          );
          intentRow = byId.rows[0] ?? null;
        }
        if (!intentRow && event.providerIntentRef) {
          intentRow = await findPaymentIntentByProviderRef(client, item.gateway_id, event.providerIntentRef);
        }

        // Check if this webhook event was already processed.
        const alreadyProcessed = await client.query<{ id: number }>(
          `SELECT id FROM payment_webhook_events
           WHERE gateway_id = $1 AND provider_event_id = $2 AND processed_at IS NOT NULL
           LIMIT 1`,
          [item.gateway_id, item.provider_event_id]
        );

        if (alreadyProcessed.rowCount) {
          // Already processed — mark as succeeded.
          await client.query(
            `UPDATE webhook_processing_outbox SET status = 'succeeded', updated_at = NOW() WHERE id = $1`,
            [item.id]
          );
          retried.push({ id: Number(item.id), status: 'succeeded' });
        } else {
          // Re-process: settle the intent if needed.
          if (event.paymentStatus && intentRow && ['succeeded', 'failed', 'cancelled'].includes(event.paymentStatus)) {
            await settlePaymentIntent(client, {
              intentId: intentRow.id,
              finalStatus: event.paymentStatus as PaymentIntentTerminalStatus,
              providerAttemptRef: event.providerEventId,
              rawPayload: { source: 'dlq_retry', provider, eventType: event.eventType, payload: event.rawPayload },
            });
          }

          // Mark the webhook event as processed.
          await client.query(
            `UPDATE payment_webhook_events SET processed_at = NOW()
             WHERE gateway_id = $1 AND provider_event_id = $2`,
            [item.gateway_id, item.provider_event_id]
          );

          await client.query(
            `UPDATE webhook_processing_outbox SET status = 'succeeded', updated_at = NOW() WHERE id = $1`,
            [item.id]
          );
          retried.push({ id: Number(item.id), status: 'succeeded' });
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');

        const nextBackoffSeconds = Math.min(3600, 2 ** (item.attempts + 1));
        const isDead = item.attempts + 1 >= item.max_attempts;

        try {
          await client.query('BEGIN');
          await client.query(
            `UPDATE webhook_processing_outbox
             SET status = $2, last_error = $3,
                 next_retry_at = NOW() + ($4 || ' seconds')::INTERVAL,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              item.id,
              isDead ? 'dead' : 'failed',
              String((error as Error).message ?? 'Unknown error').slice(0, 2000),
              String(nextBackoffSeconds),
            ]
          );
          await client.query('COMMIT');
        } catch {
          await client.query('ROLLBACK');
        }

        request.log.error({ err: error, itemId: item.id }, 'Webhook DLQ retry failed');
        retried.push({ id: Number(item.id), status: isDead ? 'dead' : 'failed', error: (error as Error).message });
      } finally {
        client.release();
      }
    }

    return {
      ok: true,
      processedCount: retried.length,
      succeeded: retried.filter((r) => r.status === 'succeeded').length,
      failed: retried.filter((r) => r.status === 'failed').length,
      dead: retried.filter((r) => r.status === 'dead').length,
      items: retried,
    };
  });
};
