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

export type ReturnRemedy = 'full_refund' | 'partial_refund' | 'replacement' | 'repair' | 'reject';

/**
 * Seller response window for a return case. If the seller has not responded
 * (i.e. the case is still in `requested`/`evidence_review`) within this many
 * hours of the request, the buyer may ask the platform to step in. Surfaced to
 * the client via `stepInEligibleAt` so timer copy always states the real
 * window — never hard-code a different figure in UI copy.
 */
export const SELLER_RESPONSE_WINDOW_HOURS = 72;
const SELLER_RESPONSE_WINDOW_MS = SELLER_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * Return window length in days, measured from delivery (CRA 2015 short-term
 * rejection right). The deadline is stored on the case as
 * `return_window_deadline` and enforced at request time — a case cannot be
 * opened once it has passed.
 */
export const RETURN_WINDOW_DAYS = 14;

/**
 * Order statuses on which a return can be opened. A return is a post-receipt
 * remedy, so only delivered/completed orders qualify — returns on unpaid,
 * in-flight, cancelled or already-refunded orders are rejected with
 * RETURN_NOT_AVAILABLE.
 */
const RETURN_ELIGIBLE_ORDER_STATUSES: ReadonlySet<string> = new Set([
  'delivered',
  'completed',
]);

export type ReturnRequestEligibility =
  | { ok: true }
  | {
      ok: false;
      code: 'RETURN_NOT_AVAILABLE' | 'RETURN_WINDOW_EXPIRED';
      error: string;
    };

/**
 * Gates return-request creation: the order must be in a post-receipt status
 * AND the return window must not have elapsed. Status is checked first — an
 * ineligible order is never rescued by a still-open window.
 */
export function evaluateReturnRequestEligibility(input: {
  orderStatus: string;
  returnWindowDeadline: Date;
  now?: Date;
}): ReturnRequestEligibility {
  const status = input.orderStatus.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (!RETURN_ELIGIBLE_ORDER_STATUSES.has(status)) {
    return {
      ok: false,
      code: 'RETURN_NOT_AVAILABLE',
      error: `A return cannot be opened for an order in status '${input.orderStatus}'`,
    };
  }
  const now = input.now ?? new Date();
  if (now.getTime() > input.returnWindowDeadline.getTime()) {
    return {
      ok: false,
      code: 'RETURN_WINDOW_EXPIRED',
      error: 'The return window for this order has expired',
    };
  }
  return { ok: true };
}

