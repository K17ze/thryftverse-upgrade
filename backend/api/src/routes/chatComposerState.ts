import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

/**
 * P0-7: Cross-device chat composer state persistence.
 *
 * Previously the composer draft, reply target and pending attachment
 * references lived only in React state on the device that opened the
 * conversation. These routes persist that state per (user, conversation)
 * so a draft started on one device restores on another.
 */

type ChatComposerStateRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const MAX_DRAFT_TEXT = 8_000;
const MAX_PENDING_ATTACHMENTS = 8;

const upsertSchema = z.object({
  draftText: z.string().max(MAX_DRAFT_TEXT).default(''),
  replyToMessageId: z.string().min(1).max(120).nullable().optional(),
  pendingAttachments: z
    .array(
      z.object({
        kind: z.enum(['image', 'video', 'file', 'audio']),
        objectKey: z.string().min(1).max(512),
        finalizationId: z.string().min(1).max(120),
        fileName: z.string().max(180).optional(),
        contentType: z.string().max(120).optional(),
        sizeBytes: z.number().int().nonnegative().max(500 * 1024 * 1024).optional(),
      }).strict(),
    )
    .max(MAX_PENDING_ATTACHMENTS)
    .default([]),
  activeBotId: z.string().min(1).max(120).nullable().optional(),
  linkedListingId: z.string().min(1).max(120).nullable().optional(),
  schemaVersion: z.number().int().min(1).max(100).default(1),
  metadata: z.record(z.unknown()).default({}),
});

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1).max(120),
});

