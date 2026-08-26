import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import { encryptMessageBody, resolveMessageBody } from '../lib/messageEncryption.js';
import type {
  ConversationOwnershipState,
  MessageAuthorRole,
  SupportConversation,
  SupportEntryContext,
  SupportMessage,
} from './contracts.js';

// ── Row types (snake_case, matches DB) ──

interface SupportConversationRow {
  id: string;
  user_id: string;
  context_kind: SupportEntryContext['kind'];
  context_id: string | null;
  ownership_state: ConversationOwnershipState;
  title: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
}

interface SupportMessageRow {
  id: string;
  conversation_id: string;
  author_id: string | null;
  author_role: MessageAuthorRole;
  body: string;
  body_ciphertext: string | null;
  key_version: number | null;
  citations: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Serializers ──

function serializeConversation(row: SupportConversationRow): SupportConversation {
  return {
    id: row.id,
    userId: row.user_id,
    contextKind: row.context_kind,
    contextId: row.context_id,
    ownershipState: row.ownership_state,
    title: row.title,
    locale: row.locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function serializeMessageAsync(row: SupportMessageRow): Promise<SupportMessage> {
  const body = await resolveMessageBody(row.id, row.body, row.body_ciphertext);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorId: row.author_id,
    authorRole: row.author_role,
    body,
    citations: row.citations,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

// ── Helpers ──

function contextKindOf(context: SupportEntryContext): SupportEntryContext['kind'] {
  return context.kind;
}

function contextIdOf(context: SupportEntryContext): string | null {
  if (context.kind === 'general') {
    return null;
  }
  // All non-general variants carry a single id-like field.
  return (
    (context as { orderId?: string }).orderId ??
    (context as { listingId?: string }).listingId ??
    (context as { payoutId?: string }).payoutId ??
    (context as { reportId?: string }).reportId ??
    (context as { auctionId?: string }).auctionId ??
    (context as { assetId?: string }).assetId ??
    (context as { importJobId?: string }).importJobId ??
    (context as { mediaJobId?: string }).mediaJobId ??
    null
  );
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
 * Creates a new support conversation for a user, seeds the first system
 * message, and registers the customer as the first participant. Returns the
 * created conversation record.
 */
export async function createConversation(
  db: Pool,
  userId: string,
  context: SupportEntryContext,
  locale = 'en',
): Promise<SupportConversation> {
  const id = `conv_${crypto.randomUUID()}`;
  const contextKind = contextKindOf(context);
  const contextId = contextIdOf(context);
  const title = context.kind === 'general' ? 'Support' : `Support · ${context.kind}`;

  await db.query(
    `
      INSERT INTO support_conversations
        (id, user_id, context_kind, context_id, ownership_state, title, locale)
      VALUES ($1, $2, $3, $4, 'ai_active', $5, $6)
    `,
    [id, userId, contextKind, contextId, title, locale],
  );

  // Seed the opening system message so the thread is never empty.
  const messageId = `msg_${crypto.randomUUID()}`;
  const seedBody = 'How can we help you today? Reply with your question and our assistant will respond.';

  // Dual-write encryption for the seed system message.
  let seedCiphertext: string | null = null;
  let seedKeyVersion: number | null = null;
  let seedStoredBody = seedBody;
  try {
    const encrypted = await encryptMessageBody(messageId, seedBody);
    seedCiphertext = encrypted.ciphertext;
    seedKeyVersion = encrypted.keyVersion;
    seedStoredBody = '[encrypted]';
  } catch {
    // Graceful degradation — plaintext stored, backfill will encrypt later.
  }

  await db.query(
    `
      INSERT INTO support_messages
        (id, conversation_id, author_id, author_role, body, body_ciphertext, key_version, citations, metadata)
      VALUES ($1, $2, NULL, 'system', $3, $4, $5, '[]'::jsonb, '{}'::jsonb)
    `,
    [messageId, id, seedStoredBody, seedCiphertext, seedKeyVersion],
  );

  // Register the customer as the first participant.
  await db.query(
    `
      INSERT INTO support_participants (conversation_id, user_id, role)
      VALUES ($1, $2, 'customer')
      ON CONFLICT DO NOTHING
    `,
    [id, userId],
  );

  const result = await db.query<SupportConversationRow>(
    `
      SELECT id, user_id, context_kind, context_id, ownership_state,
             title, locale, created_at, updated_at
      FROM support_conversations
      WHERE id = $1
    `,
    [id],
  );

  return serializeConversation(result.rows[0]);
}

/**
 * Returns a conversation by id, regardless of caller identity. Use
 * `getConversationForUser` when the caller's identity must be verified.
 */
export async function getConversation(
  db: Pool,
  conversationId: string,
): Promise<SupportConversation | null> {
  const result = await db.query<SupportConversationRow>(
    `
      SELECT id, user_id, context_kind, context_id, ownership_state,
             title, locale, created_at, updated_at
      FROM support_conversations
      WHERE id = $1
    `,
    [conversationId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return serializeConversation(result.rows[0]);
}

/**
 * Returns a conversation only if it belongs to the given user.
 */
export async function getConversationForUser(
  db: Pool,
  conversationId: string,
  userId: string,
): Promise<SupportConversation | null> {
  const result = await db.query<SupportConversationRow>(
    `
      SELECT id, user_id, context_kind, context_id, ownership_state,
             title, locale, created_at, updated_at
      FROM support_conversations
      WHERE id = $1 AND user_id = $2
    `,
    [conversationId, userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return serializeConversation(result.rows[0]);
}

/**
 * Paginated list of a user's conversations, newest activity first. The cursor
 * is the `updated_at` value of the last item in the previous page (ISO 8601).
 */
export async function listConversationsForUser(
  db: Pool,
  userId: string,
  limit?: number,
  cursor?: string,
): Promise<SupportConversation[]> {
  const pageLimit = clampLimit(limit);

  if (cursor) {
    const result = await db.query<SupportConversationRow>(
      `
        SELECT id, user_id, context_kind, context_id, ownership_state,
               title, locale, created_at, updated_at
        FROM support_conversations
        WHERE user_id = $1 AND updated_at < $2
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      [userId, cursor, pageLimit],
    );
    return result.rows.map(serializeConversation);
  }

  const result = await db.query<SupportConversationRow>(
    `
      SELECT id, user_id, context_kind, context_id, ownership_state,
             title, locale, created_at, updated_at
      FROM support_conversations
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `,
    [userId, pageLimit],
  );
  return result.rows.map(serializeConversation);
}

/**
 * Appends a message to a conversation and bumps the conversation's updated_at.
 */
export async function appendMessage(
  db: Pool,
  conversationId: string,
  authorId: string | null,
  authorRole: MessageAuthorRole,
  body: string,
  citations: unknown[] = [],
  metadata: Record<string, unknown> = {},
): Promise<SupportMessage> {
  const id = `msg_${crypto.randomUUID()}`;

  // Dual-write encryption: try to encrypt the body. If the key service is
  // unavailable, fall back to plaintext (graceful degradation — the
  // backfill worker will encrypt it later).
  let bodyCiphertext: string | null = null;
  let keyVersion: number | null = null;
  let storedBody = body;

  try {
    const encrypted = await encryptMessageBody(id, body);
    bodyCiphertext = encrypted.ciphertext;
    keyVersion = encrypted.keyVersion;
    storedBody = '[encrypted]';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { messageId: id, err: message },
      'supportMessage.encryptionFailed',
    );
    // Graceful degradation: store plaintext, backfill worker will encrypt later.
  }

  const result = await db.query<SupportMessageRow>(
    `
      WITH inserted AS (
        INSERT INTO support_messages
          (id, conversation_id, author_id, author_role, body, body_ciphertext, key_version, citations, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
        RETURNING id, conversation_id, author_id, author_role, body,
                  body_ciphertext, key_version, citations, metadata, created_at
      ),
      bumped AS (
        UPDATE support_conversations
        SET updated_at = NOW()
        WHERE id = $2
        RETURNING 1
      )
      SELECT * FROM inserted
    `,
    [
      id,
      conversationId,
      authorId,
      authorRole,
      storedBody,
      bodyCiphertext,
      keyVersion,
      JSON.stringify(citations),
      JSON.stringify(metadata),
    ],
  );

  return serializeMessageAsync(result.rows[0]);
}

/**
 * Paginated list of messages in a conversation, oldest first. The cursor is
 * the `created_at` value of the last item in the previous page (ISO 8601).
 */
export async function listMessages(
  db: Pool,
  conversationId: string,
  limit?: number,
  cursor?: string,
): Promise<SupportMessage[]> {
  const pageLimit = clampLimit(limit);

  if (cursor) {
    const result = await db.query<SupportMessageRow>(
      `
        SELECT id, conversation_id, author_id, author_role, body,
               body_ciphertext, key_version,
               citations, metadata, created_at
        FROM support_messages
        WHERE conversation_id = $1 AND created_at > $2
        ORDER BY created_at ASC
        LIMIT $3
      `,
      [conversationId, cursor, pageLimit],
    );
    return Promise.all(result.rows.map(serializeMessageAsync));
  }

  const result = await db.query<SupportMessageRow>(
    `
      SELECT id, conversation_id, author_id, author_role, body,
             body_ciphertext, key_version,
             citations, metadata, created_at
      FROM support_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [conversationId, pageLimit],
  );
  return Promise.all(result.rows.map(serializeMessageAsync));
}

/**
 * Updates the ownership state of a conversation and refreshes updated_at.
 */
export async function updateOwnershipState(
  db: Pool,
  conversationId: string,
  newState: ConversationOwnershipState,
): Promise<void> {
  await db.query(
    `
      UPDATE support_conversations
      SET ownership_state = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [conversationId, newState],
  );
}

/**
 * Marks a conversation as resolved.
 */
export async function resolveConversation(
  db: Pool,
  conversationId: string,
): Promise<void> {
  await updateOwnershipState(db, conversationId, 'resolved');
}

/**
 * Marks a conversation as closed.
 */
export async function closeConversation(
  db: Pool,
  conversationId: string,
): Promise<void> {
  await updateOwnershipState(db, conversationId, 'closed');
}

export { logger };
