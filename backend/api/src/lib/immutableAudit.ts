import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { logger } from './logger.js';

// ── Types ───────────────────────────────────────────────────────────────

export interface AuditEventInput {
  principalType: string;
  principalId?: string;
  workforceSessionId?: string;
  idpSubject?: string;
  impersonatedBy?: string;
  delegationRef?: string;
  deviceId?: string;
  devicePosture?: Record<string, unknown>;
  sourceIp?: string;
  networkZone?: string;
  userAgentHash?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  legalEntity?: string;
  caseId?: string;
  purpose?: string;
  reason?: string;
  authzPolicyId?: string;
  authzPolicyVersion?: string;
  authzDecision?: string;
  matchedGrants?: unknown[];
  approvalChain?: unknown[];
  stepUpAssurance?: number;
  commandId?: string;
  idempotencyKey?: string;
  requestTraceId?: string;
  beforeHash?: string;
  afterHash?: string;
  effectHash?: string;
  outcome?: string;
  errorCode?: string;
  unknownOutcome?: boolean;
  retentionClass?: string;
}

export interface AuditEvent extends AuditEventInput {
  id: string;
  eventVersion: number;
  sequenceNumber: number;
  occurredAt: string;
  recordedAt: string;
  previousEventHash: string | null;
  eventHash: string;
  createdAt: string;
}

// ── Immutable audit writer ──────────────────────────────────────────────
//
// For high-impact commands, this MUST be called within the same transaction
// as the domain state write (fail-closed). If the audit write fails, the
// entire transaction rolls back.
//
// For low-risk reads, the caller may use a non-transactional pool query,
// but loss budget must be explicit and local spool encrypted/durable.

