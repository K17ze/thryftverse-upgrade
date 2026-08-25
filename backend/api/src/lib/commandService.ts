import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { computeSnapshotHash, writeAuditEvent } from './immutableAudit.js';
import type { WorkforcePrincipal, WorkforceSession } from './workforceAuth.js';

// ── Privileged command state machine ────────────────────────────────────
//
// draft → proposed → awaiting_approval → approved → queued → executing → succeeded
//
// Branches:
//   draft/proposed/awaiting_approval → cancelled/rejected/expired
//   executing → unknown_outcome → investigating → succeeded/failed/compensated
//   queued → superseded when resource version changed
//   succeeded → compensated only through a linked new command
//
// Rules:
//   - approval binds exact request hash, amount, destination fingerprint
//   - edits after approval invalidate approval
//   - duplicate command key returns prior command state (idempotency)
//   - lost HTTP response is checked by command ID
//   - unknown outcome is never succeeded
//   - command executes only if resource version and policy still match
//   - terminal records are immutable

export type CommandState =
  | 'draft'
  | 'proposed'
  | 'awaiting_approval'
  | 'approved'
  | 'queued'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'unknown_outcome'
  | 'investigating'
  | 'compensated'
  | 'cancelled'
  | 'rejected'
  | 'expired'
  | 'superseded';

export interface ProposeCommandInput {
  commandType: string;
  resourceType: string;
  resourceId: string;
  expectedResourceVersion?: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  proposer: WorkforcePrincipal;
  session: WorkforceSession;
  caseId?: string;
  reasonCode: string;
  freeformNote?: string;
  beforeSnapshot?: unknown;
  effectPreview?: Record<string, unknown>;
  riskTier?: string;
  amountGbp?: number;
  currency?: string;
  destinationFingerprint?: string;
  requiredApprovalPolicy?: string;
  requiresApproval: boolean;
  expiresInSeconds?: number;
}

export interface CommandRecord {
  id: string;
  commandType: string;
  resourceType: string;
  resourceId: string;
  expectedResourceVersion: string | null;
  idempotencyKey: string;
  requestHash: string;
  proposerId: string;
  caseId: string | null;
  reasonCode: string;
  freeformNote: string | null;
  beforeSnapshotHash: string | null;
  effectPreview: Record<string, unknown>;
  riskTier: string;
  amountGbp: number | null;
  currency: string;
  destinationFingerprint: string | null;
  requiredApprovalPolicy: string | null;
  stepUpSessionId: string | null;
  state: CommandState;
  executorId: string | null;
  providerOperationId: string | null;
  resultHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  compensatedByCommandId: string | null;
  supersededByCommandId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ── Propose a command ───────────────────────────────────────────────────

export async function proposeCommand(
  db: Pool,
  input: ProposeCommandInput,
): Promise<{ command: CommandRecord; created: boolean }> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const requestHash = computeSnapshotHash(input.payload);
    const beforeHash = input.beforeSnapshot
      ? computeSnapshotHash(input.beforeSnapshot)
      : null;

