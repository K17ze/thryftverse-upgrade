import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { emitOrderCommerceCard } from '../lib/orderChatCards.js';
import { moneyFromMinor, type Money } from '../lib/money.js';
import { confirmReturnCaseRefund } from './returns.js';

interface RefundRouteDependencies {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string | null;
  postCommerceOrderRefundLedgerReversal: (
    client: PoolClient,
    orderId: string,
    initiatorId: string,
    amountGbp: number,
    refundRef?: string
  ) => Promise<{ reversed: boolean; alreadyReversed: boolean }>;
  /** Real PSP refund — returns money to the buyer's payment instrument.
   *  Same dependency the payment-refund routes use (index.ts createGatewayRefund). */
  createGatewayRefund: (input: {
    gatewayId: string;
    intentId: string;
    providerIntentRef: string;
    money: Money;
    refundAmount: number;
    reason?: string;
    metadata: Record<string, unknown>;
    /** Caller transaction — required for the oneze_internal rail so the
     *  wallet re-credit commits atomically with the refund row. */
    client?: PoolClient;
  }) => Promise<{
    providerRefundRef: string;
    refundStatus: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  }>;
  /** payment_refunds upsert — the provider-refund ledger (index.ts upsertPaymentRefund). */
  upsertPaymentRefund: (
    client: PoolClient,
    input: {
      intentId: string;
      gatewayId: string;
      providerRefundRef: string;
      status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
      amount: number;
      currency: string;
      reason?: string;
      metadata?: Record<string, unknown>;
      idempotencyKey?: string;
    }
  ) => Promise<void>;
}

const MAKER_CHECK_THRESHOLD_GBP = 100;

type RefundExecutionStatus = 'pending' | 'succeeded' | 'failed' | 'unknown';
type MakerCheckStatus = 'single_approval' | 'pending_check' | 'checked' | 'rejected';

/** Refund-execution statuses that reserve refundable balance. 'pending'
 *  covers maker-check reservations and provider calls in flight; 'unknown'
 *  covers executions whose provider outcome is unresolved. Both represent
 *  money that may still leave the platform, so remaining-balance checks must
 *  count them — not just 'succeeded'. */
export const REFUND_COMMITTED_EXECUTION_STATUSES: readonly RefundExecutionStatus[] = [
  'pending',
  'succeeded',
  'unknown',
];

/** payment_refunds statuses that reserve refundable balance — a 'pending'
 *  provider refund is in flight and must hold its reservation until it
 *  resolves. */
export const REFUND_COMMITTED_PROVIDER_STATUSES: readonly string[] = [
  'pending',
  'succeeded',
];

/** Penny-tolerant bound check shared by the create and checker-approval
 *  paths: a requested amount may not exceed the remaining refundable
 *  balance (order total minus committed refunds). */
export function refundExceedsRemaining(amountGbp: number, remainingGbp: number): boolean {
  return amountGbp > remainingGbp + 0.001;
}

/** True once cumulative succeeded refunds cover the order total — the only
 *  condition under which the order may flip to 'refunded'. */
export function isOrderFullyRefunded(cumulativeRefundedGbp: number, orderTotalGbp: number): boolean {
  return cumulativeRefundedGbp + 0.001 >= orderTotalGbp;
}

/** Which lifecycle card a refund execution announces once it resolves.
 *  A partial refund must never emit 'order_refunded' — the order keeps its
 *  live status and the thread gets the distinct partial-refund card. */
export function resolveRefundCardState(
  executionStatus: RefundExecutionStatus,
  cumulativeRefundedGbp: number,
  orderTotalGbp: number
): 'order_refunded' | 'order_partially_refunded' | null {
  if (executionStatus !== 'succeeded') return null;
  return isOrderFullyRefunded(cumulativeRefundedGbp, orderTotalGbp)
    ? 'order_refunded'
    : 'order_partially_refunded';
}

// ── Abuse-signal review routing ────────────────────────────────────────────
// The amount threshold is not the only reason a refund deserves a second
// pair of eyes. This is deliberately a small, readable rules set — not a
// scoring framework. Every fired signal routes the execution to maker-check
// and is recorded on the execution row (provider_response.review.signals)
// so ops can see WHY the refund was held.

/** Trailing window for buyer refund-velocity measurement. */
export const REFUND_REVIEW_WINDOW_DAYS = 30;
/** Refunds in the window at or above this count route to review outright. */
export const REFUND_REVIEW_VELOCITY_MIN_REFUNDS = 3;
/** Below the absolute count, a refund-to-order ratio at or above this still
 *  routes to review once the minimum refund count is met. */
export const REFUND_REVIEW_VELOCITY_RATIO = 0.5;
export const REFUND_REVIEW_VELOCITY_RATIO_MIN_REFUNDS = 2;
/** Accounts younger than this refunding route to review. */
export const REFUND_REVIEW_NEW_ACCOUNT_DAYS = 30;
/** A buyer with this many lifetime return cases is a serial returner. */
export const REFUND_REVIEW_BUYER_MIN_RETURN_CASES = 3;
/** Seller-side signal: at least this many disputes/return cases AND that
 *  ratio of the seller's orders. */
export const REFUND_REVIEW_SELLER_MIN_CASES = 3;
export const REFUND_REVIEW_SELLER_CASE_RATIO = 0.15;

export type RefundReviewSignalCode =
  | 'amount_over_threshold'
  | 'buyer_refund_velocity'
  | 'new_buyer_account'
  | 'buyer_history_unavailable'
  | 'buyer_prior_disputes'
  | 'order_prior_case'
  | 'seller_dispute_rate'
  | 'signal_evaluation_error';

export interface RefundReviewSignal {
  code: RefundReviewSignalCode;
  detail: string;
}

/** Facts gathered by the signal query — the pure evaluator below decides. */
export interface RefundAbuseFacts {
  /** Days since the buyer's user row was created; null when the row is
   *  missing (conservative: unverifiable history routes to review). */
  buyerAccountAgeDays: number | null;
  buyerRefundsInWindow: number;
  buyerOrdersInWindow: number;
  buyerDisputeCount: number;
  buyerReturnCaseCount: number;
  /** Disputes/return cases already on this order, excluding the return case
   *  this refund is linked to (the sanctioned return-remedy flow). */
  orderCaseCount: number;
  sellerCaseCount: number;
  sellerOrderCount: number;
}

/** Evaluate the abuse rules against gathered facts. Pure — no I/O — so the
 *  rules are unit-testable and the query shape stays in one place. */