export async function writeAuditEvent(
  client: Pool | PoolClient,
  input: AuditEventInput,
): Promise<{ eventId: string; sequenceNumber: number; eventHash: string }> {
  const {
    principalType,
    principalId,
    workforceSessionId,
    idpSubject,
    impersonatedBy,
    delegationRef,
    deviceId,
    devicePosture,
    sourceIp,
    networkZone,
    userAgentHash,
    action,
    resourceType,
    resourceId,
    legalEntity,
    caseId,
    purpose,
    reason,
    authzPolicyId,
    authzPolicyVersion,
    authzDecision,
    matchedGrants,
    approvalChain,
    stepUpAssurance,
    commandId,
    idempotencyKey,
    requestTraceId,
    beforeHash,
    afterHash,
    effectHash,
    outcome = 'success',
    errorCode,
    unknownOutcome = false,
    retentionClass = 'standard',
  } = input;

  // The trigger populates sequence_number, previous_event_hash, and event_hash.
  // We insert with NULL for those columns and let the BEFORE INSERT trigger
  // compute them.
  const result = await client.query<{
    id: string;
    sequence_number: string;
    event_hash: string;
  }>(
    `
      INSERT INTO immutable_audit_events (
        principal_type, principal_id, workforce_session_id, idp_subject,
        impersonated_by, delegation_ref,
        device_id, device_posture, source_ip, network_zone, user_agent_hash,
        action, resource_type, resource_id, legal_entity,
        case_id, purpose, reason,
        authz_policy_id, authz_policy_version, authz_decision, matched_grants,
        approval_chain, step_up_assurance,
        command_id, idempotency_key, request_trace_id,
        before_hash, after_hash, effect_hash,
        outcome, error_code, unknown_outcome,
        retention_class
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24,
        $25, $26, $27,
        $28, $29, $30,
        $31, $32, $33,
        $34
      )
      RETURNING id, sequence_number::TEXT, event_hash
    `,
    [
      principalType,
      principalId ?? null,
      workforceSessionId ?? null,
      idpSubject ?? null,
      impersonatedBy ?? null,
      delegationRef ?? null,
      deviceId ?? null,
      JSON.stringify(devicePosture ?? {}),
      sourceIp ?? null,
      networkZone ?? null,
      userAgentHash ?? null,
      action,
      resourceType ?? null,
      resourceId ?? null,
      legalEntity ?? null,
      caseId ?? null,
      purpose ?? null,
      reason ?? null,
      authzPolicyId ?? null,
      authzPolicyVersion ?? null,
      authzDecision ?? null,
      JSON.stringify(matchedGrants ?? []),
      JSON.stringify(approvalChain ?? []),
      stepUpAssurance ?? null,
      commandId ?? null,
      idempotencyKey ?? null,
      requestTraceId ?? null,
      beforeHash ?? null,
      afterHash ?? null,
      effectHash ?? null,
      outcome,
      errorCode ?? null,
      unknownOutcome,
      retentionClass,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('[immutableAudit] Failed to write audit event — no row returned');
  }

  // Write to the transactional outbox for WORM sink streaming.
  await client.query(
    `
      INSERT INTO audit_outbox (event_id, payload, target_sink)
      SELECT $1, to_jsonb(t), 'worm-primary'
      FROM (
        SELECT
          id, event_version, sequence_number, occurred_at, recorded_at,
          principal_type, principal_id, action, resource_type, resource_id,
          command_id, outcome, event_hash, previous_event_hash
        FROM immutable_audit_events WHERE id = $1
      ) t
    `,
    [row.id],
  );

  return {
    eventId: row.id,
    sequenceNumber: parseInt(row.sequence_number, 10),
    eventHash: row.event_hash,
  };
}

// ── Query audit events (permission-gated, access itself is audited) ─────

export interface AuditQueryFilters {
  principalId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  caseId?: string;
  commandId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export async function queryAuditEvents(
  db: Pool,
  filters: AuditQueryFilters,
): Promise<{ events: AuditEvent[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.principalId) {
    conditions.push(`principal_id = $${paramIndex}`);
    params.push(filters.principalId);
    paramIndex += 1;
  }
  if (filters.action) {
    conditions.push(`action = $${paramIndex}`);
    params.push(filters.action);
    paramIndex += 1;
  }
  if (filters.resourceType) {
    conditions.push(`resource_type = $${paramIndex}`);
    params.push(filters.resourceType);
    paramIndex += 1;
  }
  if (filters.resourceId) {
    conditions.push(`resource_id = $${paramIndex}`);
    params.push(filters.resourceId);
    paramIndex += 1;
  }
  if (filters.caseId) {
    conditions.push(`case_id = $${paramIndex}`);
    params.push(filters.caseId);
    paramIndex += 1;
  }
  if (filters.commandId) {
    conditions.push(`command_id = $${paramIndex}`);
    params.push(filters.commandId);
    paramIndex += 1;
  }
  if (filters.startDate) {
    conditions.push(`occurred_at >= $${paramIndex}`);
    params.push(filters.startDate.toISOString());
    paramIndex += 1;
  }
  if (filters.endDate) {
    conditions.push(`occurred_at <= $${paramIndex}`);
    params.push(filters.endDate.toISOString());
    paramIndex += 1;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM immutable_audit_events ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataParams = [...params, limit, offset];
  const dataResult = await db.query(
    `
      SELECT * FROM immutable_audit_events
      ${whereClause}
      ORDER BY sequence_number DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    dataParams,
  );

  const events = dataResult.rows.map((row) => ({
    id: row.id,
    eventVersion: row.event_version,
    sequenceNumber: parseInt(row.sequence_number, 10),
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    principalType: row.principal_type,
    principalId: row.principal_id,
    workforceSessionId: row.workforce_session_id,
    idpSubject: row.idp_subject,
    impersonatedBy: row.impersonated_by,
    delegationRef: row.delegation_ref,
    deviceId: row.device_id,
    devicePosture: row.device_posture,
    sourceIp: row.source_ip,
    networkZone: row.network_zone,
    userAgentHash: row.user_agent_hash,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    legalEntity: row.legal_entity,
    caseId: row.case_id,
    purpose: row.purpose,
    reason: row.reason,
    authzPolicyId: row.authz_policy_id,
    authzPolicyVersion: row.authz_policy_version,
    authzDecision: row.authz_decision,
    matchedGrants: row.matched_grants,
    approvalChain: row.approval_chain,
    stepUpAssurance: row.step_up_assurance,
    commandId: row.command_id,
    idempotencyKey: row.idempotency_key,
    requestTraceId: row.request_trace_id,
    beforeHash: row.before_hash,
    afterHash: row.after_hash,
    effectHash: row.effect_hash,
    outcome: row.outcome,
    errorCode: row.error_code,
    unknownOutcome: row.unknown_outcome,
    previousEventHash: row.previous_event_hash,
    eventHash: row.event_hash,
    retentionClass: row.retention_class,
    createdAt: row.created_at,
  })) as AuditEvent[];

  return { events, total };
}

// ── Chain verification ──────────────────────────────────────────────────

export async function verifyAuditChain(
  db: Pool,
  options?: { fromSequence?: number; toSequence?: number },
): Promise<{
  verified: boolean;
  gaps: number[];
  hashMismatches: number[];
  totalEvents: number;
  lastSequence: number;
  lastHash: string;
}> {
  const fromSeq = options?.fromSequence ?? 1;
  const toSeq = options?.toSequence;

  const result = await db.query<{
    sequence_number: string;
    event_hash: string;
    previous_event_hash: string | null;
  }>(
    `
      SELECT sequence_number::TEXT, event_hash, previous_event_hash
      FROM immutable_audit_events
      WHERE sequence_number >= $1 ${toSeq ? `AND sequence_number <= $2` : ''}
      ORDER BY sequence_number ASC
    `,
    toSeq ? [fromSeq, toSeq] : [fromSeq],
  );

  // Also verify HMAC recomputation for a sample of events to detect
  // field-level tampering (not just chain linkage breaks).
  // This catches the case where an attacker modifies a field but keeps
  // the old hash — the chain linkage would still appear intact.
  const sampleVerify = await db.query<{
    sequence_number: string;
    stored_hash: string;
    recomputed_hash: string;
  }>(
    `
      SELECT sequence_number::TEXT,
        event_hash AS stored_hash,
        compute_audit_event_hash(
          sequence_number, previous_event_hash, chain_key_id,
          action, principal_id, principal_type,
          resource_type, resource_id, command_id, case_id,
          reason, authz_decision, matched_grants, approval_chain,
          effect_hash, before_hash, after_hash,
          outcome, unknown_outcome, occurred_at
        ) AS recomputed_hash
      FROM immutable_audit_events
      WHERE sequence_number >= $1 ${toSeq ? `AND sequence_number <= $2` : ''}
      ORDER BY sequence_number ASC
    `,
    toSeq ? [fromSeq, toSeq] : [fromSeq],
  );

  const gaps: number[] = [];
  const hashMismatches: number[] = [];
  let expectedPrev: string | null = null;
  let expectedSeq = fromSeq;
  let lastSequence = 0;
  let lastHash = '';

  for (const row of result.rows) {
    const seq = parseInt(row.sequence_number, 10);

    if (seq !== expectedSeq) {
      gaps.push(expectedSeq);
    }

    if (expectedPrev !== null && row.previous_event_hash !== expectedPrev) {
      hashMismatches.push(seq);
    }

    expectedPrev = row.event_hash;
    expectedSeq = seq + 1;
    lastSequence = seq;
    lastHash = row.event_hash;
  }

  // Check HMAC recomputation mismatches (field-level tampering detection)
  for (const row of sampleVerify.rows) {
    if (row.stored_hash !== row.recomputed_hash) {
      const seq = parseInt(row.sequence_number, 10);
      if (!hashMismatches.includes(seq)) {
        hashMismatches.push(seq);
      }
    }
  }

  return {
    verified: gaps.length === 0 && hashMismatches.length === 0,
    gaps,
    hashMismatches,
    totalEvents: result.rows.length,
    lastSequence,
    lastHash,
  };
}

// ── Hash computation helper (for before/after snapshots) ────────────────

export function computeSnapshotHash(data: unknown): string {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

// ── Log audit access (access to audit is itself audited) ────────────────

export async function logAuditAccess(
  db: Pool,
  input: {
    accessorId: string;
    queryParams: Record<string, unknown>;
    resultCount: number;
    caseId?: string;
    reasonCode: string;
  },
): Promise<void> {
  try {
    await db.query(
      `
        INSERT INTO audit_access_log (id, accessor_id, query_params, result_count, case_id, reason_code)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        crypto.randomUUID(),
        input.accessorId,
        JSON.stringify(input.queryParams),
        input.resultCount,
        input.caseId ?? null,
        input.reasonCode,
      ],
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[immutableAudit] failed to log audit access');
  }
}
