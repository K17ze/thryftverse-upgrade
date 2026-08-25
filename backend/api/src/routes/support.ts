import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  createConversation,
  getConversationForUser,
  listConversationsForUser,
  appendMessage,
  listMessages,
  resolveConversation,
} from '../support/conversationService.js';
import {
  getCaseForUser,
  listCasesForUser,
  appendCaseEvent,
  listCaseEvents,
} from '../support/caseService.js';
import { projectContext } from '../support/contextProjectionService.js';
import { searchKnowledge, getArticleBySlug } from '../support/knowledgeService.js';
import { createHandoff } from '../support/handoffService.js';
import { createFeedback } from '../support/feedbackService.js';
import {
  getActionProposal,
  confirmActionProposal,
  rejectActionProposal,
} from '../support/actionBroker.js';
import type { ProjectedSupportContext, SupportEntryContext } from '../support/contracts.js';

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

export type SupportRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string) => Error;
  queueUserNotification: (input: NotificationInput) => Promise<string | null>;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CONTEXT_KINDS = [
  'general',
  'order',
  'listing',
  'payout',
  'report',
  'auction',
  'coown_asset',
  'catalog_import',
  'media_job',
] as const;

const bootstrapQuerySchema = z.object({
  contextType: z.enum(CONTEXT_KINDS).optional(),
  contextId: z.string().min(1).max(120).optional(),
});

const createConversationBodySchema = z.object({
  contextKind: z.enum(CONTEXT_KINDS),
  contextId: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(10).optional(),
});

const conversationIdParamsSchema = z.object({
  id: z.string().min(4).max(120),
});

const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

const appendMessageBodySchema = z.object({
  body: z.string().min(1).max(8000),
  attachments: z.array(z.string().url()).max(10).optional(),
});

const handoffBodySchema = z.object({
  reason: z.string().min(1).max(1000).optional(),
});

const resolveConfirmationBodySchema = z.object({
  resolved: z.boolean(),
});

const feedbackBodySchema = z.object({
  rating: z.enum(['helpful', 'unhelpful']),
  reason: z.string().min(1).max(2000).optional(),
  messageId: z.string().min(4).max(120).optional(),
});

const caseListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const caseIdParamsSchema = z.object({
  id: z.string().min(4).max(120),
});

const caseMessageBodySchema = z.object({
  body: z.string().min(1).max(8000),
});

const caseAppealBodySchema = z.object({
  reason: z.string().min(1).max(5000),
});

const actionIdParamsSchema = z.object({
  id: z.string().min(4).max(120),
});

const knowledgeSearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const knowledgeArticleParamsSchema = z.object({
  slug: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a SupportEntryContext discriminated union value from a contextKind
 * and optional contextId. For 'general', no contextId is needed.
 */
function buildEntryContext(
  contextKind: string,
  contextId: string | undefined,
): SupportEntryContext {
  if (contextKind === 'general') {
    return { kind: 'general' };
  }

  const id = contextId ?? '';
  switch (contextKind) {
    case 'order':
      return { kind: 'order', orderId: id };
    case 'listing':
      return { kind: 'listing', listingId: id };
    case 'payout':
      return { kind: 'payout', payoutId: id };
    case 'report':
      return { kind: 'report', reportId: id };
    case 'auction':
      return { kind: 'auction', auctionId: id };
    case 'coown_asset':
      return { kind: 'coown_asset', assetId: id };
    case 'catalog_import':
      return { kind: 'catalog_import', importJobId: id };
    case 'media_job':
      return { kind: 'media_job', mediaJobId: id };
    default:
      return { kind: 'general' };
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerSupportRoutes = ({
  app,
  db,
  createApiError,
  queueUserNotification,
}: SupportRouteDependencies) => {
  // ── 1. GET /support/bootstrap ─────────────────────────────────────────
  app.get('/support/bootstrap', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const query = bootstrapQuerySchema.parse(request.query);
    const contextType = query.contextType;
    const contextId = query.contextId;

    let context: ProjectedSupportContext = null;
    if (contextType && contextId && contextType !== 'general') {
      context = await projectContext(db, contextType, contextId, userId);
    }

    const recentConversations = await listConversationsForUser(db, userId, 5);
    const recentCases = await listCasesForUser(db, userId, 5);

    return {
      ok: true,
      context,
      recentConversations,
      recentCases,
    };
  });

  // ── 2. POST /support/conversations ───────────────────────────────────
  app.post('/support/conversations', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const body = createConversationBodySchema.parse(request.body);

    if (body.contextKind !== 'general' && !body.contextId) {
      reply.code(400);
      return {
        ok: false,
        error: 'contextId is required when contextKind is not "general"',
        code: 'CONTEXT_ID_REQUIRED',
      };
    }

    const context = buildEntryContext(body.contextKind, body.contextId);
    const conversation = await createConversation(
      db,
      userId,
      context,
      body.locale ?? 'en',
    );

    reply.code(201);
    return { ok: true, conversation };
  });

  // ── 3. GET /support/conversations/:id ────────────────────────────────
  app.get('/support/conversations/:id', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = conversationIdParamsSchema.parse(request.params);

    const conversation = await getConversationForUser(db, id, userId);

    if (!conversation) {
      reply.code(404);
      return { ok: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' };
    }

    return { ok: true, conversation };
  });

  // ── 4. GET /support/conversations/:id/messages ───────────────────────
  app.get('/support/conversations/:id/messages', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = conversationIdParamsSchema.parse(request.params);
    const query = messageListQuerySchema.parse(request.query);

    const conversation = await getConversationForUser(db, id, userId);

    if (!conversation) {
      reply.code(404);
      return { ok: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' };
    }

    const messages = await listMessages(db, id, query.limit, query.cursor);

    return {
      ok: true,
      messages,
    };
  });

  // ── 5. POST /support/conversations/:id/messages ──────────────────────
  app.post('/support/conversations/:id/messages', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = conversationIdParamsSchema.parse(request.params);
    const body = appendMessageBodySchema.parse(request.body);

    const conversation = await getConversationForUser(db, id, userId);

    if (!conversation) {
      reply.code(404);
      return { ok: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' };
    }

    if (conversation.ownershipState === 'closed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This conversation is closed and cannot receive new messages',
        code: 'CONVERSATION_CLOSED',
      };
    }

    const message = await appendMessage(
      db,
      id,
      userId,
      'customer',
      body.body,
      [],
      body.attachments ? { attachments: body.attachments } : {},
    );

    reply.code(201);
    return { ok: true, message };
  });

  // ── 6. POST /support/conversations/:id/handoff ───────────────────────
  app.post('/support/conversations/:id/handoff', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = conversationIdParamsSchema.parse(request.params);
    const body = handoffBodySchema.parse(request.body);

    const conversation = await getConversationForUser(db, id, userId);

    if (!conversation) {
      reply.code(404);
      return { ok: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' };
    }

    if (conversation.ownershipState === 'closed') {
      reply.code(409);
      return {
        ok: false,
        error: 'Cannot hand off a closed conversation',
        code: 'CONVERSATION_CLOSED',
      };
    }

    const reason = body.reason ?? 'Customer requested human agent';
    const handoff = await createHandoff(db, id, reason, 'user_request');

    return { ok: true, handoff };
  });

  // ── 7. POST /support/conversations/:id/resolve-confirmation ──────────
  app.post('/support/conversations/:id/resolve-confirmation', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = conversationIdParamsSchema.parse(request.params);
    const body = resolveConfirmationBodySchema.parse(request.body);

    const conversation = await getConversationForUser(db, id, userId);

    if (!conversation) {
      reply.code(404);
      return { ok: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' };
    }

    if (body.resolved) {
      await resolveConversation(db, id);

      const updated = await getConversationForUser(db, id, userId);
      return { ok: true, conversation: updated };
    }

    // Customer indicated the issue is not resolved — append a system
    // message and keep the current ownership state.
    await appendMessage(
      db,
      id,
      null,
      'system',
      'Customer indicated the issue is not resolved.',
    );

    const updated = await getConversationForUser(db, id, userId);
    return { ok: true, conversation: updated };
  });

  // ── 8. POST /support/conversations/:id/feedback ──────────────────────
  app.post('/support/conversations/:id/feedback', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = conversationIdParamsSchema.parse(request.params);
    const body = feedbackBodySchema.parse(request.body);

    const conversation = await getConversationForUser(db, id, userId);

    if (!conversation) {
      reply.code(404);
      return { ok: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' };
    }

    const feedback = await createFeedback(
      db,
      id,
      userId,
      body.rating,
      body.reason,
      body.messageId,
    );

    reply.code(201);
    return { ok: true, feedback };
  });

  // ── 9. GET /support/cases ────────────────────────────────────────────
  app.get('/support/cases', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const query = caseListQuerySchema.parse(request.query);

    const cases = await listCasesForUser(db, userId, query.limit, query.cursor);

    return {
      ok: true,
      cases,
    };
  });

  // ── 10. GET /support/cases/:id ───────────────────────────────────────
  app.get('/support/cases/:id', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = caseIdParamsSchema.parse(request.params);

    const caseRow = await getCaseForUser(db, id, userId);

    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    const events = await listCaseEvents(db, id);

    return { ok: true, case: caseRow, events };
  });

  // ── 11. POST /support/cases/:id/messages ─────────────────────────────
  app.post('/support/cases/:id/messages', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = caseIdParamsSchema.parse(request.params);
    const body = caseMessageBodySchema.parse(request.body);

    const caseRow = await getCaseForUser(db, id, userId);

    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    if (caseRow.operationalState === 'closed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This case is closed and cannot receive new messages',
        code: 'CASE_CLOSED',
      };
    }

    const event = await appendCaseEvent(
      db,
      id,
      'customer_message',
      userId,
      'customer',
      { body: body.body },
    );

    reply.code(201);
    return { ok: true, event };
  });

  // ── 12. POST /support/cases/:id/appeal ───────────────────────────────
  app.post('/support/cases/:id/appeal', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = caseIdParamsSchema.parse(request.params);
    const body = caseAppealBodySchema.parse(request.body);

    const caseRow = await getCaseForUser(db, id, userId);

    if (!caseRow) {
      reply.code(404);
      return { ok: false, error: 'Case not found', code: 'CASE_NOT_FOUND' };
    }

    const event = await appendCaseEvent(
      db,
      id,
      'appeal_requested',
      userId,
      'customer',
      { reason: body.reason },
    );

    reply.code(201);
    return { ok: true, event };
  });

  // ── 13. GET /support/actions/:id ─────────────────────────────────────
  app.get('/support/actions/:id', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = actionIdParamsSchema.parse(request.params);

    const proposal = await getActionProposal(db, id);

    if (!proposal) {
      reply.code(404);
      return { ok: false, error: 'Action proposal not found', code: 'ACTION_NOT_FOUND' };
    }

    // Verify conversation ownership
    const conversation = await getConversationForUser(
      db,
      proposal.conversationId,
      userId,
    );

    if (!conversation) {
      reply.code(404);
      return { ok: false, error: 'Action proposal not found', code: 'ACTION_NOT_FOUND' };
    }

    return { ok: true, action: proposal };
  });

  // ── 14. POST /support/actions/:id/confirm ────────────────────────────
  app.post('/support/actions/:id/confirm', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = actionIdParamsSchema.parse(request.params);

    const proposal = await getActionProposal(db, id);

    if (!proposal) {
      reply.code(404);
      return { ok: false, error: 'Action proposal not found', code: 'ACTION_NOT_FOUND' };
    }

    // Verify conversation ownership
    const conversation = await getConversationForUser(
      db,
      proposal.conversationId,
      userId,
    );

    if (!conversation) {
      reply.code(404);
      return { ok: false, error: 'Action proposal not found', code: 'ACTION_NOT_FOUND' };
    }

    if (proposal.state !== 'proposed') {
      reply.code(409);
      return {
        ok: false,
        error: 'This action can only be confirmed while in the proposed state',
        code: 'ACTION_NOT_PROPOSED',
      };
    }

    try {
      const confirmed = await confirmActionProposal(db, id);
      return { ok: true, action: confirmed };
    } catch {
      reply.code(409);
      return {
        ok: false,
        error: 'This action can only be confirmed while in the proposed state',
        code: 'ACTION_NOT_PROPOSED',
      };
    }
  });

  // ── 15. POST /support/actions/:id/reject ─────────────────────────────
  app.post('/support/actions/:id/reject', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { id } = actionIdParamsSchema.parse(request.params);

    const proposal = await getActionProposal(db, id);

    if (!proposal) {
      reply.code(404);
      return { ok: false, error: 'Action proposal not found', code: 'ACTION_NOT_FOUND' };
    }

    // Verify conversation ownership
    const conversation = await getConversationForUser(
      db,
      proposal.conversationId,
      userId,
    );

    if (!conversation) {
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

  // ── 16. GET /support/knowledge/search ────────────────────────────────
  app.get('/support/knowledge/search', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const query = knowledgeSearchQuerySchema.parse(request.query);

    const results = await searchKnowledge(db, query.q, { limit: query.limit });

    return { ok: true, results };
  });

  // ── 17. GET /support/knowledge/articles/:slug ────────────────────────
  app.get('/support/knowledge/articles/:slug', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const { slug } = knowledgeArticleParamsSchema.parse(request.params);

    const result = await getArticleBySlug(db, slug);

    if (!result) {
      reply.code(404);
      return { ok: false, error: 'Article not found', code: 'ARTICLE_NOT_FOUND' };
    }

    return { ok: true, article: result.article, version: result.version };
  });
};
