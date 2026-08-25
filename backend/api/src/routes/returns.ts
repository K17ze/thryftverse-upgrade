import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { AuthenticatedUser } from '../lib/auth.js';

// ── Local types ──

type ReturnBasis = 'statutory' | 'protection' | 'voluntary';

type ReturnCaseStatus =
  | 'requested'
  | 'evidence_review'
  | 'approved'
  | 'rejected'
  | 'reverse_shipped'
  | 'received'
  | 'inspected'
  | 'remedy_proposed'
  | 'remedy_accepted'
  | 'refund_confirmed'
  | 'appealed'
  | 'closed';

type ReturnRemedy = 'full_refund' | 'partial_refund' | 'replacement' | 'repair' | 'reject';

interface ReturnCaseRow {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  basis: ReturnBasis;
  status: ReturnCaseStatus;
  reason: string;
  description: string | null;
  evidence_media_urls: string[];
  return_window_deadline: string | null;
  return_carrier: string | null;
  return_tracking_number: string | null;
  return_label_url: string | null;
  inspection_notes: string | null;
  inspection_condition: string | null;
  proposed_remedy: ReturnRemedy | null;
  remedy_amount_gbp: number | string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  appeal_reason: string | null;
  appealed_at: string | null;
  operator_id: string | null;
  operator_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface ReturnCaseEventRow {
  id: string;
  return_case_id: string;
  from_status: ReturnCaseStatus | null;
  to_status: ReturnCaseStatus;
  actor_id: string;
  actor_role: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── State machine ──

const VALID_TRANSITIONS: Record<ReturnCaseStatus, ReturnCaseStatus[]> = {
  requested: ['evidence_review', 'approved', 'rejected'],
  evidence_review: ['approved', 'rejected'],
  approved: ['reverse_shipped'],
  rejected: ['appealed'],
  reverse_shipped: ['received'],
  received: ['inspected'],
  inspected: ['remedy_proposed'],
  remedy_proposed: ['remedy_accepted', 'appealed'],
  remedy_accepted: ['refund_confirmed', 'closed'],
  appealed: ['remedy_proposed', 'closed'],
  refund_confirmed: ['closed'],
  closed: [],
};

export function validateTransition(from: ReturnCaseStatus, to: ReturnCaseStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

// ── Dependency injection ──

interface ReturnRouteDependencies {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string | null;
  ensureUserExists: (client: PoolClient, userId: string) => Promise<void>;
}

// ── Helpers ──

function authUserOf(request: FastifyRequest): AuthenticatedUser | undefined {
  return (request as FastifyRequest & { authUser?: AuthenticatedUser }).authUser;
}

function operatorRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'moderator';
}

function serializeReturnCase(row: ReturnCaseRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    basis: row.basis,
    status: row.status,
    reason: row.reason,
    description: row.description,
    evidenceMediaUrls: row.evidence_media_urls,
    returnWindowDeadline: row.return_window_deadline,
    returnCarrier: row.return_carrier,
    returnTrackingNumber: row.return_tracking_number,
    returnLabelUrl: row.return_label_url,
    inspectionNotes: row.inspection_notes,
    inspectionCondition: row.inspection_condition,
    proposedRemedy: row.proposed_remedy,
    remedyAmountGbp: row.remedy_amount_gbp === null ? null : Number(row.remedy_amount_gbp),
    resolutionNotes: row.resolution_notes,
    resolvedAt: row.resolved_at,
    appealReason: row.appeal_reason,
    appealedAt: row.appealed_at,
    operatorId: row.operator_id,
    operatorReason: row.operator_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeEvent(row: ReturnCaseEventRow) {
  return {
    id: row.id,
    returnCaseId: row.return_case_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

async function recordTransition(
  client: PoolClient,
  returnCaseId: string,
  fromStatus: ReturnCaseStatus | null,
  toStatus: ReturnCaseStatus,
  actorId: string,
  actorRole: string,
  reason?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO return_case_events
       (id, return_case_id, from_status, to_status, actor_id, actor_role, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      `rce_${crypto.randomUUID()}`,
      returnCaseId,
      fromStatus,
      toStatus,
      actorId,
      actorRole,
      reason ?? null,
      JSON.stringify(metadata ?? {}),
    ],
  );
}

async function fetchEvents(client: PoolClient, returnCaseId: string): Promise<ReturnCaseEventRow[]> {
  const eventsResult = await client.query<ReturnCaseEventRow>(
    `SELECT id, return_case_id, from_status, to_status, actor_id, actor_role,
            reason, metadata, created_at::text
     FROM return_case_events
     WHERE return_case_id = $1
     ORDER BY created_at ASC`,
    [returnCaseId],
  );
  return eventsResult.rows;
}

// ── Route registration ──

export function registerReturnRoutes({
  app,
  db,
  resolveAuthenticatedUserId,
  ensureUserExists,
}: ReturnRouteDependencies) {
  // POST /orders/:orderId/return-request
  // Buyer initiates a return. Creates a return_case with status='requested'.
  app.post('/orders/:orderId/return-request', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ orderId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      reason: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      evidenceMediaUrls: z.array(z.string().url()).max(20).default([]),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await ensureUserExists(client, authUserId);

      // Lock the order row and fetch details needed for basis determination.
      const orderResult = await client.query<{
        buyer_id: string;
        seller_id: string;
        buyer_protection_fee_gbp: number | string;
        status: string;
        delivered_at: string | null;
        created_at: string;
      }>(
        `SELECT buyer_id, seller_id, buyer_protection_fee_gbp, status,
                delivered_at::text, created_at::text
         FROM orders
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [orderId],
      );

      if (!orderResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Order not found' };
      }

      const order = orderResult.rows[0];

      if (order.buyer_id !== authUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the buyer can initiate a return' };
      }

      // Prevent duplicate active return cases for the same order.
      const existingResult = await client.query<{ id: string; status: ReturnCaseStatus }>(
        `SELECT id, status
         FROM return_cases
         WHERE order_id = $1 AND status <> 'closed'
         LIMIT 1`,
        [orderId],
      );

      if (existingResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'An active return case already exists for this order',
          returnCaseId: existingResult.rows[0].id,
          status: existingResult.rows[0].status,
        };
      }

      // Determine return basis (Gate 8):
      //   protection — buyer protection fee paid
      //   statutory  — default (CMA / DMCC statutory rights)
      //   voluntary  — seller's voluntary return policy (goodwill)
      // The order_seller_rights_snapshot table may not exist yet in all
      // environments, so we derive basis defensively from the order row.
      let basis: ReturnBasis = 'statutory';
      const protectionFee = Number(order.buyer_protection_fee_gbp ?? 0);
      if (protectionFee > 0) {
        basis = 'protection';
      }

      // Derive the return window deadline. Statutory default is 14 days from
      // delivery (CRA 2015 short-term rejection right). If the order has not
      // been delivered yet, the window opens from now.
      const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : new Date();
      const returnWindowDeadline = new Date(deliveredAt.getTime() + 14 * 24 * 60 * 60 * 1000);

      const returnCaseId = `rc_${crypto.randomUUID()}`;

      await client.query(
        `INSERT INTO return_cases
           (id, order_id, buyer_id, seller_id, basis, status,
            reason, description, evidence_media_urls, return_window_deadline)
         VALUES ($1, $2, $3, $4, $5, 'requested',
                 $6, $7, $8, $9)`,
        [
          returnCaseId,
          orderId,
          order.buyer_id,
          order.seller_id,
          basis,
          payload.reason,
          payload.description ?? null,
          payload.evidenceMediaUrls,
          returnWindowDeadline,
        ],
      );

      await recordTransition(
        client,
        returnCaseId,
        null,
        'requested',
        authUserId,
        'buyer',
        'Return request submitted',
        { reason: payload.reason, basis },
      );

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: 'requested' as ReturnCaseStatus,
        basis,
        returnWindowDeadline: returnWindowDeadline.toISOString(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // GET /orders/:orderId/return-case
  // Fetches the active return case for an order (if any).
  app.get('/orders/:orderId/return-case', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ orderId: z.string().min(4).max(64) });
    const { orderId } = paramsSchema.parse(request.params);

    const client = await db.connect();
    try {
      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                reason, description, evidence_media_urls,
                return_window_deadline::text, return_carrier, return_tracking_number,
                return_label_url, inspection_notes, inspection_condition,
                proposed_remedy, remedy_amount_gbp,
                resolution_notes, resolved_at::text,
                appeal_reason, appealed_at::text,
                operator_id, operator_reason,
                created_at::text, updated_at::text
         FROM return_cases
         WHERE order_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [orderId],
      );

      if (!result.rowCount) {
        reply.code(404);
        return { ok: false, error: 'No return case found for this order' };
      }

      const returnCase = result.rows[0];

      // Authorization: buyer or seller of the order, or operator.
      const auth = authUserOf(request);
      const isParticipant =
        returnCase.buyer_id === authUserId || returnCase.seller_id === authUserId;
      const isOperator = operatorRole(auth?.role);
      if (!isParticipant && !isOperator) {
        reply.code(403);
        return { ok: false, error: 'Forbidden' };
      }

      const events = await fetchEvents(client, returnCase.id);

      return {
        ok: true,
        returnCase: serializeReturnCase(returnCase),
        events: events.map(serializeEvent),
      };
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/evidence
  // Buyer uploads additional evidence (photos).
  app.post('/return-cases/:returnCaseId/evidence', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      evidenceMediaUrls: z.array(z.string().url()).min(1).max(20),
    });

    const { returnCaseId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      if (returnCase.buyer_id !== authUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the buyer can upload evidence' };
      }

      // Evidence can only be added while in requested or evidence_review.
      if (
        returnCase.status !== 'requested' &&
        returnCase.status !== 'evidence_review'
      ) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot add evidence from status '${returnCase.status}'`,
        };
      }

      const previousStatus = returnCase.status;
      const newUrls = [...returnCase.evidence_media_urls, ...payload.evidenceMediaUrls];

      // If currently 'requested', move to 'evidence_review' to signal review.
      const nextStatus: ReturnCaseStatus =
        previousStatus === 'requested' ? 'evidence_review' : 'evidence_review';

      await client.query(
        `UPDATE return_cases
         SET evidence_media_urls = $2,
             status = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [returnCaseId, newUrls, nextStatus],
      );

      if (previousStatus !== nextStatus) {
        await recordTransition(
          client,
          returnCaseId,
          previousStatus,
          nextStatus,
          authUserId,
          'buyer',
          'Additional evidence uploaded',
          { addedCount: payload.evidenceMediaUrls.length },
        );
      }

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: nextStatus,
        evidenceMediaUrls: newUrls,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/decision
  // Seller or operator approves/rejects the return.
  app.post('/return-cases/:returnCaseId/decision', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      decision: z.enum(['approved', 'rejected']),
      reason: z.string().min(1).max(1000),
    });

    const { returnCaseId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const auth = authUserOf(request);
    const isOperator = operatorRole(auth?.role);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      // Authorization: seller of the order, or operator.
      if (returnCase.seller_id !== authUserId && !isOperator) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the seller or an operator can make a decision' };
      }

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus =
        payload.decision === 'approved' ? 'approved' : 'rejected';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      const actorRole = isOperator ? 'operator' : 'seller';

      await client.query(
        `UPDATE return_cases
         SET status = $2,
             resolution_notes = COALESCE(resolution_notes, $3),
             updated_at = NOW()
         WHERE id = $1`,
        [returnCaseId, targetStatus, payload.reason],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        actorRole,
        payload.reason,
        { decision: payload.decision },
      );

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: targetStatus,
        decision: payload.decision,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/reverse-shipment
  // Seller or platform provides return tracking details.
  app.post('/return-cases/:returnCaseId/reverse-shipment', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      carrier: z.string().min(1).max(100),
      trackingNumber: z.string().min(1).max(200),
      labelUrl: z.string().url().optional(),
    });

    const { returnCaseId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const auth = authUserOf(request);
    const isOperator = operatorRole(auth?.role);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      if (returnCase.seller_id !== authUserId && !isOperator) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the seller or an operator can provide reverse shipment details' };
      }

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus = 'reverse_shipped';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      const actorRole = isOperator ? 'operator' : 'seller';

      await client.query(
        `UPDATE return_cases
         SET status = $2,
             return_carrier = $3,
             return_tracking_number = $4,
             return_label_url = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [
          returnCaseId,
          targetStatus,
          payload.carrier,
          payload.trackingNumber,
          payload.labelUrl ?? null,
        ],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        actorRole,
        'Reverse shipment dispatched',
        { carrier: payload.carrier, trackingNumber: payload.trackingNumber },
      );

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: targetStatus,
        returnCarrier: payload.carrier,
        returnTrackingNumber: payload.trackingNumber,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/receipt
  // Seller confirms receipt of returned item.
  app.post('/return-cases/:returnCaseId/receipt', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const { returnCaseId } = paramsSchema.parse(request.params);

    const auth = authUserOf(request);
    const isOperator = operatorRole(auth?.role);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      if (returnCase.seller_id !== authUserId && !isOperator) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the seller or an operator can confirm receipt' };
      }

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus = 'received';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      const actorRole = isOperator ? 'operator' : 'seller';

      await client.query(
        `UPDATE return_cases
         SET status = $2, updated_at = NOW()
         WHERE id = $1`,
        [returnCaseId, targetStatus],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        actorRole,
        'Returned item received',
      );

      await client.query('COMMIT');

      return { ok: true, returnCaseId, status: targetStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/inspection
  // Seller records inspection results.
  app.post('/return-cases/:returnCaseId/inspection', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      notes: z.string().min(1).max(2000),
      condition: z.string().min(1).max(100),
    });

    const { returnCaseId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const auth = authUserOf(request);
    const isOperator = operatorRole(auth?.role);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      if (returnCase.seller_id !== authUserId && !isOperator) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the seller or an operator can record inspection results' };
      }

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus = 'inspected';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      const actorRole = isOperator ? 'operator' : 'seller';

      await client.query(
        `UPDATE return_cases
         SET status = $2,
             inspection_notes = $3,
             inspection_condition = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [returnCaseId, targetStatus, payload.notes, payload.condition],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        actorRole,
        'Item inspected',
        { condition: payload.condition },
      );

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: targetStatus,
        inspectionNotes: payload.notes,
        inspectionCondition: payload.condition,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/remedy
  // Seller or platform proposes a remedy.
  app.post('/return-cases/:returnCaseId/remedy', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      remedy: z.enum(['full_refund', 'partial_refund', 'replacement', 'repair', 'reject']),
      amountGbp: z.number().nonnegative().optional(),
      notes: z.string().max(2000).optional(),
    });

    const { returnCaseId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const auth = authUserOf(request);
    const isOperator = operatorRole(auth?.role);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      if (returnCase.seller_id !== authUserId && !isOperator) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the seller or an operator can propose a remedy' };
      }

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus = 'remedy_proposed';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      const actorRole = isOperator ? 'operator' : 'seller';

      await client.query(
        `UPDATE return_cases
         SET status = $2,
             proposed_remedy = $3,
             remedy_amount_gbp = $4,
             resolution_notes = COALESCE(resolution_notes, $5),
             updated_at = NOW()
         WHERE id = $1`,
        [
          returnCaseId,
          targetStatus,
          payload.remedy,
          payload.amountGbp ?? null,
          payload.notes ?? null,
        ],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        actorRole,
        payload.notes ?? 'Remedy proposed',
        { remedy: payload.remedy, amountGbp: payload.amountGbp ?? null },
      );

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: targetStatus,
        proposedRemedy: payload.remedy,
        remedyAmountGbp: payload.amountGbp ?? null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/remedy/accept
  // Buyer accepts the proposed remedy.
  app.post('/return-cases/:returnCaseId/remedy/accept', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const { returnCaseId } = paramsSchema.parse(request.params);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      if (returnCase.buyer_id !== authUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the buyer can accept a remedy' };
      }

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus = 'remedy_accepted';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      await client.query(
        `UPDATE return_cases
         SET status = $2, updated_at = NOW()
         WHERE id = $1`,
        [returnCaseId, targetStatus],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        'buyer',
        'Remedy accepted',
        { remedy: returnCase.proposed_remedy },
      );

      // If the remedy is a refund, advance to refund_confirmed immediately.
      // In a full implementation this would trigger the refund execution
      // pipeline (ledger reversal / payment gateway). Here we transition
      // directly since the refund execution service is not wired in this gate.
      let finalStatus: ReturnCaseStatus = targetStatus;
      if (
        returnCase.proposed_remedy === 'full_refund' ||
        returnCase.proposed_remedy === 'partial_refund'
      ) {
        finalStatus = 'refund_confirmed';
        if (validateTransition(targetStatus, finalStatus)) {
          await client.query(
            `UPDATE return_cases
             SET status = $2, resolved_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [returnCaseId, finalStatus],
          );
          await recordTransition(
            client,
            returnCaseId,
            targetStatus,
            finalStatus,
            authUserId,
            'buyer',
            'Refund executed after remedy acceptance',
            { remedy: returnCase.proposed_remedy },
          );
        }
      }

      await client.query('COMMIT');

      return { ok: true, returnCaseId, status: finalStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/remedy/reject
  // Buyer rejects the proposed remedy — escalates to platform (appealed).
  app.post('/return-cases/:returnCaseId/remedy/reject', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      reason: z.string().min(1).max(1000),
    });

    const { returnCaseId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      if (returnCase.buyer_id !== authUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the buyer can reject a remedy' };
      }

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus = 'appealed';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      await client.query(
        `UPDATE return_cases
         SET status = $2,
             appeal_reason = $3,
             appealed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [returnCaseId, targetStatus, payload.reason],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        'buyer',
        payload.reason,
        { rejectedRemedy: returnCase.proposed_remedy },
      );

      await client.query('COMMIT');

      return { ok: true, returnCaseId, status: targetStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/appeal
  // Buyer appeals a rejection.
  app.post('/return-cases/:returnCaseId/appeal', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      reason: z.string().min(1).max(1000),
    });

    const { returnCaseId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      if (returnCase.buyer_id !== authUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the buyer can appeal' };
      }

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus = 'appealed';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      await client.query(
        `UPDATE return_cases
         SET status = $2,
             appeal_reason = $3,
             appealed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [returnCaseId, targetStatus, payload.reason],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        'buyer',
        payload.reason,
      );

      await client.query('COMMIT');

      return { ok: true, returnCaseId, status: targetStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // POST /return-cases/:returnCaseId/close
  // Operator closes the case (terminal).
  app.post('/return-cases/:returnCaseId/close', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      resolutionNotes: z.string().min(1).max(2000),
      operatorReason: z.string().max(1000).optional(),
    });

    const { returnCaseId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const auth = authUserOf(request);
    const isOperator = operatorRole(auth?.role);

    if (!isOperator) {
      reply.code(403);
      return { ok: false, error: 'Only an operator can close a return case' };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                  reason, description, evidence_media_urls,
                  return_window_deadline::text, return_carrier, return_tracking_number,
                  return_label_url, inspection_notes, inspection_condition,
                  proposed_remedy, remedy_amount_gbp,
                  resolution_notes, resolved_at::text,
                  appeal_reason, appealed_at::text,
                  operator_id, operator_reason,
                  created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      const previousStatus = returnCase.status;
      const targetStatus: ReturnCaseStatus = 'closed';

      if (!validateTransition(previousStatus, targetStatus)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Cannot transition from '${previousStatus}' to '${targetStatus}'`,
        };
      }

      await client.query(
        `UPDATE return_cases
         SET status = $2,
             resolution_notes = $3,
             operator_id = $4,
             operator_reason = $5,
             resolved_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [
          returnCaseId,
          targetStatus,
          payload.resolutionNotes,
          authUserId,
          payload.operatorReason ?? null,
        ],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        'operator',
        payload.resolutionNotes,
        { operatorReason: payload.operatorReason ?? null },
      );

      await client.query('COMMIT');

      return { ok: true, returnCaseId, status: targetStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // GET /return-cases/:returnCaseId
  // Fetches a single return case with full history.
  app.get('/return-cases/:returnCaseId', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const { returnCaseId } = paramsSchema.parse(request.params);

    const client = await db.connect();
    try {
      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                reason, description, evidence_media_urls,
                return_window_deadline::text, return_carrier, return_tracking_number,
                return_label_url, inspection_notes, inspection_condition,
                proposed_remedy, remedy_amount_gbp,
                resolution_notes, resolved_at::text,
                appeal_reason, appealed_at::text,
                operator_id, operator_reason,
                created_at::text, updated_at::text
         FROM return_cases
         WHERE id = $1
         LIMIT 1`,
        [returnCaseId],
      );

      if (!result.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Return case not found' };
      }

      const returnCase = result.rows[0];

      const auth = authUserOf(request);
      const isParticipant =
        returnCase.buyer_id === authUserId || returnCase.seller_id === authUserId;
      const isOperator = operatorRole(auth?.role);
      if (!isParticipant && !isOperator) {
        reply.code(403);
        return { ok: false, error: 'Forbidden' };
      }

      const events = await fetchEvents(client, returnCase.id);

      return {
        ok: true,
        returnCase: serializeReturnCase(returnCase),
        events: events.map(serializeEvent),
      };
    } finally {
      client.release();
    }
  });

  // GET /users/me/return-cases
  // Lists return cases for the current user (as buyer or seller).
  app.get('/users/me/return-cases', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const querySchema = z.object({
      status: z
        .enum([
          'requested',
          'evidence_review',
          'approved',
          'rejected',
          'reverse_shipped',
          'received',
          'inspected',
          'remedy_proposed',
          'remedy_accepted',
          'refund_confirmed',
          'appealed',
          'closed',
        ])
        .optional(),
      role: z.enum(['buyer', 'seller']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    });

    const query = querySchema.parse(request.query ?? {});

    const client = await db.connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (query.role === 'buyer') {
        conditions.push(`buyer_id = $${paramIndex++}`);
        params.push(authUserId);
      } else if (query.role === 'seller') {
        conditions.push(`seller_id = $${paramIndex++}`);
        params.push(authUserId);
      } else {
        conditions.push(`(buyer_id = $${paramIndex} OR seller_id = $${paramIndex})`);
        paramIndex++;
        params.push(authUserId);
      }

      if (query.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(query.status);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM return_cases WHERE ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.count ?? 0);

      const listParams = [...params, query.limit, query.offset];
      const result = await client.query<ReturnCaseRow>(
        `SELECT id, order_id, buyer_id, seller_id, basis, status,
                reason, description, evidence_media_urls,
                return_window_deadline::text, return_carrier, return_tracking_number,
                return_label_url, inspection_notes, inspection_condition,
                proposed_remedy, remedy_amount_gbp,
                resolution_notes, resolved_at::text,
                appeal_reason, appealed_at::text,
                operator_id, operator_reason,
                created_at::text, updated_at::text
         FROM return_cases
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        listParams,
      );

      return {
        ok: true,
        items: result.rows.map(serializeReturnCase),
        total,
        limit: query.limit,
        offset: query.offset,
      };
    } finally {
      client.release();
    }
  });
}
