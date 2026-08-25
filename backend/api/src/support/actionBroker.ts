import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type {
  ActionProposalState,
  SupportActionProposal,
} from './contracts.js';

// ── Row types (snake_case, matches DB) ──

interface SupportActionProposalRow {
  id: string;
  conversation_id: string;
  case_id: string | null;
  run_id: string | null;
  tool_name: string;
  canonical_arguments: Record<string, unknown>;
  arguments_hash: string;
  target_type: string;
  target_id: string;
  consequence_summary: string;
  policy_decision_id: string | null;
  resource_version: string;
  expires_at: string;
  state: ActionProposalState;
  created_at: string;
  updated_at: string;
}

// ── Serializer ──

function serializeActionProposal(
  row: SupportActionProposalRow,
): SupportActionProposal {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    caseId: row.case_id,
    runId: row.run_id,
    toolName: row.tool_name,
    canonicalArguments: row.canonical_arguments,
    argumentsHash: row.arguments_hash,
    targetType: row.target_type,
    targetId: row.target_id,
    consequenceSummary: row.consequence_summary,
    policyDecisionId: row.policy_decision_id,
    resourceVersion: row.resource_version,
    expiresAt: row.expires_at,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Helpers ──

function hashArguments(argumentsJson: string): string {
  return crypto.createHash('sha256').update(argumentsJson).digest('hex');
}

// ── Public API ──

/**
 * Creates a new action proposal record in the 'proposed' state. The proposal
 * records the tool the AI agent wants to invoke, the canonical arguments, the
 * target entity, and a human-readable consequence summary. The proposal must
 * be confirmed by the customer before execution.
 */
export async function createActionProposal(
  db: Pool,
  input: {
    conversationId: string;
    caseId?: string | null;
    runId?: string | null;
    toolName: string;
    canonicalArguments: Record<string, unknown>;
    targetType: string;
    targetId: string;
    consequenceSummary: string;
    policyDecisionId?: string | null;
    resourceVersion?: string;
    expiresAt?: string | null;
  },
): Promise<SupportActionProposal> {
  const id = `act_${crypto.randomUUID()}`;
  const argumentsJson = JSON.stringify(input.canonicalArguments);
  const argumentsHash = hashArguments(argumentsJson);
  const resourceVersion = input.resourceVersion ?? '1';
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const result = await db.query<SupportActionProposalRow>(
    `
      INSERT INTO support_action_proposals
        (id, conversation_id, case_id, run_id, tool_name, canonical_arguments,
         arguments_hash, target_type, target_id, consequence_summary,
         policy_decision_id, resource_version, expires_at, state)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, 'proposed')
      RETURNING id, conversation_id, case_id, run_id, tool_name,
                canonical_arguments, arguments_hash, target_type, target_id,
                consequence_summary, policy_decision_id, resource_version,
                expires_at, state, created_at, updated_at
    `,
    [
      id,
      input.conversationId,
      input.caseId ?? null,
      input.runId ?? null,
      input.toolName,
      argumentsJson,
      argumentsHash,
      input.targetType,
      input.targetId,
      input.consequenceSummary,
      input.policyDecisionId ?? null,
      resourceVersion,
      expiresAt,
    ],
  );

  return serializeActionProposal(result.rows[0]);
}

/**
 * Returns an action proposal by id, regardless of caller identity. The route
 * layer is responsible for verifying conversation ownership.
 */
export async function getActionProposal(
  db: Pool,
  proposalId: string,
): Promise<SupportActionProposal | null> {
  const result = await db.query<SupportActionProposalRow>(
    `
      SELECT id, conversation_id, case_id, run_id, tool_name,
             canonical_arguments, arguments_hash, target_type, target_id,
             consequence_summary, policy_decision_id, resource_version,
             expires_at, state, created_at, updated_at
      FROM support_action_proposals
      WHERE id = $1
    `,
    [proposalId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return serializeActionProposal(result.rows[0]);
}

/**
 * Transitions a proposal from 'proposed' to 'confirmed'. Only proposals in the
 * 'proposed' state can be confirmed. Returns the updated proposal.
 */
export async function confirmActionProposal(
  db: Pool,
  proposalId: string,
): Promise<SupportActionProposal> {
  const result = await db.query<SupportActionProposalRow>(
    `
      UPDATE support_action_proposals
      SET state = 'confirmed', updated_at = NOW()
      WHERE id = $1 AND state = 'proposed'
      RETURNING id, conversation_id, case_id, run_id, tool_name,
                canonical_arguments, arguments_hash, target_type, target_id,
                consequence_summary, policy_decision_id, resource_version,
                expires_at, state, created_at, updated_at
    `,
    [proposalId],
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('Action proposal not found or not in proposed state'), {
      code: 'ACTION_NOT_PROPOSED',
      statusCode: 409,
    });
  }

  logger.info(
    { proposalId },
    '[actionBroker] action proposal confirmed',
  );

  return serializeActionProposal(result.rows[0]);
}

/**
 * Transitions a proposal from 'proposed' to 'rejected'. Only proposals in the
 * 'proposed' state can be rejected. Returns the updated proposal.
 */
export async function rejectActionProposal(
  db: Pool,
  proposalId: string,
): Promise<SupportActionProposal> {
  const result = await db.query<SupportActionProposalRow>(
    `
      UPDATE support_action_proposals
      SET state = 'rejected', updated_at = NOW()
      WHERE id = $1 AND state = 'proposed'
      RETURNING id, conversation_id, case_id, run_id, tool_name,
                canonical_arguments, arguments_hash, target_type, target_id,
                consequence_summary, policy_decision_id, resource_version,
                expires_at, state, created_at, updated_at
    `,
    [proposalId],
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('Action proposal not found or not in proposed state'), {
      code: 'ACTION_NOT_PROPOSED',
      statusCode: 409,
    });
  }

  logger.info(
    { proposalId },
    '[actionBroker] action proposal rejected',
  );

  return serializeActionProposal(result.rows[0]);
}

/**
 * Records the execution result of a confirmed proposal. Transitions the state
 * to 'succeeded', 'failed', or 'unknown_outcome' based on the result.
 */
export async function recordExecutionResult(
  db: Pool,
  proposalId: string,
  resultState: 'succeeded' | 'failed' | 'unknown_outcome',
  executionResult?: Record<string, unknown>,
): Promise<SupportActionProposal> {
  const result = await db.query<SupportActionProposalRow>(
    `
      UPDATE support_action_proposals
      SET state = $2,
          execution_result = COALESCE($3::jsonb, execution_result),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, conversation_id, case_id, run_id, tool_name,
                canonical_arguments, arguments_hash, target_type, target_id,
                consequence_summary, policy_decision_id, resource_version,
                expires_at, state, created_at, updated_at
    `,
    [proposalId, resultState, executionResult ? JSON.stringify(executionResult) : null],
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('Action proposal not found'), {
      code: 'ACTION_NOT_FOUND',
      statusCode: 404,
    });
  }

  logger.info(
    { proposalId, resultState },
    '[actionBroker] execution result recorded',
  );

  return serializeActionProposal(result.rows[0]);
}

export { logger };
