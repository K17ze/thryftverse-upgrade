import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type { CaseEventActorRole, CasePriority, SupportEntryContext } from './contracts.js';
import {
  projectOrderContext,
  projectPayoutContext,
  projectListingContext,
} from './contextProjectionService.js';
import {
  getCaseForUser,
  createCase,
  appendCaseEvent,
} from './caseService.js';
import { searchKnowledge } from './knowledgeService.js';
import type { KnowledgeSearchOptions } from './knowledgeService.js';
import { createHandoff } from './handoffService.js';
import { updateOwnershipState, getConversationForUser } from './conversationService.js';
import {
  evaluateCancellationEligibility,
  evaluateReturnEligibility,
  evaluateBuyerProtectionEligibility,
} from './policyEngine.js';
import type { PolicyDecision } from './policyEngine.js';

// ── Public types ──

export interface SupportTool {
  name: string;
  tier: 'read' | 'mutation';
  riskTier: 'S0' | 'S1' | 'S2' | 'S3';
  argumentSchema: Record<string, unknown>;
  execute: (
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

// ── Row types ──

interface OrderOwnershipRow {
  buyer_id: string;
  seller_id: string;
}

interface OrderParcelEventRow {
  id: string;
  event_type: string;
  provider: string;
  tracking_id: string | null;
  occurred_at: string | null;
  received_at: string;
}

// ── Helpers ──

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw Object.assign(new Error(`Missing or invalid argument: ${key}`), {
      code: 'INVALID_ARGUMENT',
      statusCode: 400,
    });
  }
  return value;
}

function requireStringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    throw Object.assign(new Error(`Missing or invalid argument: ${key}`), {
      code: 'INVALID_ARGUMENT',
      statusCode: 400,
    });
  }
  return value.filter((v): v is string => typeof v === 'string');
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

async function verifyOrderOwnership(
  db: Pool,
  orderId: string,
  userId: string,
): Promise<boolean> {
  const result = await db.query<OrderOwnershipRow>(
    `
      SELECT buyer_id, seller_id
      FROM orders
      WHERE id = $1
    `,
    [orderId],
  );
  if (result.rows.length === 0) {
    return false;
  }
  const row = result.rows[0];
  return row.buyer_id === userId || row.seller_id === userId;
}

// ── Tool implementations ──

const getOrderSnapshotTool: SupportTool = {
  name: 'support.get_order_snapshot',
  tier: 'read',
  riskTier: 'S1',
  argumentSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
    },
    required: ['orderId'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const orderId = requireString(args, 'orderId');
    const snapshot = await projectOrderContext(db, orderId, userId);
    if (!snapshot) {
      return { found: false };
    }
    return { found: true, snapshot };
  },
};

const getParcelSnapshotTool: SupportTool = {
  name: 'support.get_parcel_snapshot',
  tier: 'read',
  riskTier: 'S1',
  argumentSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['orderId'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const orderId = requireString(args, 'orderId');
    const limitArg = args.limit;
    const limit =
      typeof limitArg === 'number' && limitArg > 0
        ? Math.min(Math.trunc(limitArg), 20)
        : 10;

    const authorised = await verifyOrderOwnership(db, orderId, userId);
    if (!authorised) {
      return { found: false, reason: 'Order not found or not accessible' };
    }

    const result = await db.query<OrderParcelEventRow>(
      `
        SELECT id, event_type, provider, tracking_id, occurred_at, received_at
        FROM order_parcel_events
        WHERE order_id = $1
        ORDER BY received_at DESC
        LIMIT $2
      `,
      [orderId, limit],
    );

    return {
      found: true,
      orderId,
      events: result.rows.map((row) => ({
        id: String(row.id),
        eventType: row.event_type,
        provider: row.provider,
        trackingId: row.tracking_id,
        occurredAt: row.occurred_at,
        receivedAt: row.received_at,
      })),
    };
  },
};

