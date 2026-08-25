import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import {
  getCase,
  appendCaseEvent,
  listCaseEvents,
  assignCase,
  updateCaseState,
  resolveCase,
} from '../support/caseService.js';
import { assertTransition } from '../support/caseStateMachine.js';
import {
  getConversation,
  appendMessage,
  updateOwnershipState,
} from '../support/conversationService.js';
import { listHandoffsForConversation } from '../support/handoffService.js';
import {
  getActionProposal,
  confirmActionProposal,
  rejectActionProposal,
} from '../support/actionBroker.js';
import { getQueueSlaSummary } from '../support/slaService.js';
import type {
  CaseOperationalState,
  CaseResolutionDisposition,
  CasePriority,
} from '../support/contracts.js';

type NotificationInput = {
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
};

export type OperatorSupportRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string) => Error;
  queueUserNotification: (input: NotificationInput) => Promise<string | null>;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CASE_OPERATIONAL_STATES: readonly CaseOperationalState[] = [
  'new',
  'triaged',
  'awaiting_customer',
  'queued',
  'in_review',
  'awaiting_external',
  'resolved',
  'closed',
];

const CASE_PRIORITIES: readonly CasePriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
];

const RESOLUTION_DISPOSITIONS: readonly CaseResolutionDisposition[] = [
  'information_provided',
  'customer_withdrew',
  'seller_resolved',
  'refund_approved',
  'refund_denied',
  'return_approved',
  'not_eligible',
  'no_violation',
  'violation_actioned',
  'duplicate',
  'merged',
  'external_dispute',
  'unable_to_resolve',
];

