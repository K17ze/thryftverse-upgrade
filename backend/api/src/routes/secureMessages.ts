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
  queueUserNotification: (input: QueueUserNotificationInput) => Promise<void>;
};

export const registerSecureMessagesRoutes = ({
  app,
  db,
  ensureUserExists,
  queueUserNotification,
}: SecureMessagesRouteDependencies) => {
  app.post('/secure-messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({
      conversationId: z.string().min(2).max(80),
      senderId: z.string().min(2),
      recipientId: z.string().min(2),
      message: z.string().min(1).max(4000),
    });

    const payload = bodySchema.parse(request.body);
    await ensureUserExists(payload.senderId);
    await ensureUserExists(payload.recipientId);

    const aad = `secure-message:${payload.conversationId}:${payload.senderId}:${payload.recipientId}`;
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
        payload.senderId,
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
        senderId: payload.senderId,
        recipientId: payload.recipientId,
        sentAt: result.rows[0].created_at,
      },
    });

    if (payload.senderId !== payload.recipientId) {
      try {
        await queueUserNotification({
          userId: payload.recipientId,
          title: 'New message',
          body: 'You have a new secure message in Thryftverse.',
          payload: {
            conversationId: payload.conversationId,
            messageId: result.rows[0].id,
            senderId: payload.senderId,
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

  app.get('/secure-messages/:conversationId', async (request: FastifyRequest) => {
    const paramsSchema = z.object({ conversationId: z.string().min(2).max(80) });
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    });

    const { conversationId } = paramsSchema.parse(request.params);
    const { limit } = querySchema.parse(request.query);

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