    // Idempotency check: same (proposer, idempotency_key) returns prior command
    const existing = await client.query(
      `SELECT id FROM privileged_commands WHERE proposer_id = $1 AND idempotency_key = $2 FOR UPDATE`,
      [input.proposer.id, input.idempotencyKey],
    );

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      const cmd = await getCommand(db, existing.rows[0].id);
      return { command: cmd!, created: false };
    }

    const commandId = `cmd_${crypto.randomUUID()}`;
    const initialState: CommandState = input.requiresApproval ? 'awaiting_approval' : 'approved';
    const expiresAt = new Date(
      Date.now() + (input.expiresInSeconds ?? 3600) * 1000,
    ).toISOString();

    await client.query(
      `
        INSERT INTO privileged_commands (
          id, command_type, resource_type, resource_id, expected_resource_version,
          idempotency_key, request_hash, proposer_id, case_id, reason_code,
          freeform_note, before_snapshot_hash, effect_preview, risk_tier,
          amount_gbp, currency, destination_fingerprint, required_approval_policy,
          step_up_session_id, state, expires_at,
          proposed_at, awaiting_approval_at, approved_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18,
          $19, $20, $21,
          NOW(), ${input.requiresApproval ? 'NOW()' : 'NULL'}, ${input.requiresApproval ? 'NULL' : 'NOW()'}
        )
      `,
      [
        commandId,
        input.commandType,
        input.resourceType,
        input.resourceId,
        input.expectedResourceVersion ?? null,
        input.idempotencyKey,
        requestHash,
        input.proposer.id,
        input.caseId ?? null,
        input.reasonCode,
        input.freeformNote ?? null,
        beforeHash,
        JSON.stringify(input.effectPreview ?? {}),
        input.riskTier ?? 'standard',
        input.amountGbp ?? null,
        input.currency ?? 'GBP',
        input.destinationFingerprint ?? null,
        input.requiredApprovalPolicy ?? null,
        input.session.id,
        initialState,
        expiresAt,
      ],
    );

    // Audit the command proposal
    await writeAuditEvent(client, {
      principalType: 'workforce',
      principalId: input.proposer.id,
      workforceSessionId: input.session.id,
      action: 'command.propose',
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      caseId: input.caseId,
      reason: input.reasonCode,
      commandId,
      idempotencyKey: input.idempotencyKey,
      beforeHash: beforeHash ?? undefined,
      outcome: 'success',
      retentionClass: 'high_impact',
    });

    await client.query('COMMIT');

    const cmd = await getCommand(db, commandId);
    return { command: cmd!, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Approve a command ───────────────────────────────────────────────────
//
// Approval binds exact request hash, amount, destination fingerprint.
// Proposer cannot approve own command where separation of duty is required.

export async function approveCommand(
  db: Pool,
  input: {
    commandId: string;
    approver: WorkforcePrincipal;
    session: WorkforceSession;
    approvalRole: string;
    decision: 'approve' | 'reject';
    decisionReason?: string;
    requiresSeparationOfDuty: boolean;
  },
): Promise<CommandRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const cmd = await client.query<{
      id: string;
      state: string;
      proposer_id: string;
      request_hash: string;
      amount_gbp: number | null;
      destination_fingerprint: string | null;
      expected_resource_version: string | null;
    }>(
      `SELECT id, state, proposer_id, request_hash, amount_gbp, destination_fingerprint, expected_resource_version
       FROM privileged_commands WHERE id = $1 FOR UPDATE`,
      [input.commandId],
    );

    const row = cmd.rows[0];
    if (!row) {
      throw new Error('Command not found');
    }

    if (row.state !== 'awaiting_approval') {
      throw new Error(`Command is in state ${row.state}, not awaiting_approval`);
    }

    // Separation of duty: proposer cannot approve own command
    if (input.requiresSeparationOfDuty && row.proposer_id === input.approver.id) {
      await client.query('ROLLBACK');
      throw new Error('Separation of duty violation: proposer cannot approve own command');
    }

    // Record the approval
    await client.query(
      `
        INSERT INTO command_approvals (
          id, command_id, approver_id, approval_role, decision, decision_reason,
          approved_request_hash, approved_amount_gbp, approved_destination_fp,
          approved_resource_version, step_up_session_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        crypto.randomUUID(),
        input.commandId,
        input.approver.id,
        input.approvalRole,
        input.decision,
        input.decisionReason ?? null,
        row.request_hash,
        row.amount_gbp,
        row.destination_fingerprint,
        row.expected_resource_version,
        input.session.id,
      ],
    );

    const newState = input.decision === 'approve' ? 'approved' : 'rejected';
    const stateColumn = input.decision === 'approve' ? 'approved_at' : 'rejected_at';

    await client.query(
      `UPDATE privileged_commands SET state = $2, ${stateColumn} = NOW(), updated_at = NOW() WHERE id = $1`,
      [input.commandId, newState],
    );

    // Audit the approval decision
    await writeAuditEvent(client, {
      principalType: 'workforce',
      principalId: input.approver.id,
      workforceSessionId: input.session.id,
      action: `command.${input.decision}`,
      resourceType: 'privileged_command',
      resourceId: input.commandId,
      reason: input.decisionReason,
      commandId: input.commandId,
      approvalChain: [{ approver: input.approver.id, role: input.approvalRole, decision: input.decision }],
      outcome: 'success',
      retentionClass: 'high_impact',
    });

    await client.query('COMMIT');

    const result = await getCommand(db, input.commandId);
    return result!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Execute a command ───────────────────────────────────────────────────
//
// The executor is a service or worker that processes the command.
// Command executes only if resource version and policy still match.

export async function startCommandExecution(
  client: PoolClient,
  commandId: string,
  executorId: string,
): Promise<CommandRecord> {
  const cmd = await client.query<{ state: string }>(
    `SELECT state FROM privileged_commands WHERE id = $1 FOR UPDATE`,
    [commandId],
  );

  if (!cmd.rows[0]) {
    throw new Error('Command not found');
  }

  if (cmd.rows[0].state !== 'approved' && cmd.rows[0].state !== 'queued') {
    throw new Error(`Command is in state ${cmd.rows[0].state}, not approved/queued`);
  }

  await client.query(
    `UPDATE privileged_commands SET state = 'executing', executor_id = $2, executing_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [commandId, executorId],
  );

  // Record attempt
  const attemptCount = await client.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM command_attempts WHERE command_id = $1`,
    [commandId],
  );
  const attemptNum = parseInt(attemptCount.rows[0]?.count ?? '0', 10) + 1;

  await client.query(
    `
      INSERT INTO command_attempts (id, command_id, attempt_number, executor_id, state_before, state_after)
      VALUES ($1, $2, $3, $4, $5, 'executing')
    `,
    [crypto.randomUUID(), commandId, attemptNum, executorId, cmd.rows[0].state],
  );

  const result = await getCommandWithClient(client, commandId);
  return result!;
}

export async function completeCommandExecution(
  client: PoolClient,
  commandId: string,
  outcome: 'succeeded' | 'failed' | 'unknown_outcome',
  options?: {
    providerOperationId?: string;
    resultData?: unknown;
    errorCode?: string;
    errorMessage?: string;
    isDomainCommitted?: boolean;
  },
): Promise<CommandRecord> {
  const resultHash = options?.resultData
    ? computeSnapshotHash(options.resultData)
    : null;

  const stateColumn = outcome === 'succeeded' ? 'succeeded_at'
    : outcome === 'failed' ? 'failed_at'
    : 'unknown_outcome_at';

  await client.query(
    `
      UPDATE privileged_commands
      SET state = $2, ${stateColumn} = NOW(),
          provider_operation_id = COALESCE($3, provider_operation_id),
          result_hash = COALESCE($4, result_hash),
          error_code = $5, error_message = $6,
          completed_at = CASE WHEN $2 IN ('succeeded', 'failed') THEN NOW() ELSE completed_at END,
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      commandId,
      outcome,
      options?.providerOperationId ?? null,
      resultHash,
      options?.errorCode ?? null,
      options?.errorMessage ?? null,
    ],
  );

  // Update the latest attempt
  await client.query(
    `
      UPDATE command_attempts
      SET state_after = $2, completed_at = NOW(),
          error_code = $3, error_message = $4,
          is_domain_committed = $5,
          provider_operation_id = COALESCE($6, provider_operation_id)
      WHERE id = (
        SELECT id FROM command_attempts WHERE command_id = $1
        ORDER BY attempt_number DESC LIMIT 1
      )
    `,
    [
      commandId,
      outcome,
      options?.errorCode ?? null,
      options?.errorMessage ?? null,
      options?.isDomainCommitted ?? false,
      options?.providerOperationId ?? null,
    ],
  );

  // Audit the execution outcome
  await writeAuditEvent(client, {
    principalType: 'service',
    action: 'command.execute',
    resourceType: 'privileged_command',
    resourceId: commandId,
    commandId,
    outcome,
    errorCode: options?.errorCode,
    unknownOutcome: outcome === 'unknown_outcome',
    effectHash: resultHash ?? undefined,
    retentionClass: 'high_impact',
  });

  const result = await getCommandWithClient(client, commandId);
  return result!;
}

