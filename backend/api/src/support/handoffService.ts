import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type { HandoffTriggerKind, SupportHandoff } from './contracts.js';
import { updateOwnershipState } from './conversationService.js';

// ── Row types (snake_case, matches DB) ──

interface SupportHandoffRow {
  id: string;
  conversation_id: string;
  case_id: string | null;
  reason: string;
  trigger_kind: HandoffTriggerKind;
  handoff_bundle: Record<string, unknown>;
  queue_team: string | null;
  created_at: string;
}

// ── Serializer ──

function serializeHandoff(row: SupportHandoffRow): SupportHandoff {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    caseId: row.case_id,
    reason: row.reason,
    triggerKind: row.trigger_kind,
    handoffBundle: row.handoff_bundle,
    queueTeam: row.queue_team,
    createdAt: row.created_at,
  };
}

// ── Public API ──

/**
 * Creates a handoff record for a conversation and transitions the
 * conversation's ownership_state to 'human_queued'. The handoff bundle is an
 * opaque JSON payload (e.g. transcript summary, risk signals) that the human
 * queue can consume.
 */
export async function createHandoff(
  db: Pool,
  conversationId: string,
  reason: string,
  triggerKind: HandoffTriggerKind,
  caseId?: string,
  handoffBundle: Record<string, unknown> = {},
  queueTeam?: string,
): Promise<SupportHandoff> {
  const id = `handoff_${crypto.randomUUID()}`;

  const result = await db.query<SupportHandoffRow>(
    `
      INSERT INTO support_handoffs
        (id, conversation_id, case_id, reason, trigger_kind, handoff_bundle, queue_team)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING id, conversation_id, case_id, reason, trigger_kind,
                handoff_bundle, queue_team, created_at
    `,
    [
      id,
      conversationId,
      caseId ?? null,
      reason,
      triggerKind,
      JSON.stringify(handoffBundle),
      queueTeam ?? null,
    ],
  );

  // Transition the conversation into the human queue.
  await updateOwnershipState(db, conversationId, 'human_queued');

  return serializeHandoff(result.rows[0]);
}

/**
 * Lists handoff records for a conversation, newest first.
 */
export async function listHandoffsForConversation(
  db: Pool,
  conversationId: string,
): Promise<SupportHandoff[]> {
  const result = await db.query<SupportHandoffRow>(
    `
      SELECT id, conversation_id, case_id, reason, trigger_kind,
             handoff_bundle, queue_team, created_at
      FROM support_handoffs
      WHERE conversation_id = $1
      ORDER BY created_at DESC
    `,
    [conversationId],
  );

  return result.rows.map(serializeHandoff);
}

export { logger };
