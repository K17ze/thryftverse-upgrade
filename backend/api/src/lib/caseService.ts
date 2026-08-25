import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { writeAuditEvent } from './immutableAudit.js';
import type { WorkforcePrincipal, WorkforceSession } from './workforceAuth.js';

// ── Case service ────────────────────────────────────────────────────────
//
// A case is the operating backbone. Every privileged action links to a
// case for purpose, ownership, SLA, evidence, and review.
//
// Case state machine:
//   new → triaged → assigned → investigating → awaiting_customer/provider/internal
//        → ready_for_decision → resolved → closed
//   Branches: any nonterminal → escalated; resolved/closed → reopened;
//             duplicate → linked_duplicate (never silently deleted)

export type CaseState =
  | 'new'
  | 'triaged'
  | 'assigned'
  | 'investigating'
  | 'awaiting_customer'
  | 'awaiting_provider'
  | 'awaiting_internal'
  | 'ready_for_decision'
  | 'resolved'
  | 'closed'
  | 'escalated'
  | 'linked_duplicate';

export interface CaseRecord {
  id: string;
  type: string;
  subject: string;
  description: string | null;
  legalEntity: string;
  severity: string;
  consumerHarmScore: number;
  financialValueGbp: number;
  status: CaseState;
  ownerId: string | null;
  team: string | null;
  source: string;
  sourceRef: string | null;
  priority: number;
  policyVersion: string | null;
  slaDeadlineAt: string | null;
  slaPausedAt: string | null;
  slaTotalPausedMs: number;
  slaBreachAt: string | null;
  isVulnerableCustomer: boolean;
  reopenCount: number;
  lastReopenReason: string | null;
  duplicateOfCaseId: string | null;
  incidentId: string | null;
  acknowledgedAt: string | null;
  triagedAt: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const VALID_TRANSITIONS: Record<CaseState, CaseState[]> = {
  new: ['triaged', 'escalated', 'linked_duplicate', 'closed'],
  triaged: ['assigned', 'escalated', 'linked_duplicate', 'closed'],
  assigned: ['investigating', 'escalated', 'awaiting_internal', 'closed'],
  investigating: ['awaiting_customer', 'awaiting_provider', 'awaiting_internal', 'ready_for_decision', 'escalated', 'closed'],
  awaiting_customer: ['investigating', 'ready_for_decision', 'escalated', 'closed'],
  awaiting_provider: ['investigating', 'ready_for_decision', 'escalated', 'closed'],
  awaiting_internal: ['investigating', 'ready_for_decision', 'escalated', 'closed'],
  ready_for_decision: ['resolved', 'escalated', 'closed'],
  resolved: ['closed', 'escalated'],
  closed: ['new'], // reopen → goes back through new
  escalated: ['triaged', 'assigned', 'investigating', 'ready_for_decision', 'resolved', 'closed'],
  linked_duplicate: [],
};

// ── Create a case ───────────────────────────────────────────────────────

export async function createCase(
  db: Pool,
  input: {
    type: string;
    subject: string;
    description?: string;
    severity?: string;
    consumerHarmScore?: number;
    financialValueGbp?: number;
    source?: string;
    sourceRef?: string;
    isVulnerableCustomer?: boolean;
    principal: WorkforcePrincipal;
    session: WorkforceSession;
  },
): Promise<CaseRecord> {
  const caseId = `case_${crypto.randomUUID()}`;
  const severity = input.severity ?? 'normal';
  const harmScore = input.consumerHarmScore ?? 0;
  const priority = computePriority(severity, harmScore, input.financialValueGbp ?? 0);
  const slaDeadline = computeSlaDeadline(severity, harmScore, input.isVulnerableCustomer ?? false);

  await db.query(
    `
      INSERT INTO ops_cases (
        id, type, subject, description, legal_entity, severity,
        consumer_harm_score, financial_value_gbp, status, team, source, source_ref,
        priority, sla_deadline_at, is_vulnerable_customer, acknowledged_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, 'new', $9, $10, $11,
        $12, $13, $14, NOW()
      )
    `,
    [
      caseId,
      input.type,
      input.subject,
      input.description ?? null,
      input.principal.legalEntity,
      severity,
      harmScore,
      input.financialValueGbp ?? 0,
      input.principal.team,
      input.source ?? 'manual',
      input.sourceRef ?? null,
      priority,
      slaDeadline?.toISOString() ?? null,
      input.isVulnerableCustomer ?? false,
    ],
  );

  // Record state history
  await db.query(
    `INSERT INTO ops_case_state_history (id, case_id, to_status, actor_id, reason) VALUES ($1, $2, 'new', $3, $4)`,
    [crypto.randomUUID(), caseId, input.principal.id, 'Case created'],
  );

  // Audit
  await writeAuditEvent(db, {
    principalType: 'workforce',
    principalId: input.principal.id,
    workforceSessionId: input.session.id,
    action: 'case.create',
    resourceType: 'ops_case',
    resourceId: caseId,
    caseId,
    reason: input.subject,
    outcome: 'success',
    retentionClass: 'standard',
  });

  const result = await getCase(db, caseId);
  return result!;
}

// ── Transition case state ───────────────────────────────────────────────

export async function transitionCaseState(
  db: Pool,
  input: {
    caseId: string;
    toStatus: CaseState;
    principal: WorkforcePrincipal;
    session: WorkforceSession;
    reason?: string;
  },
): Promise<CaseRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query<{ status: string }>(
      `SELECT status FROM ops_cases WHERE id = $1 FOR UPDATE`,
      [input.caseId],
    );