export function evaluateRefundAbuseSignals(facts: RefundAbuseFacts): RefundReviewSignal[] {
  const signals: RefundReviewSignal[] = [];

  if (facts.buyerAccountAgeDays === null) {
    signals.push({
      code: 'buyer_history_unavailable',
      detail: 'buyer account record not found — history unverifiable',
    });
  } else if (facts.buyerAccountAgeDays < REFUND_REVIEW_NEW_ACCOUNT_DAYS) {
    signals.push({
      code: 'new_buyer_account',
      detail: `buyer account is ${Math.floor(facts.buyerAccountAgeDays)}d old (< ${REFUND_REVIEW_NEW_ACCOUNT_DAYS}d)`,
    });
  }

  const velocityRatio = facts.buyerRefundsInWindow / Math.max(facts.buyerOrdersInWindow, 1);
  if (
    facts.buyerRefundsInWindow >= REFUND_REVIEW_VELOCITY_MIN_REFUNDS ||
    (facts.buyerRefundsInWindow >= REFUND_REVIEW_VELOCITY_RATIO_MIN_REFUNDS &&
      velocityRatio >= REFUND_REVIEW_VELOCITY_RATIO)
  ) {
    signals.push({
      code: 'buyer_refund_velocity',
      detail: `${facts.buyerRefundsInWindow} refunds across ${facts.buyerOrdersInWindow} orders in the last ${REFUND_REVIEW_WINDOW_DAYS}d`,
    });
  }

  if (
    facts.buyerDisputeCount > 0 ||
    facts.buyerReturnCaseCount >= REFUND_REVIEW_BUYER_MIN_RETURN_CASES
  ) {
    signals.push({
      code: 'buyer_prior_disputes',
      detail: `${facts.buyerDisputeCount} payment dispute(s), ${facts.buyerReturnCaseCount} return case(s) on buyer`,
    });
  }

  if (facts.orderCaseCount > 0) {
    signals.push({
      code: 'order_prior_case',
      detail: `${facts.orderCaseCount} prior dispute/return case(s) on this order`,
    });
  }

  if (
    facts.sellerCaseCount >= REFUND_REVIEW_SELLER_MIN_CASES &&
    facts.sellerCaseCount / Math.max(facts.sellerOrderCount, 1) >= REFUND_REVIEW_SELLER_CASE_RATIO
  ) {
    signals.push({
      code: 'seller_dispute_rate',
      detail: `${facts.sellerCaseCount} disputes/returns across ${facts.sellerOrderCount} seller orders`,
    });
  }

  return signals;
}

/** Read the fired-signal list back out of a refund_executions
 *  provider_response JSONB blob. Unknown shapes yield an empty list —
 *  parsing is never allowed to break a read path. */
export function extractReviewSignals(providerResponse: unknown): RefundReviewSignal[] {
  const review = (providerResponse as { review?: { signals?: unknown } } | null)?.review;
  if (!review || !Array.isArray(review.signals)) return [];
  return review.signals.filter(
    (s): s is RefundReviewSignal =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as RefundReviewSignal).code === 'string' &&
      typeof (s as RefundReviewSignal).detail === 'string'
  );
}

interface AuthenticatedUser {
  userId: string;
  role: 'user' | 'seller' | 'moderator' | 'admin';
}

