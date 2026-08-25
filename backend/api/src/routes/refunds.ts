import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

interface RefundRouteDependencies {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string | null;
  postCommerceOrderRefundLedgerReversal: (
    client: PoolClient,
    orderId: string,
    initiatorId: string,
    amountGbp: number
  ) => Promise<void>;
}

const MAKER_CHECK_THRESHOLD_GBP = 100;

type RefundExecutionStatus = 'pending' | 'succeeded' | 'failed' | 'unknown';
type MakerCheckStatus = 'single_approval' | 'pending_check' | 'checked' | 'rejected';

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
}: RefundRouteDependencies) {
  // ── POST /orders/:orderId/refund-execute ──────────────────────────────────
  // Operator/admin executes a refund. Idempotent by request_hash. Maker-checker
  // applies for amounts over the threshold (default £100).
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
      }>(
        `
          SELECT id, status, maker_check_status, provider_status
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
        // If pending checker approval, surface that state.
        if (row.maker_check_status === 'pending_check' && row.status === 'pending') {
          await client.query('COMMIT');
          return {
            ok: true,
            refundExecutionId: row.id,
            status: 'pending_check',
            providerStatus: row.provider_status,
            message: 'Refund requires checker approval for amounts over £100',
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

      const requiresChecker = amountGbp > MAKER_CHECK_THRESHOLD_GBP;
      const refundExecutionId =
        existing.rows[0]?.id ??
        `rex_${crypto.randomUUID().replace(/-/g, '')}`;

      // Maker-checker: amounts over the threshold require a checker.
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
            ]
          );
        } else {
          await client.query(
            `
              INSERT INTO refund_executions (
                id, order_id, return_case_id, request_hash, amount_gbp,
                initiator_id, initiator_role, status,
                maker_id, maker_check_status, maker_check_threshold_gbp
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
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
          message: 'Refund requires checker approval for amounts over £100',
        };
      }

      // Amount within single-approval threshold — execute immediately.
      let executionStatus: RefundExecutionStatus = 'succeeded';
      let providerStatus: string | null = null;
      let providerRefundId: string | null = null;
      let providerResponse: Record<string, unknown> | null = null;
      let failureReason: string | null = null;

      try {
        await postCommerceOrderRefundLedgerReversal(
          client,
          orderId,
          initiatorId,
          amountGbp
        );
        // Ledger reversal succeeded. In a real provider integration we would
        // call the PSP here; since we have no live provider wired in this gate,
        // we record a synthetic succeeded provider status. If a provider call
        // were to time out or return an ambiguous result, we would set
        // executionStatus = 'unknown' and enqueue an exception-queue entry.
        providerStatus = 'succeeded';
        providerRefundId = `internal_${refundExecutionId}`;
        providerResponse = { source: 'ledger_reversal', amountGbp };
      } catch (err) {
        executionStatus = 'failed';
        failureReason = err instanceof Error ? err.message : 'ledger reversal failed';
      }

      // Mark the order as refunded once the reversal is confirmed.
      if (executionStatus === 'succeeded') {
        await client.query(
          `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [orderId]
        );
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
              provider_response = $8,
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
            'internal',
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
            'internal',
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

      await client.query('COMMIT');
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
        amount_gbp: string | number;
        initiator_id: string;
        maker_id: string | null;
        maker_check_status: MakerCheckStatus;
        status: RefundExecutionStatus;
      }>(
        `
          SELECT id, order_id, amount_gbp, initiator_id, maker_id,
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

      // Approved — execute the refund now.
      const amountGbp = roundTo(Number(execution.amount_gbp), 2);
      let executionStatus: RefundExecutionStatus = 'succeeded';
      let providerStatus: string | null = null;
      let providerRefundId: string | null = null;
      let providerResponse: Record<string, unknown> | null = null;
      let failureReason: string | null = null;

      try {
        await postCommerceOrderRefundLedgerReversal(
          client,
          execution.order_id,
          execution.initiator_id,
          amountGbp
        );
        providerStatus = 'succeeded';
        providerRefundId = `internal_${refundExecutionId}`;
        providerResponse = { source: 'ledger_reversal', amountGbp, approvedBy: checkerId };
      } catch (err) {
        executionStatus = 'failed';
        failureReason = err instanceof Error ? err.message : 'ledger reversal failed';
      }

      if (executionStatus === 'succeeded') {
        await client.query(
          `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [execution.order_id]
        );
      }

      await client.query(
        `
          UPDATE refund_executions
          SET
            maker_check_status = 'checked',
            checker_id = $2,
            provider = COALESCE(provider, $3),
            provider_refund_id = COALESCE(provider_refund_id, $4),
            provider_status = $5,
            provider_response = $6,
            status = $7,
            failure_reason = $8,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          refundExecutionId,
          checkerId,
          'internal',
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

      await client.query('COMMIT');
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
          provider, provider_refund_id, provider_status,
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
        status: RefundExecutionStatus;
        amount_gbp: string | number;
      }>(
        `
          SELECT id, order_id, status, amount_gbp
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

      // If reconciliation confirms success, mark the order as refunded.
      if (nextStatus === 'succeeded') {
        await client.query(
          `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [execution.order_id]
        );
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