    if (!current.rows[0]) {
      throw new Error('Case not found');
    }

    const fromStatus = current.rows[0].status as CaseState;
    const allowed = VALID_TRANSITIONS[fromStatus] ?? [];

    // Reopen: closed → new (with reopen_count increment)
    if (fromStatus === 'closed' && input.toStatus === 'new') {
      await client.query(
        `UPDATE ops_cases SET status = 'new', reopen_count = reopen_count + 1,
         last_reopen_reason = $2, resolved_at = NULL, closed_at = NULL,
         acknowledged_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [input.caseId, input.reason ?? 'Reopened'],
      );
    } else if (!allowed.includes(input.toStatus)) {
      throw new Error(`Invalid transition: ${fromStatus} → ${input.toStatus}`);
    } else {
      const stateColumns: Record<string, string> = {
        triaged: 'triaged_at',
        assigned: 'assigned_at',
        resolved: 'resolved_at',
        closed: 'closed_at',
      };
      const extraSet = stateColumns[input.toStatus]
        ? `, ${stateColumns[input.toStatus]} = NOW()`
        : '';

      await client.query(
        `UPDATE ops_cases SET status = $2, updated_at = NOW()${extraSet} WHERE id = $1`,
        [input.caseId, input.toStatus],
      );
    }

    // Record state history
    await client.query(
      `INSERT INTO ops_case_state_history (id, case_id, from_status, to_status, actor_id, reason) VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), input.caseId, fromStatus, input.toStatus, input.principal.id, input.reason ?? null],
    );

    // Audit
    await writeAuditEvent(client, {
      principalType: 'workforce',
      principalId: input.principal.id,
      workforceSessionId: input.session.id,
      action: 'case.transition',
      resourceType: 'ops_case',
      resourceId: input.caseId,
      caseId: input.caseId,
      reason: input.reason,
      outcome: 'success',
      retentionClass: 'standard',
    });

    await client.query('COMMIT');
    const result = await getCase(db, input.caseId);
    return result!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Assign a case ───────────────────────────────────────────────────────

export async function assignCase(
  db: Pool,
  input: {
    caseId: string;
    assigneeId: string;
    team?: string;
    principal: WorkforcePrincipal;
    session: WorkforceSession;
  },
): Promise<CaseRecord> {
  await db.query(
    `UPDATE ops_cases SET owner_id = $2, team = COALESCE($3, team), status = CASE WHEN status = 'new' OR status = 'triaged' THEN 'assigned' ELSE status END, assigned_at = COALESCE(assigned_at, NOW()), updated_at = NOW() WHERE id = $1`,
    [input.caseId, input.assigneeId, input.team ?? null],
  );

  await writeAuditEvent(db, {
    principalType: 'workforce',
    principalId: input.principal.id,
    workforceSessionId: input.session.id,
    action: 'case.assign',
    resourceType: 'ops_case',
    resourceId: input.caseId,
    caseId: input.caseId,
    reason: `Assigned to ${input.assigneeId}`,
    outcome: 'success',
    retentionClass: 'standard',
  });

  const result = await getCase(db, input.caseId);
  return result!;
}

// ── Add evidence to a case ──────────────────────────────────────────────

export async function addEvidence(
  db: Pool,
  input: {
    caseId: string;
    source: string;
    objectRef: string;
    objectHash?: string;
    objectType?: string;
    sensitivity?: string;
    sourceRef?: string;
    metadata?: Record<string, unknown>;
    principal: WorkforcePrincipal;
  },
): Promise<void> {
  await db.query(
    `
      INSERT INTO ops_evidence (id, case_id, source, source_ref, object_ref, object_hash, object_type, sensitivity, metadata, added_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      crypto.randomUUID(),
      input.caseId,
      input.source,
      input.sourceRef ?? null,
      input.objectRef,
      input.objectHash ?? null,
      input.objectType ?? null,
      input.sensitivity ?? 'standard',
      JSON.stringify(input.metadata ?? {}),
      input.principal.id,
    ],
  );
}

// ── Add a note to a case (append-only) ──────────────────────────────────

export async function addNote(
  db: Pool,
  input: {
    caseId: string;
    body: string;
    isInternal?: boolean;
    correctsNoteId?: string;
    principal: WorkforcePrincipal;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO ops_notes (id, case_id, author_id, body, is_internal, corrects_note_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      crypto.randomUUID(),
      input.caseId,
      input.principal.id,
      input.body,
      input.isInternal ?? true,
      input.correctsNoteId ?? null,
    ],
  );
}

// ── Link an entity to a case ────────────────────────────────────────────

export async function linkEntity(
  db: Pool,
  input: {
    caseId: string;
    entityType: string;
    entityId: string;
    relationship?: string;
    principal: WorkforcePrincipal;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO ops_case_entities (id, case_id, entity_type, entity_id, relationship, added_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (case_id, entity_type, entity_id) DO NOTHING`,
    [crypto.randomUUID(), input.caseId, input.entityType, input.entityId, input.relationship ?? 'subject', input.principal.id],
  );
}