function computeRequestHash(payload: {
  orderId: string;
  amountGbp: number;
  initiatorId: string;
  reason: string;
}): string {
  const canonical = JSON.stringify({
    orderId: payload.orderId,
    amountGbp: payload.amountGbp.toFixed(2),
    initiatorId: payload.initiatorId,
    reason: payload.reason,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function resolveAuthUser(request: FastifyRequest): AuthenticatedUser | null {
  const authUser = (request as unknown as { authUser?: AuthenticatedUser }).authUser;
  return authUser ?? null;
}

function isOperatorOrAdmin(role: string): boolean {
  return role === 'admin' || role === 'moderator';
}

export function registerRefundRoutes({
  app,
  db,
  resolveAuthenticatedUserId,
  postCommerceOrderRefundLedgerReversal,
  createGatewayRefund,
  upsertPaymentRefund,
}: RefundRouteDependencies) {
  /** Sum refund_executions amounts for an order. `statuses` controls which
   *  executions count — REFUND_COMMITTED_EXECUTION_STATUSES for
   *  remaining-balance checks, ['succeeded'] for fully-refunded checks.
   *  `excludeExecutionId` keeps the execution currently being created or
   *  approved out of its own reservation sum. */
  const sumRefundExecutionsGbp = async (
    client: PoolClient,
    orderId: string,
    statuses: readonly RefundExecutionStatus[],
    excludeExecutionId?: string
  ): Promise<number> => {
    const result = await client.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(amount_gbp), 0)::text AS total
       FROM refund_executions
       WHERE order_id = $1
         AND status = ANY($2::text[])
         AND ($3::text = '' OR id <> $3)`,
      [orderId, statuses as string[], excludeExecutionId ?? '']
    );
    return Number(result.rows[0]?.total ?? 0);
  };

  /** Sum payment_refunds amounts across an order's payment intents. Rows
   *  written by this route carry metadata.refundExecutionId and are already
   *  counted through the refund_executions sum — excluding them prevents
   *  double-counting the same money. */
  const sumProviderRefundsGbp = async (
    client: PoolClient,
    orderId: string,
    statuses: readonly string[]
  ): Promise<number> => {
    const result = await client.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(pr.amount), 0)::text AS total
       FROM payment_refunds pr
       JOIN payment_intents pi ON pi.id = pr.intent_id
       WHERE pi.order_id = $1
         AND pr.status = ANY($2::text[])
         AND pr.metadata->>'refundExecutionId' IS NULL`,
      [orderId, statuses as string[]]
    );
    return Number(result.rows[0]?.total ?? 0);
  };

  /** Cumulative refunds that have actually completed — decides whether the
   *  order flips to 'refunded' or stays live with a partial refund. */
  const sumSucceededRefundsGbp = async (client: PoolClient, orderId: string): Promise<number> =>
    roundTo(
      (await sumRefundExecutionsGbp(client, orderId, ['succeeded'])) +
        (await sumProviderRefundsGbp(client, orderId, ['succeeded'])),
      2
    );

  /** Gather the abuse-signal facts for an order's buyer/seller in one round
   *  trip, then run the pure rules set. Every predicate uses an indexed
   *  column: orders(buyer_id|seller_id, created_at), refund_executions
   *  (order_id), return_cases(buyer_id|seller_id|order_id), payment_intents
   *  (user_id|order_id) and payment_disputes(intent_id).
   *
   *  `excludeExecutionId` keeps a re-attempted execution out of its own
   *  velocity count; `linkedReturnCaseId` keeps the sanctioned return-remedy
   *  case out of the order's prior-case count. Throws on query error — the
   *  caller fails conservative (routes to review). */
  const collectRefundAbuseSignals = async (
    client: PoolClient,
    opts: {
      orderId: string;
      buyerId: string;
      sellerId: string;
      linkedReturnCaseId?: string;
      excludeExecutionId?: string;
    }
  ): Promise<RefundReviewSignal[]> => {
    const result = await client.query<{
      buyer_created_at: Date | string | null;
      buyer_refunds_in_window: number;
      buyer_orders_in_window: number;
      buyer_dispute_count: number;
      buyer_return_case_count: number;
      order_case_count: number;
      seller_case_count: number;
      seller_order_count: number;
    }>(
      `SELECT
         (SELECT created_at FROM users WHERE id = $1) AS buyer_created_at,
         (SELECT COUNT(*)::int FROM orders o
            JOIN refund_executions re ON re.order_id = o.id
          WHERE o.buyer_id = $1
            AND re.created_at >= NOW() - ($2::int * INTERVAL '1 day')
            AND ($3::text = '' OR re.id <> $3)) AS buyer_refunds_in_window,
         (SELECT COUNT(*)::int FROM orders o
          WHERE o.buyer_id = $1
            AND o.created_at >= NOW() - ($2::int * INTERVAL '1 day')) AS buyer_orders_in_window,
         (SELECT COUNT(*)::int FROM payment_disputes pd
            JOIN payment_intents pi ON pi.id = pd.intent_id
          WHERE pi.user_id = $1) AS buyer_dispute_count,
         (SELECT COUNT(*)::int FROM return_cases rc
          WHERE rc.buyer_id = $1) AS buyer_return_case_count,
         (SELECT COUNT(*)::int FROM payment_disputes pd
            JOIN payment_intents pi ON pi.id = pd.intent_id
          WHERE pi.order_id = $4) +
         (SELECT COUNT(*)::int FROM return_cases rc
          WHERE rc.order_id = $4
            AND ($5::text = '' OR rc.id <> $5)) AS order_case_count,
         (SELECT COUNT(*)::int FROM payment_disputes pd
            JOIN payment_intents pi ON pi.id = pd.intent_id
            JOIN orders o ON o.id = pi.order_id
          WHERE o.seller_id = $6) +
         (SELECT COUNT(*)::int FROM return_cases rc
          WHERE rc.seller_id = $6) AS seller_case_count,
         (SELECT COUNT(*)::int FROM orders o
          WHERE o.seller_id = $6) AS seller_order_count`,
      [
        opts.buyerId,
        REFUND_REVIEW_WINDOW_DAYS,
        opts.excludeExecutionId ?? '',
        opts.orderId,
        opts.linkedReturnCaseId ?? '',
        opts.sellerId,
      ]
    );

    const row = result.rows[0];
    const buyerCreatedAt = row?.buyer_created_at ? new Date(row.buyer_created_at).getTime() : null;
    return evaluateRefundAbuseSignals({
      buyerAccountAgeDays:
        buyerCreatedAt === null ? null : (Date.now() - buyerCreatedAt) / (24 * 60 * 60 * 1000),
      buyerRefundsInWindow: Number(row?.buyer_refunds_in_window ?? 0),
      buyerOrdersInWindow: Number(row?.buyer_orders_in_window ?? 0),
      buyerDisputeCount: Number(row?.buyer_dispute_count ?? 0),
      buyerReturnCaseCount: Number(row?.buyer_return_case_count ?? 0),
      orderCaseCount: Number(row?.order_case_count ?? 0),
      sellerCaseCount: Number(row?.seller_case_count ?? 0),
      sellerOrderCount: Number(row?.seller_order_count ?? 0),
    });
  };

  interface RefundExecutionOutcome {
    executionStatus: RefundExecutionStatus;
    provider: string;
    providerStatus: string | null;
    providerRefundId: string | null;
    providerResponse: Record<string, unknown> | null;
    failureReason: string | null;
  }

  /** Execute the money movement for a refund. Routes through the real PSP
   *  (createGatewayRefund) when the order was funded by a provider payment
   *  intent — a card-funded order must refund the card, not the in-app
   *  wallet. Falls back to an internal ledger credit only when no provider
   *  intent exists (wallet-funded orders) and records that truthfully as
   *  providerStatus 'internal_credit'. */
  const executeRefundRails = async (
    client: PoolClient,
    opts: {
      orderId: string;
      initiatorId: string;
      amountGbp: number;
      refundExecutionId: string;
      reason?: string;
      approvedBy?: string;
    }
  ): Promise<RefundExecutionOutcome> => {
    const intentResult = await client.query<{
      id: string;
      gateway_id: string;
      provider_intent_ref: string | null;
    }>(
      `SELECT id, gateway_id, provider_intent_ref
       FROM payment_intents
       WHERE order_id = $1 AND status = 'succeeded' AND provider_intent_ref IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [opts.orderId]
    );

    const intent = intentResult.rows[0];

    if (!intent) {
      // No provider instrument — credit the buyer's in-app balance.
      await postCommerceOrderRefundLedgerReversal(
        client,
        opts.orderId,
        opts.initiatorId,
        opts.amountGbp,
        `internal_${opts.refundExecutionId}`
      );
      return {
        executionStatus: 'succeeded',
        provider: 'internal',
        providerStatus: 'internal_credit',
        providerRefundId: null,
        providerResponse: {
          source: 'ledger_reversal',
          destination: 'buyer_balance',
          amountGbp: opts.amountGbp,
          ...(opts.approvedBy ? { approvedBy: opts.approvedBy } : {}),
        },
        failureReason: null,
      };
    }

    // The local operation id doubles as the reservation ref: if the
    // provider call fails or times out, an 'unknown' payment_refunds row is
    // still recorded so reconciliation can resolve the outcome.
    const refundOperationId = `refund_${intent.gateway_id}_${opts.refundExecutionId}`;
    let providerRefundRef = refundOperationId;

    try {
      const gatewayRefund = await createGatewayRefund({
        gatewayId: intent.gateway_id,
        intentId: intent.id,
        // Query above filters provider_intent_ref IS NOT NULL.
        providerIntentRef: intent.provider_intent_ref!,
        money: moneyFromMinor('GBP', String(Math.round(opts.amountGbp * 100))),
        refundAmount: opts.amountGbp,
        reason: opts.reason,
        // Join this transaction so a oneze_internal wallet re-credit commits
        // atomically with the refund row.
        client,
        metadata: {
          source: 'refund_execution',
          orderId: opts.orderId,
          refundExecutionId: opts.refundExecutionId,
          refundOperationId,
          ...(opts.approvedBy ? { approvedBy: opts.approvedBy } : {}),
        },
      });
      providerRefundRef = gatewayRefund.providerRefundRef;

      await upsertPaymentRefund(client, {
        intentId: intent.id,
        gatewayId: intent.gateway_id,
        providerRefundRef,
        status: gatewayRefund.refundStatus,
        amount: opts.amountGbp,
        currency: 'GBP',
        reason: opts.reason,
        metadata: {
          source: 'refund_execution',
          orderId: opts.orderId,
          refundExecutionId: opts.refundExecutionId,
        },
      });

      if (gatewayRefund.refundStatus === 'succeeded') {
        // PAY-08: the escrow reversal posts only once the provider confirms
        // the money left — pending/unknown outcomes reconcile later.
        await postCommerceOrderRefundLedgerReversal(
          client,
          opts.orderId,
          opts.initiatorId,
          opts.amountGbp,
          providerRefundRef
        );
        return {
          executionStatus: 'succeeded',
          provider: intent.gateway_id,
          providerStatus: 'succeeded',
          providerRefundId: providerRefundRef,
          providerResponse: {
            source: 'gateway',
            gatewayId: intent.gateway_id,
            amountGbp: opts.amountGbp,
          },
          failureReason: null,
        };
      }

      if (gatewayRefund.refundStatus === 'failed' || gatewayRefund.refundStatus === 'cancelled') {
        return {
          executionStatus: 'failed',
          provider: intent.gateway_id,
          providerStatus: gatewayRefund.refundStatus,
          providerRefundId: providerRefundRef,
          providerResponse: { source: 'gateway', gatewayId: intent.gateway_id },
          failureReason: `Provider refund ${gatewayRefund.refundStatus}`,
        };
      }

      // 'pending' — the provider accepted but has not confirmed. Never
      // claim success: surface 'unknown' so reconciliation resolves it.
      return {
        executionStatus: 'unknown',
        provider: intent.gateway_id,
        providerStatus: 'pending',
        providerRefundId: providerRefundRef,
        providerResponse: { source: 'gateway', gatewayId: intent.gateway_id },
        failureReason: 'Provider refund pending confirmation',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'provider refund failed';
      // Best-effort 'unknown' reservation — the provider may have processed
      // the refund despite the client-side failure.
      try {
        await upsertPaymentRefund(client, {
          intentId: intent.id,
          gatewayId: intent.gateway_id,
          providerRefundRef,
          status: 'unknown',
          amount: opts.amountGbp,
          currency: 'GBP',
          reason: opts.reason,
          metadata: {
            source: 'refund_execution',
            orderId: opts.orderId,
            refundExecutionId: opts.refundExecutionId,
          },
        });
      } catch {
        // The refund_executions row still records 'unknown' below.
      }
      return {
        executionStatus: 'unknown',
        provider: intent.gateway_id,
        providerStatus: 'unknown',
        providerRefundId: providerRefundRef,
        providerResponse: { source: 'gateway', gatewayId: intent.gateway_id, error: message },
        failureReason: message,
      };
    }
  };

  // ── POST /orders/:orderId/refund-execute ──────────────────────────────────
  // Operator/admin executes a refund. Idempotent by request_hash. Maker-checker
  // applies for amounts over the threshold (default £100) or when any abuse
  // signal fires (buyer velocity, account age, dispute history, seller rate).
  app.post('/orders/:orderId/refund-execute', async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().min(4).max(64),
    });
    const bodySchema = z.object({
      amountGbp: z.number().positive().max(100000),
      reason: z.string().min(1).max(2000),
      returnCaseId: z.string().min(4).max(64).optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body ?? {});

    const initiatorId = resolveAuthenticatedUserId(request);
    if (!initiatorId) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      };
    }

    const authUser = resolveAuthUser(request);
    const initiatorRole = authUser?.role ?? 'user';
    if (!isOperatorOrAdmin(initiatorRole)) {
      reply.code(403);
      return {
        ok: false,
        error: 'Refund execution requires operator or admin authority',
        code: 'REFUND_REQUIRES_OPERATOR',
      };
    }

    const amountGbp = roundTo(body.amountGbp, 2);
    const requestHash = computeRequestHash({
      orderId,
      amountGbp,
      initiatorId,
      reason: body.reason,
    });

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Idempotency: if a succeeded execution with this hash exists, return it.
      const existing = await client.query<{
        id: string;
        status: RefundExecutionStatus;
        maker_check_status: MakerCheckStatus;
        provider_status: string | null;
        provider_response: Record<string, unknown> | null;
      }>(
        `
          SELECT id, status, maker_check_status, provider_status, provider_response
          FROM refund_executions
          WHERE request_hash = $1
          LIMIT 1
          FOR UPDATE
        `,
        [requestHash]
      );

      if (existing.rowCount) {
        const row = existing.rows[0];
        // If already succeeded, idempotent return.
        if (row.status === 'succeeded') {
          await client.query('COMMIT');
          return {
            ok: true,
            refundExecutionId: row.id,
            status: row.status,
            providerStatus: row.provider_status,
            idempotent: true,
          };
        }
        // If pending checker approval, surface that state — including the
        // recorded review signals so ops see why it was held.
        if (row.maker_check_status === 'pending_check' && row.status === 'pending') {
          await client.query('COMMIT');
          return {
            ok: true,
            refundExecutionId: row.id,
            status: 'pending_check',
            providerStatus: row.provider_status,
            reviewSignals: extractReviewSignals(row.provider_response),
            message: 'Refund requires checker approval',
          };
        }
        // Otherwise (failed/unknown/pending without check) fall through to
        // re-attempt by updating the existing row in place.
      }

      // Lock the order row.
      const orderResult = await client.query<{
        buyer_id: string;
        seller_id: string;
        status: string;
        total_gbp: string | number;
      }>(
        `SELECT buyer_id, seller_id, status, total_gbp FROM orders WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [orderId]
      );

      const order = orderResult.rows[0];
      if (!order) {
        await client.query('ROLLBACK');
        reply.code(404);
        return {
          ok: false,
          error: 'Order not found',
          code: 'ORDER_NOT_FOUND',
        };
      }

      const allowedStatuses = ['paid', 'shipped', 'delivered', 'completed', 'refunded'];
      if (!allowedStatuses.includes(order.status)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot refund order in status: ${order.status}`,
          code: 'ORDER_ACTION_NOT_ALLOWED',
        };
      }

      // Partial refunds are bounded by the remaining refundable balance:
      // the paid total minus committed refunds. Committed means every
      // execution that may still pay out — 'succeeded', plus 'pending'
      // (maker-check reservations / provider calls in flight) and 'unknown'
      // (unresolved provider outcomes) — and provider refunds recorded
      // against the order's payment intents. The execution being
      // re-attempted is excluded from its own reservation sum.
      const committedRefunds =
        (await sumRefundExecutionsGbp(
          client,
          orderId,
          REFUND_COMMITTED_EXECUTION_STATUSES,
          existing.rows[0]?.id
        )) +
        (await sumProviderRefundsGbp(client, orderId, REFUND_COMMITTED_PROVIDER_STATUSES));
      const remainingRefundable = roundTo(Number(order.total_gbp) - committedRefunds, 2);
      if (refundExceedsRemaining(amountGbp, remainingRefundable)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Refund amount ${amountGbp.toFixed(2)} exceeds the remaining refundable balance of ${remainingRefundable.toFixed(2)} GBP`,
          code: 'REFUND_EXCEEDS_REMAINING',
          remainingRefundableGbp: remainingRefundable,
        };
      }

      // Review routing: the amount threshold is one rule, not the only one.
      // Abuse signals (buyer velocity, account age, dispute history, seller
      // dispute rate) ADD to it — any fired signal routes the execution to
      // maker-check. Fail-conservative: if the signal query errors the
      // refund goes to review rather than silently auto-approving.
      let reviewSignals: RefundReviewSignal[];
      try {
        reviewSignals = await collectRefundAbuseSignals(client, {
          orderId,
          buyerId: order.buyer_id,
          sellerId: order.seller_id,
          linkedReturnCaseId: body.returnCaseId,
          excludeExecutionId: existing.rows[0]?.id,
        });
      } catch (err) {
        request.log.warn(
          { err, orderId },
          'refund abuse-signal evaluation failed — routing to manual review'
        );
        reviewSignals = [
          {
            code: 'signal_evaluation_error',
            detail: 'abuse-signal evaluation failed; routed to review conservatively',
          },
        ];
      }
      if (amountGbp > MAKER_CHECK_THRESHOLD_GBP) {
        reviewSignals.unshift({
          code: 'amount_over_threshold',
          detail: `amount £${amountGbp.toFixed(2)} exceeds the £${MAKER_CHECK_THRESHOLD_GBP} single-approval threshold`,
        });
      }
      const requiresChecker = reviewSignals.length > 0;
      // Recorded on provider_response.review so the checker and the audit
      // trail can see which rules held this refund.
      const reviewMetadata = JSON.stringify({
        review: { signals: reviewSignals, evaluatedAt: new Date().toISOString() },
      });
      const refundExecutionId =
        existing.rows[0]?.id ??
        `rex_${crypto.randomUUID().replace(/-/g, '')}`;

      // Maker-checker: amounts over the threshold or any fired abuse signal
      // require a checker.
      if (requiresChecker) {
        const makerCheckStatus: MakerCheckStatus = 'pending_check';
        if (existing.rowCount) {
          await client.query(
            `
              UPDATE refund_executions
              SET
                amount_gbp = $2,
                initiator_role = $3,
                return_case_id = COALESCE($4, return_case_id),
                maker_id = $5,
                checker_id = NULL,
                maker_check_status = $6,
                maker_check_threshold_gbp = $7,
                provider_response = COALESCE(provider_response, '{}'::jsonb) || $8::jsonb,
                status = 'pending',
                failure_reason = NULL,
                updated_at = NOW()
              WHERE id = $1
            `,
            [
              refundExecutionId,
              amountGbp,
              initiatorRole,
              body.returnCaseId ?? null,
              initiatorId,
              makerCheckStatus,
              MAKER_CHECK_THRESHOLD_GBP,
              reviewMetadata,
            ]
          );
        } else {
          await client.query(
            `
              INSERT INTO refund_executions (
                id, order_id, return_case_id, request_hash, amount_gbp,
                initiator_id, initiator_role, status,
                maker_id, maker_check_status, maker_check_threshold_gbp,
                provider_response
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11)
            `,
            [
              refundExecutionId,
              orderId,
              body.returnCaseId ?? null,
              requestHash,
              amountGbp,
              initiatorId,
              initiatorRole,
              initiatorId,
              makerCheckStatus,
              MAKER_CHECK_THRESHOLD_GBP,
              reviewMetadata,
            ]
          );
        }

        // Record the override intent in the audit chain.
        await client.query(
          `
            INSERT INTO operator_override_audit (
              entity_type, entity_id, action,
              operator_id, operator_role, reason,
              maker_id, maker_check_status,
              threshold_gbp, amount_gbp
            )
            VALUES ('order', $1, 'refund_execute', $2, $3, $4, $5, 'pending_check', $6, $7)
          `,
          [
            orderId,
            initiatorId,
            initiatorRole,
            body.reason,
            initiatorId,
            MAKER_CHECK_THRESHOLD_GBP,
            amountGbp,
          ]
        );

        await client.query('COMMIT');
        return {
          ok: true,
          refundExecutionId,
          status: 'pending_check',
          providerStatus: null,
          reviewSignals,
          message: `Refund requires checker approval (${reviewSignals
            .map((s) => s.code)
            .join(', ')})`,
        };
      }

      // Amount within single-approval threshold — execute immediately.
      let executionStatus: RefundExecutionStatus = 'succeeded';
      let provider = 'internal';
      let providerStatus: string | null = null;
      let providerRefundId: string | null = null;
      let providerResponse: Record<string, unknown> | null = null;
      let failureReason: string | null = null;

      try {
        const outcome = await executeRefundRails(client, {
          orderId,
          initiatorId,
          amountGbp,
          refundExecutionId,
          reason: body.reason,
        });
        executionStatus = outcome.executionStatus;
        provider = outcome.provider;
        providerStatus = outcome.providerStatus;
        providerRefundId = outcome.providerRefundId;
        providerResponse = outcome.providerResponse;
        failureReason = outcome.failureReason;
      } catch (err) {
        executionStatus = 'failed';
        failureReason = err instanceof Error ? err.message : 'refund execution failed';
      }

      // Flip the order to 'refunded' only once cumulative succeeded refunds
      // cover the paid total — a partial refund keeps the live status and
      // announces a distinct partial-refund card instead. The execution row
      // is not yet written, so the succeeded sum excludes it and this
      // execution's amount is added explicitly.
      let refundCardState: 'order_refunded' | 'order_partially_refunded' | null = null;
      if (executionStatus === 'succeeded') {
        const cumulativeRefunded = roundTo(
          (await sumRefundExecutionsGbp(client, orderId, ['succeeded'], refundExecutionId)) +
            (await sumProviderRefundsGbp(client, orderId, ['succeeded'])) +
            amountGbp,
          2
        );
        refundCardState = resolveRefundCardState(
          executionStatus,
          cumulativeRefunded,
          Number(order.total_gbp)
        );
        if (refundCardState === 'order_refunded') {
          await client.query(
            `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
            [orderId]
          );
        }
      }

      if (existing.rowCount) {
        await client.query(
          `
            UPDATE refund_executions
            SET
              amount_gbp = $2,
              initiator_role = $3,
              return_case_id = COALESCE($4, return_case_id),
              provider = COALESCE(provider, $5),
              provider_refund_id = COALESCE(provider_refund_id, $6),
              provider_status = $7,
              provider_response = COALESCE(provider_response, '{}'::jsonb) || COALESCE($8::jsonb, '{}'::jsonb),
              status = $9,
              failure_reason = $10,
              maker_check_status = 'single_approval',
              maker_check_threshold_gbp = $11,
              updated_at = NOW()
            WHERE id = $1
          `,
          [
            refundExecutionId,
            amountGbp,
            initiatorRole,
            body.returnCaseId ?? null,
            provider,
            providerRefundId,
            providerStatus,
            providerResponse ? JSON.stringify(providerResponse) : null,
            executionStatus,
            failureReason,
            MAKER_CHECK_THRESHOLD_GBP,
          ]
        );
      } else {
        await client.query(
          `
            INSERT INTO refund_executions (
              id, order_id, return_case_id, request_hash, amount_gbp,
              initiator_id, initiator_role,
              provider, provider_refund_id, provider_status, provider_response,
              status, failure_reason,
              maker_check_status, maker_check_threshold_gbp
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'single_approval', $14)
          `,
          [
            refundExecutionId,
            orderId,
            body.returnCaseId ?? null,
            requestHash,
            amountGbp,
            initiatorId,
            initiatorRole,
            provider,
            providerRefundId,
            providerStatus,
            providerResponse ? JSON.stringify(providerResponse) : null,
            executionStatus,
            failureReason,
            MAKER_CHECK_THRESHOLD_GBP,
          ]
        );
      }

      // Record the override in the audit chain.
      await client.query(
        `
          INSERT INTO operator_override_audit (
            entity_type, entity_id, action,
            operator_id, operator_role, reason,
            maker_id, maker_check_status,
            threshold_gbp, amount_gbp,
            outcome
          )
          VALUES ('order', $1, 'refund_execute', $2, $3, $4, $5, 'single_approval', $6, $7, $8)
        `,
        [
          orderId,
          initiatorId,
          initiatorRole,
          body.reason,
          initiatorId,
          MAKER_CHECK_THRESHOLD_GBP,
          amountGbp,
          executionStatus,
        ]
      );

      // If this execution is linked to a return case, a genuine success
      // advances the case to refund_confirmed — the only path that may reach
      // that status. confirmReturnCaseRefund no-ops unless the case is
      // remedy_accepted.
      if (executionStatus === 'succeeded') {
        const linkedCase = await client.query<{ return_case_id: string | null }>(
          `SELECT return_case_id FROM refund_executions WHERE id = $1`,
          [refundExecutionId]
        );
        const linkedReturnCaseId = linkedCase.rows[0]?.return_case_id;
        if (linkedReturnCaseId) {
          await confirmReturnCaseRefund(client, linkedReturnCaseId, initiatorId, {
            refundExecutionId,
            amountGbp,
          });
        }
      }

      await client.query('COMMIT');
      if (refundCardState) {
        // In-thread commerce card: refund executed (full or partial).
        await emitOrderCommerceCard({
          orderId,
          stateType: refundCardState,
          refundedAmountGbp: amountGbp,
          // Partial refunds can recur on one order — dedupe per execution.
          eventKey: refundCardState === 'order_partially_refunded' ? refundExecutionId : undefined,
          log: request.log,
        });
      }
      return {
        ok: true,
        refundExecutionId,
        status: executionStatus,
        providerStatus,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── POST /refund-executions/:refundExecutionId/check ──────────────────────
  // Checker approves or rejects a pending maker-check refund.
  app.post('/refund-executions/:refundExecutionId/check', async (request, reply) => {
    const paramsSchema = z.object({
      refundExecutionId: z.string().min(4).max(64),
    });
    const bodySchema = z.object({
      approved: z.boolean(),
      reason: z.string().min(1).max(2000),
    });

    const { refundExecutionId } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body ?? {});

    const checkerId = resolveAuthenticatedUserId(request);
    if (!checkerId) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      };
    }

    const authUser = resolveAuthUser(request);
    const checkerRole = authUser?.role ?? 'user';
    if (!isOperatorOrAdmin(checkerRole)) {
      reply.code(403);
      return {
        ok: false,
        error: 'Checker approval requires operator or admin authority',
        code: 'CHECKER_REQUIRES_OPERATOR',
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const executionResult = await client.query<{
        id: string;
        order_id: string;
        return_case_id: string | null;
        amount_gbp: string | number;
        initiator_id: string;
        maker_id: string | null;
        maker_check_status: MakerCheckStatus;
        status: RefundExecutionStatus;
      }>(
        `
          SELECT id, order_id, return_case_id, amount_gbp, initiator_id, maker_id,
                 maker_check_status, status
          FROM refund_executions
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [refundExecutionId]
      );

      const execution = executionResult.rows[0];
      if (!execution) {
        await client.query('ROLLBACK');
        reply.code(404);
        return {
          ok: false,
          error: 'Refund execution not found',
          code: 'REFUND_EXECUTION_NOT_FOUND',
        };
      }

      if (execution.maker_check_status !== 'pending_check') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Refund execution is not pending checker approval (current: ${execution.maker_check_status})`,
          code: 'NOT_PENDING_CHECK',
        };
      }

      // A checker must not be the same person as the maker.
      if (execution.maker_id && execution.maker_id === checkerId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return {
          ok: false,
          error: 'Checker cannot be the same person as the maker',
          code: 'MAKER_CHECKER_SAME_PERSON',
        };
      }

      if (!body.approved) {
        // Rejected — mark failed and record the audit outcome.
        await client.query(
          `
            UPDATE refund_executions
            SET
              maker_check_status = 'rejected',
              checker_id = $2,
              status = 'failed',
              failure_reason = $3,
              updated_at = NOW()
            WHERE id = $1
          `,
          [refundExecutionId, checkerId, body.reason]
        );

        await client.query(
          `
            INSERT INTO operator_override_audit (
              entity_type, entity_id, action,
              operator_id, operator_role, reason,
              maker_id, checker_id, maker_check_status,
              outcome
            )
            VALUES ('refund_execution', $1, 'refund_check', $2, $3, $4, $5, $6, 'rejected', 'rejected')
          `,
          [
            refundExecutionId,
            checkerId,
            checkerRole,
            body.reason,
            execution.maker_id,
            checkerId,
          ]
        );

        await client.query('COMMIT');
        return {
          ok: true,
          refundExecutionId,
          status: 'failed',
          makerCheckStatus: 'rejected',
        };
      }

      // Approved — lock the order and re-run the remaining-refundable check
      // before executing. Maker-check reservations are asynchronous: other
      // refunds may have been created, approved or paid out since this one
      // was made. Pending/unknown executions count conservatively — each is
      // money that may still leave the platform.
      const amountGbp = roundTo(Number(execution.amount_gbp), 2);

      const orderResult = await client.query<{
        status: string;
        total_gbp: string | number;
      }>(
        `SELECT status, total_gbp FROM orders WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [execution.order_id]
      );
      const order = orderResult.rows[0];
      if (!order) {
        await client.query('ROLLBACK');
        reply.code(404);
        return {
          ok: false,
          error: 'Order not found',
          code: 'ORDER_NOT_FOUND',
        };
      }

      const allowedStatuses = ['paid', 'shipped', 'delivered', 'completed', 'refunded'];
      if (!allowedStatuses.includes(order.status)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot refund order in status: ${order.status}`,
          code: 'ORDER_ACTION_NOT_ALLOWED',
        };
      }

      const committedRefunds =
        (await sumRefundExecutionsGbp(
          client,
          execution.order_id,
          REFUND_COMMITTED_EXECUTION_STATUSES,
          refundExecutionId
        )) +
        (await sumProviderRefundsGbp(client, execution.order_id, REFUND_COMMITTED_PROVIDER_STATUSES));
      const remainingRefundable = roundTo(Number(order.total_gbp) - committedRefunds, 2);
      if (refundExceedsRemaining(amountGbp, remainingRefundable)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Refund amount ${amountGbp.toFixed(2)} exceeds the remaining refundable balance of ${remainingRefundable.toFixed(2)} GBP`,
          code: 'REFUND_EXCEEDS_REMAINING',
          remainingRefundableGbp: remainingRefundable,
        };
      }

      // Execute through the PSP when a provider intent funded the order;
      // internal balance credit only for wallet-funded orders.
      let executionStatus: RefundExecutionStatus = 'succeeded';
      let provider = 'internal';
      let providerStatus: string | null = null;
      let providerRefundId: string | null = null;
      let providerResponse: Record<string, unknown> | null = null;
      let failureReason: string | null = null;

      try {
        const outcome = await executeRefundRails(client, {
          orderId: execution.order_id,
          initiatorId: execution.initiator_id,
          amountGbp,
          refundExecutionId,
          reason: body.reason,
          approvedBy: checkerId,
        });
        executionStatus = outcome.executionStatus;
        provider = outcome.provider;
        providerStatus = outcome.providerStatus;
        providerRefundId = outcome.providerRefundId;
        providerResponse = outcome.providerResponse;
        failureReason = outcome.failureReason;
      } catch (err) {
        executionStatus = 'failed';
        failureReason = err instanceof Error ? err.message : 'refund execution failed';
      }

      // provider_response merges rather than overwrites: the review block
      // recorded at routing time must survive into the executed row.
      await client.query(
        `
          UPDATE refund_executions
          SET
            maker_check_status = 'checked',
            checker_id = $2,
            provider = COALESCE(provider, $3),
            provider_refund_id = COALESCE(provider_refund_id, $4),
            provider_status = $5,
            provider_response = COALESCE(provider_response, '{}'::jsonb) || COALESCE($6::jsonb, '{}'::jsonb),
            status = $7,
            failure_reason = $8,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          refundExecutionId,
          checkerId,
          provider,
          providerRefundId,
          providerStatus,
          providerResponse ? JSON.stringify(providerResponse) : null,
          executionStatus,
          failureReason,
        ]
      );

      await client.query(
        `
          INSERT INTO operator_override_audit (
            entity_type, entity_id, action,
            operator_id, operator_role, reason,
            maker_id, checker_id, maker_check_status,
            amount_gbp, outcome
          )
          VALUES ('refund_execution', $1, 'refund_check', $2, $3, $4, $5, $6, 'checked', $7, $8)
        `,
        [
          refundExecutionId,
          checkerId,
          checkerRole,
          body.reason,
          execution.maker_id,
          checkerId,
          amountGbp,
          executionStatus,
        ]
      );

      // Flip to 'refunded' only when cumulative succeeded refunds cover the
      // order total — a partial approval leaves the order live.
      let refundCardState: 'order_refunded' | 'order_partially_refunded' | null = null;
      if (executionStatus === 'succeeded') {
        const cumulativeRefunded = await sumSucceededRefundsGbp(client, execution.order_id);
        refundCardState = resolveRefundCardState(
          executionStatus,
          cumulativeRefunded,
          Number(order.total_gbp)
        );
        if (refundCardState === 'order_refunded') {
          await client.query(
            `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
            [execution.order_id]
          );
        }
      }

      // A checker-approved refund linked to a return case advances the case
      // to refund_confirmed — only from remedy_accepted.
      if (executionStatus === 'succeeded' && execution.return_case_id) {
        await confirmReturnCaseRefund(client, execution.return_case_id, checkerId, {
          refundExecutionId,
          amountGbp,
        });
      }

      await client.query('COMMIT');
      if (refundCardState) {
        // In-thread commerce card: maker-check refund executed.
        await emitOrderCommerceCard({
          orderId: execution.order_id,
          stateType: refundCardState,
          refundedAmountGbp: amountGbp,
          eventKey: refundCardState === 'order_partially_refunded' ? refundExecutionId : undefined,
          log: request.log,
        });
      }
      return {
        ok: true,
        refundExecutionId,
        status: executionStatus,
        makerCheckStatus: 'checked',
        providerStatus,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── GET /orders/:orderId/refund-executions ────────────────────────────────
  // Lists all refund executions for an order.
  app.get('/orders/:orderId/refund-executions', async (request, reply) => {
    const paramsSchema = z.object({
      orderId: z.string().min(4).max(64),
    });
    const { orderId } = paramsSchema.parse(request.params);

    const userId = resolveAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      };
    }

    const authUser = resolveAuthUser(request);
    const role = authUser?.role ?? 'user';
    if (!isOperatorOrAdmin(role)) {
      reply.code(403);
      return {
        ok: false,
        error: 'Refund execution history requires operator or admin authority',
        code: 'REFUND_HISTORY_REQUIRES_OPERATOR',
      };
    }

    const result = await db.query<{
      id: string;
      order_id: string;
      return_case_id: string | null;
      amount_gbp: string | number;
      initiator_id: string;
      initiator_role: string;
      provider: string | null;
      provider_refund_id: string | null;
      provider_status: string | null;
      provider_response: Record<string, unknown> | null;
      status: RefundExecutionStatus;
      failure_reason: string | null;
      maker_id: string | null;
      checker_id: string | null;
      maker_check_status: MakerCheckStatus;
      maker_check_threshold_gbp: string | number;
      reconciled_at: string | null;
      reconciliation_notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT
          id, order_id, return_case_id, amount_gbp,
          initiator_id, initiator_role,
          provider, provider_refund_id, provider_status, provider_response,
          status, failure_reason,
          maker_id, checker_id, maker_check_status, maker_check_threshold_gbp,
          reconciled_at, reconciliation_notes,
          created_at::text, updated_at::text
        FROM refund_executions
        WHERE order_id = $1
        ORDER BY created_at DESC
      `,
      [orderId]
    );

    return {
      ok: true,
      orderId,
      refundExecutions: result.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        returnCaseId: row.return_case_id,
        amountGbp: Number(row.amount_gbp),
        initiatorId: row.initiator_id,
        initiatorRole: row.initiator_role,
        provider: row.provider,
        providerRefundId: row.provider_refund_id,
        providerStatus: row.provider_status,
        reviewSignals: extractReviewSignals(row.provider_response),
        status: row.status,
        failureReason: row.failure_reason,
        makerId: row.maker_id,
        checkerId: row.checker_id,
        makerCheckStatus: row.maker_check_status,
        makerCheckThresholdGbp: Number(row.maker_check_threshold_gbp),
        reconciledAt: row.reconciled_at,
        reconciliationNotes: row.reconciliation_notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  });

  // ── POST /refund-executions/:refundExecutionId/reconcile ──────────────────
  // Operator reconciles a refund with 'unknown' status.
  app.post('/refund-executions/:refundExecutionId/reconcile', async (request, reply) => {
    const paramsSchema = z.object({
      refundExecutionId: z.string().min(4).max(64),
    });
    const bodySchema = z.object({
      providerStatus: z.enum(['succeeded', 'failed', 'unknown']),
      notes: z.string().min(1).max(2000),
    });

    const { refundExecutionId } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body ?? {});

    const operatorId = resolveAuthenticatedUserId(request);
    if (!operatorId) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      };
    }

    const authUser = resolveAuthUser(request);
    const operatorRole = authUser?.role ?? 'user';
    if (!isOperatorOrAdmin(operatorRole)) {
      reply.code(403);
      return {
        ok: false,
        error: 'Reconciliation requires operator or admin authority',
        code: 'RECONCILE_REQUIRES_OPERATOR',
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const executionResult = await client.query<{
        id: string;
        order_id: string;
        return_case_id: string | null;
        status: RefundExecutionStatus;
        amount_gbp: string | number;
        initiator_id: string;
        provider: string | null;
        provider_refund_id: string | null;
      }>(
        `
          SELECT id, order_id, return_case_id, status, amount_gbp,
                 initiator_id, provider, provider_refund_id
          FROM refund_executions
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [refundExecutionId]
      );

      const execution = executionResult.rows[0];
      if (!execution) {
        await client.query('ROLLBACK');
        reply.code(404);
        return {
          ok: false,
          error: 'Refund execution not found',
          code: 'REFUND_EXECUTION_NOT_FOUND',
        };
      }

      if (execution.status !== 'unknown') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Only refund executions with 'unknown' status can be reconciled (current: ${execution.status})`,
          code: 'NOT_UNKNOWN',
        };
      }

      const nextStatus: RefundExecutionStatus =
        body.providerStatus === 'succeeded'
          ? 'succeeded'
          : body.providerStatus === 'failed'
            ? 'failed'
            : 'unknown';

      await client.query(
        `
          UPDATE refund_executions
          SET
            provider_status = $2,
            status = $3,
            reconciled_at = NOW(),
            reconciliation_notes = $4,
            updated_at = NOW()
          WHERE id = $1
        `,
        [refundExecutionId, body.providerStatus, nextStatus, body.notes]
      );

      // Keep the provider-refund ledger truthful: payment_refunds rows
      // written by executeRefundRails for this execution take the reconciled
      // outcome ('pending'/'unknown' → confirmed status).
      await client.query(
        `UPDATE payment_refunds pr
         SET status = $2, updated_at = NOW()
         FROM payment_intents pi
         WHERE pi.id = pr.intent_id
           AND pi.order_id = $3
           AND pr.metadata->>'refundExecutionId' = $1
           AND pr.status IN ('pending', 'unknown')`,
        [refundExecutionId, body.providerStatus, execution.order_id]
      );

      // If reconciliation confirms success, flip the order to 'refunded'
      // only when cumulative succeeded refunds cover the paid total — the
      // execution row above is already 'succeeded' so the sum includes it.
      // A linked return case still advances to refund_confirmed on success.
      let refundCardState: 'order_refunded' | 'order_partially_refunded' | null = null;
      if (nextStatus === 'succeeded') {
        // executeRefundRails defers the escrow reversal until the provider
        // confirms — for a PSP-backed execution this reconciliation IS the
        // confirmation, so post the deferred reversal now. Internal credits
        // already posted theirs at execution time.
        if (execution.provider && execution.provider !== 'internal') {
          // Post under the canonical provider ref recorded on the linked
          // payment_refunds row — the webhook path keys its reversal on the
          // provider's own refund ref, so reusing it keeps the ledger
          // idempotent when both paths confirm the same refund.
          const linkedRefund = await client.query<{ provider_refund_ref: string | null }>(
            `SELECT pr.provider_refund_ref
             FROM payment_refunds pr
             JOIN payment_intents pi ON pi.id = pr.intent_id
             WHERE pi.order_id = $2
               AND pr.metadata->>'refundExecutionId' = $1
             ORDER BY pr.updated_at DESC
             LIMIT 1`,
            [refundExecutionId, execution.order_id]
          );
          const reversalRef =
            linkedRefund.rows[0]?.provider_refund_ref ??
            execution.provider_refund_id ??
            `reconcile_${refundExecutionId}`;
          await postCommerceOrderRefundLedgerReversal(
            client,
            execution.order_id,
            execution.initiator_id,
            Number(execution.amount_gbp),
            reversalRef
          );
        }
        const orderTotalResult = await client.query<{ total_gbp: string | number }>(
          `SELECT total_gbp FROM orders WHERE id = $1 LIMIT 1 FOR UPDATE`,
          [execution.order_id]
        );
        const orderTotalGbp = Number(orderTotalResult.rows[0]?.total_gbp ?? 0);
        const cumulativeRefunded = await sumSucceededRefundsGbp(client, execution.order_id);
        refundCardState = resolveRefundCardState(nextStatus, cumulativeRefunded, orderTotalGbp);
        if (refundCardState === 'order_refunded') {
          await client.query(
            `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
            [execution.order_id]
          );
        }
        if (execution.return_case_id) {
          await confirmReturnCaseRefund(client, execution.return_case_id, operatorId, {
            refundExecutionId,
            amountGbp: Number(execution.amount_gbp),
          });
        }
      }

      await client.query(
        `
          INSERT INTO operator_override_audit (
            entity_type, entity_id, action,
            operator_id, operator_role, reason,
            maker_check_status, amount_gbp, outcome
          )
          VALUES ('refund_execution', $1, 'refund_reconcile', $2, $3, $4, 'single_approval', $5, $6)
        `,
        [
          refundExecutionId,
          operatorId,
          operatorRole,
          body.notes,
          Number(execution.amount_gbp),
          nextStatus,
        ]
      );

      await client.query('COMMIT');
      if (nextStatus === 'succeeded') {
        // In-thread commerce card: reconciliation resolved the refund.
        if (refundCardState) {
          await emitOrderCommerceCard({
            orderId: execution.order_id,
            stateType: refundCardState,
            refundedAmountGbp: Number(execution.amount_gbp),
            eventKey: refundCardState === 'order_partially_refunded' ? refundExecutionId : undefined,
            log: request.log,
          });
        }
      }
      return {
        ok: true,
        refundExecutionId,
        status: nextStatus,
        providerStatus: body.providerStatus,
        reconciledAt: new Date().toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
