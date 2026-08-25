import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  decryptJsonPayload,
  encryptJsonPayload,
} from '../lib/keyService.js';
import { publishRealtimeEvent } from '../lib/realtime.js';

type QueueUserNotificationInput = {
  userId: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type SecureMessagesRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  ensureUserExists: (userId: string) => Promise<void>;
  queueUserNotification: (input: QueueUserNotificationInput) => Promise<string | null>;
};

class SecureMessageAccessError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.statusCode = code === 'UNAUTHORIZED' ? 401 : 403;
  }
}

async function ensureSecureMessageConversationAccess(
  db: Pool,
  conversationId: string,
  userId: string
): Promise<void> {
  const result = await db.query<{ exists: boolean }>(
    `
      SELECT 1 AS exists
      FROM chat_members
      WHERE conversation_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [conversationId, userId]
  );

  if (!result.rowCount) {
    throw new SecureMessageAccessError(
      'FORBIDDEN_CONVERSATION_ACCESS',
      'Forbidden: authenticated user is not a member of this conversation'
    );
  }
}

export const registerSecureMessagesRoutes = ({
  app,
  db,
  ensureUserExists,
  queueUserNotification,
}: SecureMessagesRouteDependencies) => {
  app.post('/secure-messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' };
    }

    const bodySchema = z.object({
      conversationId: z.string().min(2).max(80),
      recipientId: z.string().min(2),
      message: z.string().min(1).max(4000),
    });

    const payload = bodySchema.parse(request.body);
    const senderId = authUserId;

    await ensureUserExists(senderId);
    await ensureUserExists(payload.recipientId);

    try {
      await ensureSecureMessageConversationAccess(db, payload.conversationId, senderId);
    } catch (error) {
      if (error instanceof SecureMessageAccessError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.code, message: error.message };
      }
      throw error;
    }

    const aad = `secure-message:${payload.conversationId}:${senderId}:${payload.recipientId}`;
    const encrypted = await encryptJsonPayload(
      'message',
      {
        message: payload.message,
        sentAt: new Date().toISOString(),
      },
      aad
    );

    const result = await db.query<{ id: number; created_at: string }>(
      `
      INSERT INTO secure_messages (
        conversation_id,
        sender_id,
        recipient_id,
        ciphertext,
        key_version
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at
    `,
      [
        payload.conversationId,
        senderId,
        payload.recipientId,
        encrypted.ciphertext,
        encrypted.keyVersion,
      ]
    );

    publishRealtimeEvent({
      topic: `chat.conversation:${payload.conversationId}`,
      type: 'chat.message.created',
      payload: {
        id: result.rows[0].id,
        conversationId: payload.conversationId,
        senderId,
        recipientId: payload.recipientId,
        sentAt: result.rows[0].created_at,
      },
    });

    if (senderId !== payload.recipientId) {
      try {
        await queueUserNotification({
          userId: payload.recipientId,
          title: 'New message',
          body: 'You have a new secure message in Thryftverse.',
          payload: {
            conversationId: payload.conversationId,
            messageId: result.rows[0].id,
            senderId,
            event: 'chat_message',
          },
          metadata: {
            source: 'secure_messages',
          },
        });
      } catch (error) {
        request.log.error({ err: error }, 'Failed to queue push notification for secure message');
      }
    }

    reply.code(201);
    return {
      ok: true,
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  });

  app.get('/secure-messages/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' };
    }

    const paramsSchema = z.object({ conversationId: z.string().min(2).max(80) });
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    });

    const { conversationId } = paramsSchema.parse(request.params);
    const { limit } = querySchema.parse(request.query);

    try {
      await ensureSecureMessageConversationAccess(db, conversationId, authUserId);
    } catch (error) {
      if (error instanceof SecureMessageAccessError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.code, message: error.message };
      }
      throw error;
    }

    const result = await db.query<{
      id: number;
      conversation_id: string;
      sender_id: string;
      recipient_id: string;
      ciphertext: string;
      key_version: number;
      created_at: string;
    }>(
      `
      SELECT id, conversation_id, sender_id, recipient_id, ciphertext, key_version, created_at
      FROM secure_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
      [conversationId, limit]
    );

    const messages = [] as Array<{
      id: number;
      senderId: string;
      recipientId: string;
      message: string;
      sentAt: string;
      keyVersion: number;
    }>;

    for (const row of result.rows) {
      const aad = `secure-message:${row.conversation_id}:${row.sender_id}:${row.recipient_id}`;
      const decrypted = await decryptJsonPayload<{
        message: string;
        sentAt?: string;
      }>(row.ciphertext, aad);

      messages.push({
        id: row.id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        message: decrypted.message,
        sentAt: decrypted.sentAt ?? row.created_at,
        keyVersion: row.key_version,
      });
    }

    return {
      ok: true,
      conversationId,
      items: messages,
    };
  });
};
