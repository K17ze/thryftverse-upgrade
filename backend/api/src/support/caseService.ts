import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type {
  CaseEventActorRole,
  CaseOperationalState,
  CasePriority,
  CaseResolutionDisposition,
  SupportCase,
  SupportCaseEvent,
  SupportEntryContext,
} from './contracts.js';

// ── Row types (snake_case, matches DB) ──

interface SupportCaseRow {
  id: string;
  conversation_id: string | null;
  user_id: string;
  issue_type: string;
  requested_outcome: string | null;
  operational_state: CaseOperationalState;
  resolution_disposition: CaseResolutionDisposition | null;
  priority: CasePriority;
  risk_flags: unknown[];
  assigned_team: string | null;
  assigned_operator_id: string | null;
  policy_version_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportCaseEventRow {
  id: string;
  case_id: string;
  event_type: string;
  actor_id: string | null;
  actor_role: CaseEventActorRole;
  payload: Record<string, unknown>;
  is_public: boolean;
  created_at: string;
}

// ── Serializers ──

function serializeCase(row: SupportCaseRow): SupportCase {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    issueType: row.issue_type,
    requestedOutcome: row.requested_outcome,
    operationalState: row.operational_state,
    resolutionDisposition: row.resolution_disposition,
    priority: row.priority,
    riskFlags: row.risk_flags,
    assignedTeam: row.assigned_team,
    assignedOperatorId: row.assigned_operator_id,
    policyVersionId: row.policy_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeCaseEvent(row: SupportCaseEventRow): SupportCaseEvent {
  return {
    id: row.id,
    caseId: row.case_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    payload: row.payload,
    isPublic: row.is_public,
    createdAt: row.created_at,
  };
}

// ── Helpers ──

interface CaseContextLink {
  kind: Exclude<SupportEntryContext['kind'], 'general'>;
  id: string;
}

function extractContextLinks(
  contextLinks: SupportEntryContext[] | undefined,
): CaseContextLink[] {
  if (!contextLinks || contextLinks.length === 0) {
    return [];
  }

  const links: CaseContextLink[] = [];
  for (const ctx of contextLinks) {
    if (ctx.kind === 'general') {
      continue;
    }
    const id =
      (ctx as { orderId?: string }).orderId ??
      (ctx as { listingId?: string }).listingId ??
      (ctx as { payoutId?: string }).payoutId ??
      (ctx as { reportId?: string }).reportId ??
      (ctx as { auctionId?: string }).auctionId ??
      (ctx as { assetId?: string }).assetId ??
      (ctx as { importJobId?: string }).importJobId ??
      (ctx as { mediaJobId?: string }).mediaJobId ??
      null;
    if (id) {
      links.push({ kind: ctx.kind, id });
    }
  }
  return links;
}

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
}

// ── Public API ──

/**
 * Creates a new support case, links any provided context objects, and emits
 * the initial `case_created` event. Returns the created case record.
 */
export async function createCase(
  db: Pool,
  userId: string,
  issueType: string,
  requestedOutcome?: string,
  conversationId?: string,
  contextLinks?: SupportEntryContext[],
  priority: CasePriority = 'normal',
): Promise<SupportCase> {
  const id = `case_${crypto.randomUUID()}`;
  const links = extractContextLinks(contextLinks);

  await db.query(
    `
      INSERT INTO support_cases
        (id, conversation_id, user_id, issue_type, requested_outcome,
         operational_state, priority)
      VALUES ($1, $2, $3, $4, $5, 'new', $6)
    `,
    [id, conversationId ?? null, userId, issueType, requestedOutcome ?? null, priority],
  );

  // Link context objects.
  for (const link of links) {
    await db.query(
      `
        INSERT INTO support_case_links (case_id, context_kind, context_id)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `,
      [id, link.kind, link.id],
    );
  }

  // Initial timeline event.
  await appendCaseEvent(db, id, 'case_created', userId, 'customer', {
    issueType,
    requestedOutcome: requestedOutcome ?? null,
    priority,
    contextLinks: links,
  });

  const result = await db.query<SupportCaseRow>(
    `
      SELECT id, conversation_id, user_id, issue_type, requested_outcome,
             operational_state, resolution_disposition, priority, risk_flags,
             assigned_team, assigned_operator_id, policy_version_id,
             created_at, updated_at
      FROM support_cases
      WHERE id = $1
    `,
    [id],
  );

  return serializeCase(result.rows[0]);
}

/**
 * Returns a case by id, regardless of caller identity. Use
 * `getCaseForUser` when the caller's identity must be verified.
 */
export async function getCase(db: Pool, caseId: string): Promise<SupportCase | null> {
  const result = await db.query<SupportCaseRow>(
    `
      SELECT id, conversation_id, user_id, issue_type, requested_outcome,
             operational_state, resolution_disposition, priority, risk_flags,
             assigned_team, assigned_operator_id, policy_version_id,
             created_at, updated_at
      FROM support_cases
      WHERE id = $1
    `,
    [caseId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return serializeCase(result.rows[0]);
}

/**
 * Returns a case only if it belongs to the given user.
 */
export async function getCaseForUser(
  db: Pool,
  caseId: string,
  userId: string,
): Promise<SupportCase | null> {
  const result = await db.query<SupportCaseRow>(
    `
      SELECT id, conversation_id, user_id, issue_type, requested_outcome,
             operational_state, resolution_disposition, priority, risk_flags,
             assigned_team, assigned_operator_id, policy_version_id,
             created_at, updated_at
      FROM support_cases
      WHERE id = $1 AND user_id = $2
    `,
    [caseId, userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return serializeCase(result.rows[0]);
}

/**
 * Paginated list of a user's cases, newest first. The cursor is the
 * `created_at` value of the last item in the previous page (ISO 8601).
 */
export async function listCasesForUser(
  db: Pool,
  userId: string,
  limit?: number,
  cursor?: string,
): Promise<SupportCase[]> {
  const pageLimit = clampLimit(limit);

  if (cursor) {
    const result = await db.query<SupportCaseRow>(
      `
        SELECT id, conversation_id, user_id, issue_type, requested_outcome,
               operational_state, resolution_disposition, priority, risk_flags,
               assigned_team, assigned_operator_id, policy_version_id,
               created_at, updated_at
        FROM support_cases
        WHERE user_id = $1 AND created_at < $2
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [userId, cursor, pageLimit],
    );
    return result.rows.map(serializeCase);
  }

  const result = await db.query<SupportCaseRow>(
    `
      SELECT id, conversation_id, user_id, issue_type, requested_outcome,
             operational_state, resolution_disposition, priority, risk_flags,
             assigned_team, assigned_operator_id, policy_version_id,
             created_at, updated_at
      FROM support_cases
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, pageLimit],
  );
  return result.rows.map(serializeCase);
}

/**
 * Appends an event to a case's event-sourced timeline.
 */
export async function appendCaseEvent(
  db: Pool,
  caseId: string,
  eventType: string,
  actorId: string | null,
  actorRole: CaseEventActorRole,
  payload: Record<string, unknown> = {},
  isPublic = true,
): Promise<SupportCaseEvent> {
  const id = `cevt_${crypto.randomUUID()}`;

  const result = await db.query<SupportCaseEventRow>(
    `
      INSERT INTO support_case_events
        (id, case_id, event_type, actor_id, actor_role, payload, is_public)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING id, case_id, event_type, actor_id, actor_role, payload,
                is_public, created_at
    `,
    [id, caseId, eventType, actorId, actorRole, JSON.stringify(payload), isPublic],
  );

  return serializeCaseEvent(result.rows[0]);
}

/**
 * Lists events for a case, oldest first. Private events are filtered out
 * unless `includePrivate` is true.
 */
export async function listCaseEvents(
  db: Pool,
  caseId: string,
  includePrivate = false,
): Promise<SupportCaseEvent[]> {
  if (includePrivate) {
    const result = await db.query<SupportCaseEventRow>(
      `
        SELECT id, case_id, event_type, actor_id, actor_role, payload,
               is_public, created_at
        FROM support_case_events
        WHERE case_id = $1
        ORDER BY created_at ASC
      `,
      [caseId],
    );
    return result.rows.map(serializeCaseEvent);
  }

  const result = await db.query<SupportCaseEventRow>(
    `
      SELECT id, case_id, event_type, actor_id, actor_role, payload,
             is_public, created_at
      FROM support_case_events
      WHERE case_id = $1 AND is_public = TRUE
      ORDER BY created_at ASC
    `,
    [caseId],
  );
  return result.rows.map(serializeCaseEvent);
}

/**
 * Records an assignment for a case and updates the case's assigned operator
 * and team. Previous active assignments for the case are marked transferred.
 */
export async function assignCase(
  db: Pool,
  caseId: string,
  operatorId?: string,
  team?: string,
  assignedBy?: string,
): Promise<void> {
  const id = `asgn_${crypto.randomUUID()}`;

  // Retire any prior active assignments for this case.
  await db.query(
    `
      UPDATE support_assignments
      SET state = 'transferred'
      WHERE case_id = $1 AND state = 'active'
    `,
    [caseId],
  );

  await db.query(
    `
      INSERT INTO support_assignments
        (id, case_id, operator_id, team, assigned_by, state)
      VALUES ($1, $2, $3, $4, $5, 'active')
    `,
    [id, caseId, operatorId ?? null, team ?? null, assignedBy ?? null],
  );

  await db.query(
    `
      UPDATE support_cases
      SET assigned_operator_id = $2, assigned_team = $3, updated_at = NOW()
      WHERE id = $1
    `,
    [caseId, operatorId ?? null, team ?? null],
  );
}

/**
 * Updates the operational state of a case and refreshes updated_at.
 */
export async function updateCaseState(
  db: Pool,
  caseId: string,
  newState: CaseOperationalState,
): Promise<void> {
  await db.query(
    `
      UPDATE support_cases
      SET operational_state = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [caseId, newState],
  );
}

/**
 * Resolves a case: sets operational_state to 'resolved' and records the
 * resolution disposition.
 */
export async function resolveCase(
  db: Pool,
  caseId: string,
  disposition: CaseResolutionDisposition,
): Promise<void> {
  await db.query(
    `
      UPDATE support_cases
      SET operational_state = 'resolved',
          resolution_disposition = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [caseId, disposition],
  );
}

export { logger };
