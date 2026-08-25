import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type { FeedbackRating, SupportFeedback } from './contracts.js';

// ── Row types (snake_case, matches DB) ──

interface SupportFeedbackRow {
  id: string;
  conversation_id: string;
  message_id: string | null;
  user_id: string;
  rating: FeedbackRating;
  reason: string | null;
  created_at: string;
}

// ── Serializer ──

function serializeFeedback(row: SupportFeedbackRow): SupportFeedback {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    userId: row.user_id,
    rating: row.rating,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

// ── Public API ──

/**
 * Creates a feedback record for a conversation (optionally targeting a
 * specific message). Returns the created feedback record.
 */
export async function createFeedback(
  db: Pool,
  conversationId: string,
  userId: string,
  rating: FeedbackRating,
  reason?: string,
  messageId?: string,
): Promise<SupportFeedback> {
  const id = `fb_${crypto.randomUUID()}`;

  const result = await db.query<SupportFeedbackRow>(
    `
      INSERT INTO support_feedback
        (id, conversation_id, message_id, user_id, rating, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, conversation_id, message_id, user_id, rating, reason, created_at
    `,
    [id, conversationId, messageId ?? null, userId, rating, reason ?? null],
  );

  return serializeFeedback(result.rows[0]);
}

/**
 * Lists feedback records for a conversation, newest first.
 */
export async function listFeedbackForConversation(
  db: Pool,
  conversationId: string,
): Promise<SupportFeedback[]> {
  const result = await db.query<SupportFeedbackRow>(
    `
      SELECT id, conversation_id, message_id, user_id, rating, reason, created_at
      FROM support_feedback
      WHERE conversation_id = $1
      ORDER BY created_at DESC
    `,
    [conversationId],
  );

  return result.rows.map(serializeFeedback);
}

export { logger };
