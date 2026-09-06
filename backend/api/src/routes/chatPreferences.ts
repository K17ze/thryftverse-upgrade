import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

const paramsSchema = z.object({ conversationId: z.string().min(1).max(120) });
const themeSchema = z.enum(['Default', 'Emerald', 'Midnight', 'Sunset', 'Lavender', 'Cobalt']);
const bodySchema = z.object({ theme: themeSchema }).strict();
type PreferenceRow = { theme: z.infer<typeof themeSchema> };

export function registerChatPreferencesRoutes({ app, db, resolveAuthenticatedUserId }: {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
}) {
  app.get('/chat/conversations/:conversationId/preferences', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { conversationId } = paramsSchema.parse(request.params);
    const result = await db.query<PreferenceRow>(
      `SELECT COALESCE(s.theme, 'Default') AS theme
       FROM chat_members m
       LEFT JOIN chat_conversation_user_state s
         ON s.conversation_id = m.conversation_id AND s.user_id = m.user_id
       WHERE m.conversation_id = $1 AND m.user_id = $2`,
      [conversationId, userId],
    );
    if (!result.rows[0]) return reply.code(403).send({ ok: false, error: 'Not a member of this conversation' });
    return { ok: true, preferences: result.rows[0] };
  });

  app.put('/chat/conversations/:conversationId/preferences', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { conversationId } = paramsSchema.parse(request.params);
    const { theme } = bodySchema.parse(request.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // Keep membership valid until the write commits, including concurrent removal.
      const membership = await client.query(
        'SELECT 1 FROM chat_members WHERE conversation_id = $1 AND user_id = $2 FOR KEY SHARE',
        [conversationId, userId],
      );
      if (!membership.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ ok: false, error: 'Not a member of this conversation' });
      }
      const result = await client.query<PreferenceRow>(
        `INSERT INTO chat_conversation_user_state (user_id, conversation_id, theme)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, conversation_id)
         DO UPDATE SET theme = EXCLUDED.theme, updated_at = NOW()
         RETURNING theme`,
        [userId, conversationId, theme],
      );
      await client.query('COMMIT');
      return { ok: true, preferences: result.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