// ── Get a case ──────────────────────────────────────────────────────────

export async function getCase(db: Pool, caseId: string): Promise<CaseRecord | null> {
  const result = await db.query(`SELECT * FROM ops_cases WHERE id = $1 LIMIT 1`, [caseId]);
  return result.rows[0] ? mapCaseRow(result.rows[0]) : null;
}

// ── List cases (work queue) ─────────────────────────────────────────────

export async function listCases(
  db: Pool,
  filters: {
    status?: CaseState[];
    ownerId?: string;
    team?: string;
    type?: string;
    minPriority?: number;
    slaBreached?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ cases: CaseRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status && filters.status.length > 0) {
    const placeholders = filters.status.map((_, i) => `$${paramIndex + i}`).join(', ');
    conditions.push(`status IN (${placeholders})`);
    params.push(...filters.status);
    paramIndex += filters.status.length;
  }
  if (filters.ownerId) {
    conditions.push(`owner_id = $${paramIndex}`);
    params.push(filters.ownerId);
    paramIndex += 1;
  }
  if (filters.team) {
    conditions.push(`team = $${paramIndex}`);
    params.push(filters.team);
    paramIndex += 1;
  }
  if (filters.type) {
    conditions.push(`type = $${paramIndex}`);
    params.push(filters.type);
    paramIndex += 1;
  }
  if (filters.minPriority !== undefined) {
    conditions.push(`priority <= $${paramIndex}`);
    params.push(filters.minPriority);
    paramIndex += 1;
  }
  if (filters.slaBreached) {
    conditions.push(`sla_breach_at IS NOT NULL`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM ops_cases ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataResult = await db.query(
    `SELECT * FROM ops_cases ${where} ORDER BY priority ASC, sla_deadline_at ASC NULLS LAST, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset],
  );

  return {
    cases: dataResult.rows.map(mapCaseRow),
    total,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function computePriority(severity: string, harmScore: number, valueGbp: number): number {
  // 1 = highest priority, 10 = lowest
  let priority = 5;
  if (severity === 'critical') priority = 1;
  else if (severity === 'high') priority = 2;
  else if (severity === 'elevated') priority = 3;
  else if (harmScore >= 8) priority = Math.min(priority, 2);
  else if (harmScore >= 5) priority = Math.min(priority, 3);
  else if (valueGbp >= 1000) priority = Math.min(priority, 3);
  else if (valueGbp >= 100) priority = Math.min(priority, 4);
  return priority;
}

function computeSlaDeadline(severity: string, harmScore: number, vulnerable: boolean): Date | null {
  const now = Date.now();
  let hours = 48; // default

  if (vulnerable || harmScore >= 8) hours = 4;
  else if (severity === 'critical') hours = 8;
  else if (severity === 'high') hours = 16;
  else if (severity === 'elevated') hours = 24;

  return new Date(now + hours * 3600 * 1000);
}

function mapCaseRow(row: Record<string, unknown>): CaseRecord {
  return {
    id: row.id as string,
    type: row.type as string,
    subject: row.subject as string,
    description: (row.description as string) ?? null,
    legalEntity: row.legal_entity as string,
    severity: row.severity as string,
    consumerHarmScore: row.consumer_harm_score as number,
    financialValueGbp: Number(row.financial_value_gbp),
    status: row.status as CaseState,
    ownerId: (row.owner_id as string) ?? null,
    team: (row.team as string) ?? null,
    source: row.source as string,
    sourceRef: (row.source_ref as string) ?? null,
    priority: row.priority as number,
    policyVersion: (row.policy_version as string) ?? null,
    slaDeadlineAt: (row.sla_deadline_at as string) ?? null,
    slaPausedAt: (row.sla_paused_at as string) ?? null,
    slaTotalPausedMs: Number(row.sla_total_paused_ms),
    slaBreachAt: (row.sla_breach_at as string) ?? null,
    isVulnerableCustomer: row.is_vulnerable_customer as boolean,
    reopenCount: row.reopen_count as number,
    lastReopenReason: (row.last_reopen_reason as string) ?? null,
    duplicateOfCaseId: (row.duplicate_of_case_id as string) ?? null,
    incidentId: (row.incident_id as string) ?? null,
    acknowledgedAt: (row.acknowledged_at as string) ?? null,
    triagedAt: (row.triaged_at as string) ?? null,
    assignedAt: (row.assigned_at as string) ?? null,
    resolvedAt: (row.resolved_at as string) ?? null,
    closedAt: (row.closed_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