/** Statuses in which the case is still waiting on the seller to respond. */
const STEP_IN_WAITING_STATUSES: ReadonlySet<ReturnCaseStatus> = new Set([
  'requested',
  'evidence_review',
]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A refund amount (requested or proposed) must be positive and must not
 * exceed the paid order total. Used for buyer partial-refund requests and
 * seller/operator partial-refund remedies.
 */
export function isRefundAmountWithinPaidTotal(amountGbp: number, totalGbp: number): boolean {
  return (
    Number.isFinite(amountGbp) &&
    amountGbp > 0 &&
    amountGbp <= round2(totalGbp) + 1e-9
  );
}

export type RemedyAmountResolution =
  | { ok: true; remedyAmountGbp: number | null }
  | {
      ok: false;
      code:
        | 'REMEDY_AMOUNT_REQUIRED'
        | 'REMEDY_AMOUNT_EXCEEDS_TOTAL'
        | 'REMEDY_AMOUNT_NOT_APPLICABLE';
      error: string;
    };

/**
 * Resolves the stored remedy amount for a proposed remedy.
 *
 * Only `partial_refund` carries a buyer/seller-chosen amount — required,
 * positive, and bounded by the paid order total. `full_refund` always stores
 * the paid total (so the confirmed refund carries an explicit figure) and
 * every other remedy stores no amount at all: an explicit `amountGbp` on a
 * non-partial remedy is rejected rather than silently stored, so the API
 * contract never records a "full refund" for £5 on a £56 order.
 */
export function resolveRemedyAmountGbp(input: {
  remedy: ReturnRemedy;
  amountGbp: number | undefined;
  orderTotalGbp: number;
}): RemedyAmountResolution {
  const { remedy, amountGbp, orderTotalGbp } = input;

  if (remedy !== 'partial_refund') {
    if (amountGbp !== undefined) {
      return {
        ok: false,
        code: 'REMEDY_AMOUNT_NOT_APPLICABLE',
        error: `An explicit amount only applies to a partial refund remedy, not '${remedy}'`,
      };
    }
    return {
      ok: true,
      remedyAmountGbp: remedy === 'full_refund' ? round2(orderTotalGbp) : null,
    };
  }

  if (amountGbp === undefined) {
    return {
      ok: false,
      code: 'REMEDY_AMOUNT_REQUIRED',
      error: 'A partial refund remedy requires an amount',
    };
  }
  if (!isRefundAmountWithinPaidTotal(amountGbp, orderTotalGbp)) {
    return {
      ok: false,
      code: 'REMEDY_AMOUNT_EXCEEDS_TOTAL',
      error: `Remedy amount must be positive and no greater than the paid order total of ${round2(orderTotalGbp).toFixed(2)} GBP`,
    };
  }
  return { ok: true, remedyAmountGbp: round2(amountGbp) };
}

/**
 * When the seller response window closes for a case created at `createdAt`.
 * Returns null for statuses where step-in is not applicable (the seller has
 * already responded, or the case is resolved).
 */
export function computeStepInEligibleAt(
  status: ReturnCaseStatus,
  createdAt: string,
): string | null {
  if (!STEP_IN_WAITING_STATUSES.has(status)) return null;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return null;
  return new Date(created + SELLER_RESPONSE_WINDOW_MS).toISOString();
}

/**
 * Step-in eligibility: the case must still be waiting on the seller AND the
 * response window must have elapsed.
 */
export function computeStepInEligibility(input: {
  status: ReturnCaseStatus;
  createdAt: string;
  now?: Date;
}): { eligible: boolean; eligibleAt: string | null } {
  const eligibleAt = computeStepInEligibleAt(input.status, input.createdAt);
  if (eligibleAt === null) return { eligible: false, eligibleAt: null };
  const now = (input.now ?? new Date()).getTime();
  return { eligible: now >= new Date(eligibleAt).getTime(), eligibleAt };
}

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
  requested_amount_gbp: number | string | null;
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
  // 'appealed' from requested/evidence_review is the platform step-in path:
  // reachable only via POST /return-cases/:id/step-in after the seller
  // response window has elapsed (the endpoint enforces the timing).
  requested: ['evidence_review', 'approved', 'rejected', 'appealed'],
  evidence_review: ['approved', 'rejected', 'appealed'],
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
  ensureUserExists: (userId: string) => Promise<void>;
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
    requestedAmountGbp: row.requested_amount_gbp === null ? null : Number(row.requested_amount_gbp),
    /**
     * ISO timestamp when the buyer may ask the platform to step in — the
     * seller response window (SELLER_RESPONSE_WINDOW_HOURS) measured from the
     * request. Null once the seller has responded or the case has moved past
     * the waiting states. Clients must render step-in copy from this value,
     * not a locally assumed window.
     */
    stepInEligibleAt: computeStepInEligibleAt(row.status, row.created_at),
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

/**
 * Marks a return case `refund_confirmed` once a linked refund execution has
 * genuinely succeeded (`refund_executions.status = 'succeeded'`). This is the
 * only legitimate way the status is reached — the case must currently be
 * `remedy_accepted`, the state the buyer's acceptance leaves it in while the
 * refund is executed. Any other current state is left untouched so a stale,
 * duplicate or out-of-order execution can never resurrect a resolved case.
 *
 * Call inside the refund-execution transaction. Returns true when the case
 * was advanced.
 */
export async function confirmReturnCaseRefund(
  client: PoolClient,
  returnCaseId: string,
  actorId: string,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const result = await client.query<{ status: ReturnCaseStatus }>(
    `SELECT status FROM return_cases WHERE id = $1 LIMIT 1 FOR UPDATE`,
    [returnCaseId],
  );
  const current = result.rows[0]?.status;
  if (current !== 'remedy_accepted') {
    return false;
  }
  await client.query(
    `UPDATE return_cases
     SET status = 'refund_confirmed', resolved_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [returnCaseId],
  );
  await recordTransition(
    client,
    returnCaseId,
    'remedy_accepted',
    'refund_confirmed',
    actorId,
    'operator',
    'Refund executed',
    metadata,
  );
  return true;
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
      /**
       * Optional partial-refund request in GBP major units. Must be positive
       * and no greater than the order's paid total (validated against
       * orders.total_gbp below). Omitted means the buyer requests a full
       * refund.
       */
      requestedAmountGbp: z.number().positive().max(100000).optional(),
    });

    const { orderId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await ensureUserExists(authUserId);

      // Lock the order row and fetch details needed for basis determination.
      const orderResult = await client.query<{
        buyer_id: string;
        seller_id: string;
        buyer_protection_fee_gbp: number | string;
        total_gbp: number | string;
        status: string;
        delivered_at: string | null;
        created_at: string;
      }>(
        `SELECT buyer_id, seller_id, buyer_protection_fee_gbp, total_gbp, status,
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

      // Eligibility gate: a return is a post-receipt remedy. The order must
      // be delivered/completed and the request must land inside the return
      // window — otherwise a case carrying a refund amount could be opened on
      // an unpaid, cancelled or already-refunded order, or months after
      // delivery. The window is statutory 14 days from delivery (CRA 2015
      // short-term rejection right); when the order has no delivered_at the
      // window opens from now.
      const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : new Date();
      const returnWindowDeadline = new Date(
        deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      const eligibility = evaluateReturnRequestEligibility({
        orderStatus: order.status,
        returnWindowDeadline,
      });
      if (!eligibility.ok) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: eligibility.error,
          code: eligibility.code,
          returnWindowDeadline: returnWindowDeadline.toISOString(),
        };
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

      // Partial-refund requests must not exceed the paid order total.
      const requestedAmountGbp =
        payload.requestedAmountGbp === undefined
          ? null
          : round2(payload.requestedAmountGbp);
      if (
        requestedAmountGbp !== null &&
        !isRefundAmountWithinPaidTotal(requestedAmountGbp, Number(order.total_gbp))
      ) {
        await client.query('ROLLBACK');
        reply.code(422);
        return {
          ok: false,
          error: `Requested refund amount exceeds the paid order total of ${Number(order.total_gbp).toFixed(2)} GBP`,
          code: 'REFUND_AMOUNT_EXCEEDS_TOTAL',
          orderTotalGbp: Number(order.total_gbp),
        };
      }

      const returnCaseId = `rc_${crypto.randomUUID()}`;

      await client.query(
        `INSERT INTO return_cases
           (id, order_id, buyer_id, seller_id, basis, status,
            reason, description, evidence_media_urls, return_window_deadline,
            requested_amount_gbp)
         VALUES ($1, $2, $3, $4, $5, 'requested',
                 $6, $7, $8, $9, $10)`,
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
          requestedAmountGbp,
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
        {
          reason: payload.reason,
          basis,
          requestedAmountGbp,
        },
      );

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: 'requested' as ReturnCaseStatus,
        basis,
        returnWindowDeadline: returnWindowDeadline.toISOString(),
        requestedAmountGbp,
        stepInEligibleAt: computeStepInEligibleAt('requested', new Date().toISOString()),
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
                proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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

  // POST /return-cases/:returnCaseId/step-in
  // Buyer asks the platform to step in when the seller has not responded
  // within SELLER_RESPONSE_WINDOW_HOURS of the request. Transitions the case
  // to 'appealed' (the platform-review state) and stamps appealed_at.
  app.post('/return-cases/:returnCaseId/step-in', async (request, reply) => {
    const authUserId = resolveAuthenticatedUserId(request);
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const paramsSchema = z.object({ returnCaseId: z.string().min(4).max(64) });
    const bodySchema = z.object({
      reason: z.string().min(1).max(1000).optional(),
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
        return { ok: false, error: 'Only the buyer can ask the platform to step in' };
      }

      const eligibility = computeStepInEligibility({
        status: returnCase.status,
        createdAt: returnCase.created_at,
      });

      if (eligibility.eligibleAt === null) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Step-in is not available from status '${returnCase.status}'`,
          code: 'STEP_IN_NOT_AVAILABLE',
        };
      }

      if (!eligibility.eligible) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `The seller response window has not elapsed yet. Step-in is available from ${eligibility.eligibleAt}`,
          code: 'STEP_IN_NOT_YET_ELIGIBLE',
          stepInEligibleAt: eligibility.eligibleAt,
        };
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

      const appealReason =
        payload.reason ??
        `Seller did not respond within the ${SELLER_RESPONSE_WINDOW_HOURS}-hour response window`;

      await client.query(
        `UPDATE return_cases
         SET status = $2,
             appeal_reason = $3,
             appealed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [returnCaseId, targetStatus, appealReason],
      );

      await recordTransition(
        client,
        returnCaseId,
        previousStatus,
        targetStatus,
        authUserId,
        'buyer',
        appealReason,
        {
          trigger: 'seller_no_response',
          responseWindowHours: SELLER_RESPONSE_WINDOW_HOURS,
        },
      );

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: targetStatus,
        appealedAt: new Date().toISOString(),
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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

      // Remedy amounts are bounded by the paid order total, and only a
      // partial refund carries an explicit amount at all — see
      // resolveRemedyAmountGbp for the contract.
      const orderResult = await client.query<{ total_gbp: number | string }>(
        `SELECT total_gbp FROM orders WHERE id = $1 LIMIT 1`,
        [returnCase.order_id],
      );
      const orderTotalGbp = Number(orderResult.rows[0]?.total_gbp ?? 0);

      const amountResolution = resolveRemedyAmountGbp({
        remedy: payload.remedy,
        amountGbp: payload.amountGbp,
        orderTotalGbp,
      });
      if (!amountResolution.ok) {
        await client.query('ROLLBACK');
        reply.code(422);
        return {
          ok: false,
          error: amountResolution.error,
          code: amountResolution.code,
          orderTotalGbp,
        };
      }

      const remedyAmountGbp = amountResolution.remedyAmountGbp;

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
          remedyAmountGbp,
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
        { remedy: payload.remedy, amountGbp: remedyAmountGbp },
      );

      await client.query('COMMIT');

      return {
        ok: true,
        returnCaseId,
        status: targetStatus,
        proposedRemedy: payload.remedy,
        remedyAmountGbp,
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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

      // A refund remedy does NOT advance the case to refund_confirmed here:
      // no money has moved yet. The case stays at remedy_accepted — the
      // truthful "refund approved, processing" state — until a refund
      // execution linked to this case (refund_executions.return_case_id)
      // succeeds, at which point confirmReturnCaseRefund advances it to
      // refund_confirmed. See routes/refunds.ts.
      await client.query('COMMIT');

      return { ok: true, returnCaseId, status: targetStatus };
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                  proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
                proposed_remedy, remedy_amount_gbp, requested_amount_gbp,
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