type ComposerStateRow = {
  draft_text: string;
  reply_to_message_id: string | null;
  pending_attachments: unknown;
  active_bot_id: string | null;
  linked_listing_id: string | null;
  schema_version: number;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ComposerStateRow) {
  return {
    draftText: row.draft_text,
    replyToMessageId: row.reply_to_message_id,
    pendingAttachments: row.pending_attachments,
    activeBotId: row.active_bot_id,
    linkedListingId: row.linked_listing_id,
    schemaVersion: row.schema_version,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type Queryable = Pick<PoolClient, 'query'> | Pick<Pool, 'query'>;

async function assertMembership(
  db: Queryable,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM chat_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
    [conversationId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

function containsDeviceLocalReference(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.startsWith('file://')
      || normalized.startsWith('content://')
      || normalized.startsWith('ph://')
      || normalized.startsWith('assets-library://');
  }
  if (Array.isArray(value)) {
    return value.some(containsDeviceLocalReference);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => key.toLowerCase() === 'localuri'
        || containsDeviceLocalReference(nested),
    );
  }
  return false;
}

export const registerChatComposerStateRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: ChatComposerStateRouteDependencies) => {
  /**
   * GET /chat/conversations/:conversationId/composer-state
   *
   * Returns the calling user's composer state for the conversation. If no
   * state has been persisted yet, returns an empty default — callers do
   * not need to distinguish "no row" from "cleared row".
   */
  app.get('/chat/conversations/:conversationId/composer-state', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);

    if (!(await assertMembership(db, conversationId, actorUserId))) {
      reply.code(403);
      return { ok: false, error: 'Not a member of this conversation' };
    }

    const result = await db.query<ComposerStateRow>(
      `SELECT draft_text, reply_to_message_id, pending_attachments,
              active_bot_id, linked_listing_id, schema_version, metadata,
              created_at::text, updated_at::text
       FROM chat_composer_state
       WHERE user_id = $1 AND conversation_id = $2
       LIMIT 1`,
      [actorUserId, conversationId],
    );

    if (!result.rowCount) {
      return {
        ok: true,
        state: {
          draftText: '',
          replyToMessageId: null,
          pendingAttachments: [],
          activeBotId: null,
          linkedListingId: null,
          schemaVersion: 1,
          metadata: {},
          createdAt: null,
          updatedAt: null,
        },
      };
    }

    return { ok: true, state: mapRow(result.rows[0]) };
  });

  /**
   * PUT /chat/conversations/:conversationId/composer-state
   *
   * Upserts the calling user's composer state for the conversation. The
   * full state is replaced on each call — the client is expected to send
   * the complete composer snapshot (draft + reply + attachments + bot +
   * linked listing). Partial updates are not supported to avoid
   * cross-device merge ambiguity.
   *
   * Debounce on the client: do not call this on every keystroke. A 1–2s
   * debounce plus an explicit call on background/app-close is the
   * intended usage.
   */
  app.put('/chat/conversations/:conversationId/composer-state', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const payload = upsertSchema.parse(request.body);

    if (containsDeviceLocalReference(payload.metadata)) {
      reply.code(422);
      return {
        ok: false,
        error: 'Device-local references cannot be persisted across devices',
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      if (!(await assertMembership(client, conversationId, actorUserId))) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Not a member of this conversation' };
      }

      if (payload.replyToMessageId) {
        const replyTarget = await client.query(
          `SELECT 1
           FROM chat_messages
           WHERE id = $1 AND conversation_id = $2
           LIMIT 1`,
          [payload.replyToMessageId, conversationId],
        );
        if (!replyTarget.rowCount) {
          await client.query('ROLLBACK');
          reply.code(422);
          return { ok: false, error: 'Reply target is not part of this conversation' };
        }
      }

      for (const attachment of payload.pendingAttachments) {
        const finalized = await client.query<{
          object_key: string;
          owner_id: string;
          status: string;
          scope: string;
          scope_ref_id: string | null;
          media_status: string | null;
        }>(
          `SELECT finalization.object_key, finalization.owner_id,
                  finalization.status, finalization.scope,
                  finalization.scope_ref_id,
                  asset.status AS media_status
           FROM upload_finalizations finalization
           LEFT JOIN media_assets asset
             ON asset.id = finalization.media_asset_id
           WHERE finalization.id = $1
           LIMIT 1
           FOR UPDATE`,
          [attachment.finalizationId],
        );
        const verified = finalized.rows[0];
        const terminalStatuses = new Set([
          'upload_expired',
          'integrity_failed',
          'quarantined',
          'rejected',
          'revoked',
          'deleted',
        ]);
        if (
          !verified
          || verified.owner_id !== actorUserId
          || verified.status !== 'finalized'
          || verified.object_key !== attachment.objectKey
          || !['general', 'chat_attachment'].includes(verified.scope)
          || (
            verified.scope_ref_id !== null
            && verified.scope_ref_id !== conversationId
          )
          || (
            verified.media_status !== null
            && terminalStatuses.has(verified.media_status)
          )
        ) {
          await client.query('ROLLBACK');
          reply.code(422);
          return {
            ok: false,
            error: 'Pending attachment is not a usable upload owned by this user',
          };
        }

        await client.query(
          `UPDATE upload_finalizations
           SET scope = 'chat_attachment',
               scope_ref_id = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [attachment.finalizationId, conversationId],
        );
      }

      const result = await client.query<ComposerStateRow>(
        `INSERT INTO chat_composer_state (
           user_id, conversation_id,
           draft_text, reply_to_message_id, pending_attachments,
           active_bot_id, linked_listing_id,
           schema_version, metadata
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb)
         ON CONFLICT (user_id, conversation_id) DO UPDATE
         SET draft_text = EXCLUDED.draft_text,
             reply_to_message_id = EXCLUDED.reply_to_message_id,
             pending_attachments = EXCLUDED.pending_attachments,
             active_bot_id = EXCLUDED.active_bot_id,
             linked_listing_id = EXCLUDED.linked_listing_id,
             schema_version = EXCLUDED.schema_version,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()
         RETURNING draft_text, reply_to_message_id, pending_attachments,
                   active_bot_id, linked_listing_id, schema_version, metadata,
                   created_at::text, updated_at::text`,
        [
          actorUserId,
          conversationId,
          payload.draftText,
          payload.replyToMessageId ?? null,
          JSON.stringify(payload.pendingAttachments ?? []),
          payload.activeBotId ?? null,
          payload.linkedListingId ?? null,
          payload.schemaVersion,
          JSON.stringify(payload.metadata ?? {}),
        ],
      );
      await client.query('COMMIT');
      return { ok: true, state: mapRow(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /chat/conversations/:conversationId/composer-state
   *
   * Clears the calling user's composer state for the conversation.
   * Typically called after a successful send so the draft does not
   * restore on the next open.
   */
  app.delete('/chat/conversations/:conversationId/composer-state', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { conversationId } = conversationParamsSchema.parse(request.params);

    if (!(await assertMembership(db, conversationId, actorUserId))) {
      reply.code(403);
      return { ok: false, error: 'Not a member of this conversation' };
    }

    await db.query(
      `DELETE FROM chat_composer_state WHERE user_id = $1 AND conversation_id = $2`,
      [actorUserId, conversationId],
    );
    return { ok: true };
  });
};