const caseListQuerySchema = z.object({
  team: z.string().min(1).max(120).optional(),
  state: z.enum(CASE_OPERATIONAL_STATES as [CaseOperationalState, ...CaseOperationalState[]]).optional(),
  priority: z.enum(CASE_PRIORITIES as [CasePriority, ...CasePriority[]]).optional(),
  assigned: z.enum(['me', 'unassigned', 'any']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const caseIdParamsSchema = z.object({
  id: z.string().min(4).max(120),
});

const auditCaseParamsSchema = z.object({
  caseId: z.string().min(4).max(120),
});

const actionIdParamsSchema = z.object({
  id: z.string().min(4).max(120),
});

const assignCaseBodySchema = z.object({
  operatorId: z.string().min(1).max(120).optional(),
  team: z.string().min(1).max(120).optional(),
});

const replyBodySchema = z.object({
  body: z.string().min(1).max(8000),
});

const noteBodySchema = z.object({
  body: z.string().min(1).max(8000),
});

const requestInformationBodySchema = z.object({
  message: z.string().min(1).max(8000),
});

const resolveCaseBodySchema = z.object({
  disposition: z.enum(RESOLUTION_DISPOSITIONS as [CaseResolutionDisposition, ...CaseResolutionDisposition[]]),
  summary: z.string().min(1).max(8000).optional(),
});

const actionReviewBodySchema = z.object({
  reason: z.string().min(1).max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerOperatorSupportRoutes = ({
  app,
  db,
  createApiError,
  queueUserNotification,
}: OperatorSupportRouteDependencies) => {
  // ── 1. GET /ops/support/queues ────────────────────────────────────────
  app.get('/ops/support/queues', async (request, reply) => {
    // TODO: operator RBAC — this endpoint needs a dedicated operator scope,
    // not just a logged-in userId. For now we gate on authenticated identity.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    // Aggregate counts per assigned_team. Teams with no cases are not
    // returned, which is acceptable for an operator queue overview.
    const teamRows = await db.query<{ assigned_team: string | null }>(
      `
        SELECT DISTINCT assigned_team
        FROM support_cases
        WHERE assigned_team IS NOT NULL
        ORDER BY assigned_team ASC
      `,
    );

    const queues: Array<{
      team: string;
      totalCases: number;
      breachedCount: number;
      atRiskCount: number;
      pausedCount: number;
      activeCount: number;
      awaitingFirstResponse: number;
    }> = [];

    for (const row of teamRows.rows) {
      const team = row.assigned_team as string;
      const summary = await getQueueSlaSummary(db, team);
      queues.push(summary);
    }

    // Also include an "unassigned" bucket count so operators can see the
    // pool of cases that have not yet been routed to a team.
    const unassignedResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM support_cases WHERE assigned_team IS NULL`,
    );
    const unassignedCount = Number(unassignedResult.rows[0].count);

    return {
      ok: true,
      queues,
      unassigned: unassignedCount,
    };
  });

  // ── 2. GET /ops/support/cases ─────────────────────────────────────────
  app.get('/ops/support/cases', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const query = caseListQuerySchema.parse(request.query);
    const pageLimit = query.limit ?? 50;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (query.team) {
      conditions.push(`assigned_team = $${paramIdx++}`);
      params.push(query.team);
    }
    if (query.state) {
      conditions.push(`operational_state = $${paramIdx++}`);
      params.push(query.state);
    }
    if (query.priority) {
      conditions.push(`priority = $${paramIdx++}`);
      params.push(query.priority);
    }
    if (query.assigned === 'me') {
      conditions.push(`assigned_operator_id = $${paramIdx++}`);
      params.push(operatorId);
    } else if (query.assigned === 'unassigned') {
      conditions.push(`assigned_operator_id IS NULL`);
    }

    if (query.cursor) {
      conditions.push(`created_at < $${paramIdx++}`);
      params.push(query.cursor);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(pageLimit);

    const result = await db.query(
      `
        SELECT id, conversation_id, user_id, issue_type, requested_outcome,
               operational_state, resolution_disposition, priority, risk_flags,
               assigned_team, assigned_operator_id, policy_version_id,
               created_at, updated_at
        FROM support_cases
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIdx}
      `,
      params,
    );

    const cases = result.rows;

    return {
      ok: true,
      cases,
    };
  });

  // ── 3. POST /ops/support/cases/:id/assign ─────────────────────────────
  app.post('/ops/support/cases/:id/assign', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = caseIdParamsSchema.parse(request.params);
    const body = assignCaseBodySchema.parse(request.body);

    const caseRow = await getCase(db, id);
    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    const targetOperatorId = body.operatorId ?? operatorId;
    const targetTeam = body.team ?? caseRow.assignedTeam ?? undefined;

    await assignCase(db, id, targetOperatorId, targetTeam, operatorId);

    const event = await appendCaseEvent(
      db,
      id,
      'case_assigned',
      operatorId,
      'operator',
      {
        operatorId: targetOperatorId,
        team: targetTeam ?? null,
        assignedBy: operatorId,
      },
      false,
    );

    const updated = await getCase(db, id);

    logger.info(
      { caseId: id, operatorId: targetOperatorId, team: targetTeam ?? null },
      '[operatorSupport] case assigned',
    );

    return { ok: true, case: updated, event };
  });

  // ── 4. POST /ops/support/cases/:id/reply ──────────────────────────────
  app.post('/ops/support/cases/:id/reply', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = caseIdParamsSchema.parse(request.params);
    const body = replyBodySchema.parse(request.body);

    const caseRow = await getCase(db, id);
    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    if (caseRow.operationalState === 'closed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This case is closed and cannot receive new replies',
        code: 'CASE_CLOSED',
      };
    }

    if (!caseRow.conversationId) {
      reply.code(409);
      return {
        ok: false,
        error: 'This case has no linked conversation to reply to',
        code: 'NO_LINKED_CONVERSATION',
      };
    }

    const conversation = await getConversation(db, caseRow.conversationId);
    if (!conversation) {
      reply.code(404);
      return {
        ok: false,
        error: 'Linked conversation not found',
        code: 'CONVERSATION_NOT_FOUND',
      };
    }

    if (conversation.ownershipState === 'closed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This conversation is closed and cannot receive new messages',
        code: 'CONVERSATION_CLOSED',
      };
    }

    // Append the operator's reply to the conversation thread.
    const message = await appendMessage(
      db,
      caseRow.conversationId,
      operatorId,
      'agent_human',
      body.body,
    );

    // Transition conversation ownership to human_active so the AI agent
    // does not interleave while a human is engaged.
    await updateOwnershipState(db, caseRow.conversationId, 'human_active');

    // Record a public case event so the customer-visible timeline reflects
    // the operator reply.
    const event = await appendCaseEvent(
      db,
      id,
      'operator_reply',
      operatorId,
      'operator',
      { messageId: message.id, body: body.body },
      true,
    );

    // Notify the customer that an operator has replied.
    await queueUserNotification({
      userId: caseRow.userId,
      title: 'Support update',
      body: body.body.slice(0, 200),
      eventType: 'support.operator_reply',
      actorUserId: operatorId,
      payload: { caseId: id, conversationId: caseRow.conversationId, messageId: message.id },
      route: { screen: 'support_case', params: { caseId: id } },
    });

    logger.info(
      { caseId: id, conversationId: caseRow.conversationId, operatorId },
      '[operatorSupport] operator reply posted',
    );

    reply.code(201);
    return { ok: true, message, event };
  });

  // ── 5. POST /ops/support/cases/:id/note ───────────────────────────────
  app.post('/ops/support/cases/:id/note', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = caseIdParamsSchema.parse(request.params);
    const body = noteBodySchema.parse(request.body);

    const caseRow = await getCase(db, id);
    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    // Internal notes are never customer-visible: isPublic = false.
    const event = await appendCaseEvent(
      db,
      id,
      'internal_note',
      operatorId,
      'operator',
      { body: body.body },
      false,
    );

    logger.info(
      { caseId: id, operatorId },
      '[operatorSupport] internal note added',
    );

    reply.code(201);
    return { ok: true, event };
  });

  // ── 6. POST /ops/support/cases/:id/request-information ────────────────
  app.post('/ops/support/cases/:id/request-information', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = caseIdParamsSchema.parse(request.params);
    const body = requestInformationBodySchema.parse(request.body);

    const caseRow = await getCase(db, id);
    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    if (caseRow.operationalState === 'closed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This case is closed and cannot be modified',
        code: 'CASE_CLOSED',
      };
    }

    // Validate the state transition before mutating.
    assertTransition(caseRow.operationalState, 'awaiting_customer');

    // Record the information-request event on the public timeline so the
    // customer can see what was asked.
    const event = await appendCaseEvent(
      db,
      id,
      'information_requested',
      operatorId,
      'operator',
      { message: body.message },
      true,
    );

    // Move the case into the awaiting_customer state.
    await updateCaseState(db, id, 'awaiting_customer');

    // If the case has a linked conversation, post the request as a
    // customer-visible message and pause the SLA clock while we wait.
    if (caseRow.conversationId) {
      await appendMessage(
        db,
        caseRow.conversationId,
        operatorId,
        'agent_human',
        body.message,
      );
      await updateOwnershipState(db, caseRow.conversationId, 'awaiting_customer');
    }

    // Notify the customer that information is requested.
    await queueUserNotification({
      userId: caseRow.userId,
      title: 'Information requested',
      body: body.message.slice(0, 200),
      eventType: 'support.information_requested',
      actorUserId: operatorId,
      payload: { caseId: id },
      route: { screen: 'support_case', params: { caseId: id } },
    });

    const updated = await getCase(db, id);

    logger.info(
      { caseId: id, operatorId, fromState: caseRow.operationalState },
      '[operatorSupport] information requested',
    );

    reply.code(201);
    return { ok: true, case: updated, event };
  });

  // ── 7. POST /ops/support/cases/:id/resolve ────────────────────────────
  app.post('/ops/support/cases/:id/resolve', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = caseIdParamsSchema.parse(request.params);
    const body = resolveCaseBodySchema.parse(request.body);

    const caseRow = await getCase(db, id);
    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    if (caseRow.operationalState === 'closed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This case is already closed',
        code: 'CASE_CLOSED',
      };
    }

    // Validate the transition to 'resolved' before mutating.
    assertTransition(caseRow.operationalState, 'resolved');

    // Record the resolution event on the timeline (public so the customer
    // can see the outcome).
    const event = await appendCaseEvent(
      db,
      id,
      'case_resolved',
      operatorId,
      'operator',
      {
        disposition: body.disposition,
        summary: body.summary ?? null,
      },
      true,
    );

    // Persist the resolved state and disposition.
    await resolveCase(db, id, body.disposition);

    // If the case has a linked conversation, mark it resolved too.
    if (caseRow.conversationId) {
      await updateOwnershipState(db, caseRow.conversationId, 'resolved');
    }

    // Notify the customer that their case has been resolved.
    await queueUserNotification({
      userId: caseRow.userId,
      title: 'Case resolved',
      body: body.summary ?? `Your case has been resolved: ${body.disposition}`,
      eventType: 'support.case_resolved',
      actorUserId: operatorId,
      payload: { caseId: id, disposition: body.disposition },
      route: { screen: 'support_case', params: { caseId: id } },
    });

    const updated = await getCase(db, id);

    logger.info(
      { caseId: id, operatorId, disposition: body.disposition },
      '[operatorSupport] case resolved',
    );

    return { ok: true, case: updated, event };
  });

  // ── 8. POST /ops/support/actions/:id/approve ──────────────────────────
  app.post('/ops/support/actions/:id/approve', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    // S4 (consequential) actions require explicit operator approval before
    // they can be executed.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = actionIdParamsSchema.parse(request.params);
    const body = actionReviewBodySchema.parse(request.body);

    const proposal = await getActionProposal(db, id);
    if (!proposal) {
      reply.code(404);
      return { ok: false, error: 'Action proposal not found', code: 'ACTION_NOT_FOUND' };
    }

    if (proposal.state !== 'proposed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This action can only be approved while in the proposed state',
        code: 'ACTION_NOT_PROPOSED',
      };
    }

    try {
      const confirmed = await confirmActionProposal(db, id);

      // Record the operator approval as a private case event for audit.
      if (proposal.caseId) {
        await appendCaseEvent(
          db,
          proposal.caseId,
          'action_approved',
          operatorId,
          'operator',
          {
            actionId: id,
            toolName: proposal.toolName,
            reason: body.reason ?? null,
          },
          false,
        );
      }

      logger.info(
        { actionId: id, operatorId, caseId: proposal.caseId },
        '[operatorSupport] action proposal approved',
      );

      return { ok: true, action: confirmed };
    } catch {
      reply.code(409);
      return {
        ok: false,
        error: 'This action can only be approved while in the proposed state',
        code: 'ACTION_NOT_PROPOSED',
      };
    }
  });

  // ── 9. POST /ops/support/actions/:id/reject ───────────────────────────
  app.post('/ops/support/actions/:id/reject', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    // S4 (consequential) actions can be rejected by an operator, preventing
    // execution entirely.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = actionIdParamsSchema.parse(request.params);
    const body = actionReviewBodySchema.parse(request.body);

    const proposal = await getActionProposal(db, id);
    if (!proposal) {
      reply.code(404);
      return { ok: false, error: 'Action proposal not found', code: 'ACTION_NOT_FOUND' };
    }

    if (proposal.state !== 'proposed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This action can only be rejected while in the proposed state',
        code: 'ACTION_NOT_PROPOSED',
      };
    }

    try {
      const rejected = await rejectActionProposal(db, id);

      // Record the operator rejection as a private case event for audit.
      if (proposal.caseId) {
        await appendCaseEvent(
          db,
          proposal.caseId,
          'action_rejected',
          operatorId,
          'operator',
          {
            actionId: id,
            toolName: proposal.toolName,
            reason: body.reason ?? null,
          },
          false,
        );
      }

      logger.info(
        { actionId: id, operatorId, caseId: proposal.caseId },
        '[operatorSupport] action proposal rejected',
      );

      return { ok: true, action: rejected };
    } catch {
      reply.code(409);
      return {
        ok: false,
        error: 'This action can only be rejected while in the proposed state',
        code: 'ACTION_NOT_PROPOSED',
      };
    }
  });

  // ── 10. GET /ops/support/audit/:caseId ────────────────────────────────
  app.get('/ops/support/audit/:caseId', async (request, reply) => {
    // TODO: operator RBAC — needs operator scope, not just userId.
    const operatorId = request.authUser?.userId;
    if (!operatorId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { caseId } = auditCaseParamsSchema.parse(request.params);

    const caseRow = await getCase(db, caseId);
    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    // Return ALL events, including private ones, for operator audit.
    const events = await listCaseEvents(db, caseId, true);

    // Include handoff history for the linked conversation, if any, so the
    // operator has the full escalation context.
    let handoffs: Awaited<ReturnType<typeof listHandoffsForConversation>> = [];
    if (caseRow.conversationId) {
      handoffs = await listHandoffsForConversation(db, caseRow.conversationId);
    }

    logger.info(
      { caseId, operatorId, eventCount: events.length },
      '[operatorSupport] audit trail retrieved',
    );

    return {
      ok: true,
      case: caseRow,
      events,
      handoffs,
    };
  });
};