const getPayoutStatusTool: SupportTool = {
  name: 'support.get_payout_status',
  tier: 'read',
  riskTier: 'S1',
  argumentSchema: {
    type: 'object',
    properties: {
      payoutId: { type: 'string' },
    },
    required: ['payoutId'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const payoutId = requireString(args, 'payoutId');
    const snapshot = await projectPayoutContext(db, payoutId, userId);
    if (!snapshot) {
      return { found: false };
    }
    return { found: true, snapshot };
  },
};

const getListingSnapshotTool: SupportTool = {
  name: 'support.get_listing_snapshot',
  tier: 'read',
  riskTier: 'S1',
  argumentSchema: {
    type: 'object',
    properties: {
      listingId: { type: 'string' },
    },
    required: ['listingId'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const listingId = requireString(args, 'listingId');
    const snapshot = await projectListingContext(db, listingId);
    if (!snapshot) {
      return { found: false };
    }
    return { found: true, snapshot };
  },
};

const getCaseSnapshotTool: SupportTool = {
  name: 'support.get_case_snapshot',
  tier: 'read',
  riskTier: 'S2',
  argumentSchema: {
    type: 'object',
    properties: {
      caseId: { type: 'string' },
    },
    required: ['caseId'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const caseId = requireString(args, 'caseId');
    const caseRecord = await getCaseForUser(db, caseId, userId);
    if (!caseRecord) {
      return { found: false };
    }
    return { found: true, case: caseRecord };
  },
};

const searchKnowledgeTool: SupportTool = {
  name: 'support.search_knowledge',
  tier: 'read',
  riskTier: 'S0',
  argumentSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query'],
  },
  async execute(
    db: Pool,
    _userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const query = requireString(args, 'query');
    const opts: KnowledgeSearchOptions = {};
    const limitArg = args.limit;
    if (typeof limitArg === 'number' && limitArg > 0) {
      opts.limit = Math.min(Math.trunc(limitArg), 50);
    }
    const results = await searchKnowledge(db, query, opts);
    return { found: results.length > 0, results };
  },
};

const evaluateProcedureEligibilityTool: SupportTool = {
  name: 'support.evaluate_procedure_eligibility',
  tier: 'read',
  riskTier: 'S2',
  argumentSchema: {
    type: 'object',
    properties: {
      procedure: {
        type: 'string',
        enum: ['cancellation', 'return', 'buyer_protection'],
      },
      orderId: { type: 'string' },
    },
    required: ['procedure', 'orderId'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const procedure = requireString(args, 'procedure');
    const orderId = requireString(args, 'orderId');

    let decision: PolicyDecision;
    switch (procedure) {
      case 'cancellation':
        decision = await evaluateCancellationEligibility(db, orderId, userId);
        break;
      case 'return':
        decision = await evaluateReturnEligibility(db, orderId, userId);
        break;
      case 'buyer_protection':
        decision = await evaluateBuyerProtectionEligibility(db, orderId, userId);
        break;
      default:
        throw Object.assign(
          new Error(`Unknown procedure: ${procedure}`),
          { code: 'INVALID_ARGUMENT', statusCode: 400 },
        );
    }

    return { decision };
  },
};

const createCaseTool: SupportTool = {
  name: 'support.create_case',
  tier: 'mutation',
  riskTier: 'S3',
  argumentSchema: {
    type: 'object',
    properties: {
      issueType: { type: 'string' },
      requestedOutcome: { type: 'string' },
      conversationId: { type: 'string' },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
      },
      contextLinkIds: {
        type: 'object',
        properties: {
          order: { type: 'array', items: { type: 'string' } },
          listing: { type: 'array', items: { type: 'string' } },
          payout: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['issueType'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const issueType = requireString(args, 'issueType');
    const requestedOutcome = optionalString(args, 'requestedOutcome');
    const conversationId = optionalString(args, 'conversationId');
    const priorityArg = optionalString(args, 'priority');
    const priority: CasePriority =
      priorityArg === 'low' || priorityArg === 'normal' || priorityArg === 'high' || priorityArg === 'urgent'
        ? priorityArg
        : 'normal';

    // Build context links from the contextLinkIds argument.
    const contextLinks: SupportEntryContext[] = [];
    const ctxArg = args.contextLinkIds;
    if (ctxArg && typeof ctxArg === 'object' && !Array.isArray(ctxArg)) {
      const ctx = ctxArg as Record<string, unknown>;
      const orderIds = requireStringArray(ctx, 'order');
      for (const id of orderIds) {
        contextLinks.push({ kind: 'order', orderId: id });
      }
      const listingIds = requireStringArray(ctx, 'listing');
      for (const id of listingIds) {
        contextLinks.push({ kind: 'listing', listingId: id });
      }
      const payoutIds = requireStringArray(ctx, 'payout');
      for (const id of payoutIds) {
        contextLinks.push({ kind: 'payout', payoutId: id });
      }
    }

    const caseRecord = await createCase(
      db,
      userId,
      issueType,
      requestedOutcome,
      conversationId,
      contextLinks.length > 0 ? contextLinks : undefined,
      priority,
    );

    return { created: true, case: caseRecord };
  },
};

const appendCaseMessageTool: SupportTool = {
  name: 'support.append_case_message',
  tier: 'mutation',
  riskTier: 'S3',
  argumentSchema: {
    type: 'object',
    properties: {
      caseId: { type: 'string' },
      eventType: { type: 'string' },
      message: { type: 'string' },
      isPublic: { type: 'boolean' },
    },
    required: ['caseId', 'eventType', 'message'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const caseId = requireString(args, 'caseId');
    const eventType = requireString(args, 'eventType');
    const message = requireString(args, 'message');
    const isPublicArg = args.isPublic;
    const isPublic = typeof isPublicArg === 'boolean' ? isPublicArg : true;

    // Verify the user owns the case before appending.
    const caseRecord = await getCaseForUser(db, caseId, userId);
    if (!caseRecord) {
      return { appended: false, reason: 'Case not found or not accessible' };
    }

    const actorRole: CaseEventActorRole = 'customer';
    const event = await appendCaseEvent(
      db,
      caseId,
      eventType,
      userId,
      actorRole,
      { message },
      isPublic,
    );

    return { appended: true, event };
  },
};

const requestHumanHandoffTool: SupportTool = {
  name: 'support.request_human_handoff',
  tier: 'mutation',
  riskTier: 'S3',
  argumentSchema: {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['conversationId', 'reason'],
  },
  async execute(
    db: Pool,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const conversationId = requireString(args, 'conversationId');
    const reason = requireString(args, 'reason');

    // Verify the user owns the conversation.
    const conversation = await getConversationForUser(db, conversationId, userId);
    if (!conversation) {
      return { handoffCreated: false, reason: 'Conversation not found or not accessible' };
    }

    const handoff = await createHandoff(
      db,
      conversationId,
      reason,
      'user_request',
    );

    // The createHandoff already transitions ownership to 'human_queued',
    // but we call updateOwnershipState explicitly to be explicit about the
    // state transition in the tool context.
    await updateOwnershipState(db, conversationId, 'human_queued');

    return { handoffCreated: true, handoffId: handoff.id };
  },
};

// ── Tool registry ──

export const SUPPORT_TOOLS: Record<string, SupportTool> = {
  'support.get_order_snapshot': getOrderSnapshotTool,
  'support.get_parcel_snapshot': getParcelSnapshotTool,
  'support.get_payout_status': getPayoutStatusTool,
  'support.get_listing_snapshot': getListingSnapshotTool,
  'support.get_case_snapshot': getCaseSnapshotTool,
  'support.search_knowledge': searchKnowledgeTool,
  'support.evaluate_procedure_eligibility': evaluateProcedureEligibilityTool,
  'support.create_case': createCaseTool,
  'support.append_case_message': appendCaseMessageTool,
  'support.request_human_handoff': requestHumanHandoffTool,
};

export { logger };