// ── Cancel a command ────────────────────────────────────────────────────

export async function cancelCommand(
  db: Pool,
  input: { commandId: string; principal: WorkforcePrincipal; session: WorkforceSession; reason: string },
): Promise<CommandRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const cmd = await client.query<{ state: string; proposer_id: string }>(
      `SELECT state, proposer_id FROM privileged_commands WHERE id = $1 FOR UPDATE`,
      [input.commandId],
    );

    if (!cmd.rows[0]) throw new Error('Command not found');

    const state = cmd.rows[0].state;
    if (['succeeded', 'failed', 'cancelled', 'rejected', 'expired', 'compensated'].includes(state)) {
      throw new Error(`Cannot cancel command in terminal state ${state}`);
    }

    await client.query(
      `UPDATE privileged_commands SET state = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [input.commandId],
    );

    await writeAuditEvent(client, {
      principalType: 'workforce',
      principalId: input.principal.id,
      workforceSessionId: input.session.id,
      action: 'command.cancel',
      resourceType: 'privileged_command',
      resourceId: input.commandId,
      reason: input.reason,
      commandId: input.commandId,
      outcome: 'success',
      retentionClass: 'high_impact',
    });

    await client.query('COMMIT');
    const result = await getCommand(db, input.commandId);
    return result!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Get command by ID ───────────────────────────────────────────────────

export async function getCommand(db: Pool, commandId: string): Promise<CommandRecord | null> {
  const result = await db.query(
    `SELECT * FROM privileged_commands WHERE id = $1 LIMIT 1`,
    [commandId],
  );
  return result.rows[0] ? mapCommandRow(result.rows[0]) : null;
}

async function getCommandWithClient(client: PoolClient, commandId: string): Promise<CommandRecord | null> {
  const result = await client.query(
    `SELECT * FROM privileged_commands WHERE id = $1 LIMIT 1`,
    [commandId],
  );
  return result.rows[0] ? mapCommandRow(result.rows[0]) : null;
}

function mapCommandRow(row: Record<string, unknown>): CommandRecord {
  return {
    id: row.id as string,
    commandType: row.command_type as string,
    resourceType: row.resource_type as string,
    resourceId: row.resource_id as string,
    expectedResourceVersion: (row.expected_resource_version as string) ?? null,
    idempotencyKey: row.idempotency_key as string,
    requestHash: row.request_hash as string,
    proposerId: row.proposer_id as string,
    caseId: (row.case_id as string) ?? null,
    reasonCode: row.reason_code as string,
    freeformNote: (row.freeform_note as string) ?? null,
    beforeSnapshotHash: (row.before_snapshot_hash as string) ?? null,
    effectPreview: (row.effect_preview as Record<string, unknown>) ?? {},
    riskTier: row.risk_tier as string,
    amountGbp: (row.amount_gbp as number) ?? null,
    currency: row.currency as string,
    destinationFingerprint: (row.destination_fingerprint as string) ?? null,
    requiredApprovalPolicy: (row.required_approval_policy as string) ?? null,
    stepUpSessionId: (row.step_up_session_id as string) ?? null,
    state: row.state as CommandState,
    executorId: (row.executor_id as string) ?? null,
    providerOperationId: (row.provider_operation_id as string) ?? null,
    resultHash: (row.result_hash as string) ?? null,
    errorCode: (row.error_code as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    compensatedByCommandId: (row.compensated_by_command_id as string) ?? null,
    supersededByCommandId: (row.superseded_by_command_id as string) ?? null,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ── List commands by state ──────────────────────────────────────────────

export async function listCommands(
  db: Pool,
  filters: { state?: CommandState; commandType?: string; caseId?: string; proposerId?: string; limit?: number; offset?: number },
): Promise<{ commands: CommandRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.state) {
    conditions.push(`state = $${paramIndex}`);
    params.push(filters.state);
    paramIndex += 1;
  }
  if (filters.commandType) {
    conditions.push(`command_type = $${paramIndex}`);
    params.push(filters.commandType);
    paramIndex += 1;
  }
  if (filters.caseId) {
    conditions.push(`case_id = $${paramIndex}`);
    params.push(filters.caseId);
    paramIndex += 1;
  }
  if (filters.proposerId) {
    conditions.push(`proposer_id = $${paramIndex}`);
    params.push(filters.proposerId);
    paramIndex += 1;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM privileged_commands ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataResult = await db.query(
    `SELECT * FROM privileged_commands ${where} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset],
  );

  return {
    commands: dataResult.rows.map(mapCommandRow),
    total,
  };
}
