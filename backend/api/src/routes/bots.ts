import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { normalizeAgentConfig, validatePublishedAgent } from '../botRuntime/agentConfig.js';
import {
  agentRuntimeReadinessReason,
  isAgentRuntimeReady,
} from '../botRuntime/openaiAgent.js';

type BotsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  createRuntimeId: (prefix: string) => string;
  toJsonString: (value: unknown) => string;
};

const agentConfigSchema = z.object({
  instructions: z.string().trim().max(8_000),
  model: z.enum(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']),
  triggerMode: z.enum(['mention', 'command', 'always']),
  responseLength: z.enum(['concise', 'balanced', 'detailed']),
  tone: z.enum(['focused', 'warm', 'expert']),
  reasoningEffort: z.enum(['low', 'medium', 'high']),
  historyLimit: z.number().int().min(0).max(40),
  starterPrompts: z.array(z.string().trim().min(1).max(160)).max(4),
});

function botRuntimeReadiness(runtimeMode: string): {
  runtimeReady: boolean;
  runtimeReadinessReason: string | null;
} {
  if (runtimeMode !== 'ai') {
    return { runtimeReady: true, runtimeReadinessReason: null };
  }
  return {
    runtimeReady: isAgentRuntimeReady(),
    runtimeReadinessReason: agentRuntimeReadinessReason(),
  };
}

function publicAgentConfig(value: unknown) {
  const agentConfig = normalizeAgentConfig(value);
  return {
    ...agentConfig,
    instructions: '',
  };
}

export const registerBotsRoutes = ({
  app,
  db,
  createApiError,
  createRuntimeId,
  toJsonString,
}: BotsRouteDependencies) => {
  app.get('/bots/system', async () => {
    const result = await db.query<{
      id: string;
      slug: string;
      name: string;
      description: string;
      command_hint: string;
      category: 'moderation' | 'commerce' | 'automation';
      type: 'system' | 'custom';
      status: string;
      runtime_mode: string;
      is_draft: boolean;
      permissions: unknown;
      icon: string | null;
      agent_config: unknown;
    }>(
      `
      SELECT
        id, slug, name, description, command_hint, category,
        type, status, runtime_mode, is_draft, permissions, icon, agent_config
      FROM chat_bots
      WHERE type = 'system' AND is_active = TRUE
      ORDER BY name ASC
    `
    );

    return {
      ok: true,
      items: result.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        commandHint: row.command_hint,
        category: row.category,
        type: row.type,
        status: row.status,
        runtimeMode: row.runtime_mode,
        isDraft: row.is_draft,
        permissions: row.permissions,
        icon: row.icon,
        agentConfig: row.runtime_mode === 'ai' ? normalizeAgentConfig(row.agent_config) : null,
        ...botRuntimeReadiness(row.runtime_mode),
      })),
    };
  });

  app.get('/bots', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const userId = request.authUser.userId;
    const result = await db.query<{
      id: string;
      slug: string;
      name: string;
      description: string;
      command_hint: string;
      category: 'moderation' | 'commerce' | 'automation';
      type: 'system' | 'custom';
      status: string;
      runtime_mode: string;
      is_draft: boolean;
      permissions: unknown;
      icon: string | null;
      agent_config: unknown;
      created_at: string;
      updated_at: string;
    }>(
      `
      SELECT
        id, slug, name, description, command_hint, category,
        type, status, runtime_mode, is_draft, permissions, icon, agent_config,
        created_at, updated_at
      FROM chat_bots
      WHERE type = 'custom' AND owner_id = $1
      ORDER BY created_at DESC
    `,
      [userId]
    );

    return {
      ok: true,
      items: result.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        commandHint: row.command_hint,
        category: row.category,
        type: row.type,
        status: row.status,
        runtimeMode: row.runtime_mode,
        isDraft: row.is_draft,
        permissions: row.permissions,
        icon: row.icon,
        agentConfig: row.runtime_mode === 'ai' ? normalizeAgentConfig(row.agent_config) : null,
        ...botRuntimeReadiness(row.runtime_mode),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  });

  app.get('/bots/:botId', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({ botId: z.string().min(2).max(120) });
    const { botId } = paramsSchema.parse(request.params);

    const result = await db.query<{
      id: string;
      slug: string;
      name: string;
      description: string;
      command_hint: string;
      category: 'moderation' | 'commerce' | 'automation';
      type: 'system' | 'custom';
      status: string;
      runtime_mode: string;
      is_draft: boolean;
      permissions: unknown;
      icon: string | null;
      owner_id: string | null;
      agent_config: unknown;
      created_at: string;
      updated_at: string;
    }>(
      `
      SELECT
        id, slug, name, description, command_hint, category,
        type, status, runtime_mode, is_draft, permissions, icon, owner_id, agent_config,
        created_at, updated_at
      FROM chat_bots
      WHERE id = $1
      LIMIT 1
    `,
      [botId]
    );

    if (!result.rowCount) {
      throw createApiError('CHAT_BOT_NOT_FOUND', 'Bot not found', { botId });
    }

    const bot = result.rows[0];

    if (bot.type === 'custom' && bot.owner_id !== request.authUser.userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the bot owner can view this bot');
    }

    return {
      ok: true,
      item: {
        id: bot.id,
        slug: bot.slug,
        name: bot.name,
        description: bot.description,
        commandHint: bot.command_hint,
        category: bot.category,
        type: bot.type,
        status: bot.status,
        runtimeMode: bot.runtime_mode,
        isDraft: bot.is_draft,
        permissions: bot.permissions,
        icon: bot.icon,
        ownerId: bot.owner_id,
        agentConfig: bot.runtime_mode === 'ai' ? normalizeAgentConfig(bot.agent_config) : null,
        ...botRuntimeReadiness(bot.runtime_mode),
        createdAt: bot.created_at,
        updatedAt: bot.updated_at,
      },
    };
  });

  app.post('/bots', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const userId = request.authUser.userId;
    const bodySchema = z.object({
      name: z.string().trim().min(2).max(80),
      slug: z.string().trim().min(2).max(40).optional(),
      description: z.string().trim().min(2).max(500),
      commandHint: z.string().trim().min(1).max(120),
      category: z.enum(['moderation', 'commerce', 'automation', 'safety', 'assistant', 'styling']),
      permissions: z.array(z.string()).default([]),
      icon: z.string().trim().max(120).optional(),
      isDraft: z.boolean().default(false),
      agentConfig: agentConfigSchema.optional(),
    });

    const payload = bodySchema.parse(request.body);
    const botId = createRuntimeId('bot');
    const slug = payload.slug ?? botId;
    const normalizedAgentConfig = normalizeAgentConfig(payload.agentConfig);
    const validationError = payload.isDraft
      ? null
      : validatePublishedAgent(normalizedAgentConfig, payload.permissions);
    if (validationError) {
      throw createApiError('CHAT_BOT_INVALID', validationError);
    }

    await db.query(
      `
      INSERT INTO chat_bots (
        id, slug, name, description, command_hint, category,
        type, status, runtime_mode, is_draft, permissions, icon, owner_id, agent_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `,
      [
        botId,
        slug,
        payload.name,
        payload.description,
        payload.commandHint,
        payload.category,
        'custom',
        'available',
        'ai',
        payload.isDraft,
        toJsonString(payload.permissions),
        payload.icon ?? null,
        userId,
        toJsonString(normalizedAgentConfig),
      ]
    );

    await db.query(
      `
      INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [
        createRuntimeId('baev'),
        botId,
        userId,
        'created',
        toJsonString({ isDraft: payload.isDraft }),
      ]
    );

    reply.code(201);
    return {
      ok: true,
      id: botId,
      slug,
      name: payload.name,
      type: 'custom',
      status: 'available',
      runtimeMode: 'ai',
      isDraft: payload.isDraft,
      agentConfig: normalizedAgentConfig,
      ...botRuntimeReadiness('ai'),
    };
  });

  app.patch('/bots/:botId', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({ botId: z.string().min(2).max(120) });
    const bodySchema = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().min(2).max(500).optional(),
      commandHint: z.string().trim().min(1).max(120).optional(),
      category: z.enum(['moderation', 'commerce', 'automation', 'safety', 'assistant', 'styling']).optional(),
      permissions: z.array(z.string()).optional(),
      icon: z.string().trim().max(120).optional(),
      isDraft: z.boolean().optional(),
      status: z.enum(['available', 'local-only', 'backend-required', 'disabled']).optional(),
      runtimeMode: z.enum(['local', 'config-only', 'backend', 'ai']).optional(),
      agentConfig: agentConfigSchema.optional(),
    });

    const { botId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body);
    const userId = request.authUser.userId;

    const existing = await db.query<{
      owner_id: string;
      type: 'system' | 'custom';
      agent_config: unknown;
      permissions: unknown;
      is_draft: boolean;
    }>(
      `SELECT owner_id, type, agent_config, permissions, is_draft FROM chat_bots WHERE id = $1 LIMIT 1`,
      [botId]
    );

    if (!existing.rowCount) {
      throw createApiError('CHAT_BOT_NOT_FOUND', 'Bot not found', { botId });
    }

    const bot = existing.rows[0];
    if (bot.type !== 'custom' || bot.owner_id !== userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the bot owner can update this bot');
    }

    const nextConfig = normalizeAgentConfig(payload.agentConfig ?? bot.agent_config);
    const nextPermissions = payload.permissions
      ?? (Array.isArray(bot.permissions) ? bot.permissions.filter((item): item is string => typeof item === 'string') : []);
    const nextIsDraft = payload.isDraft ?? bot.is_draft;
    const validationError = nextIsDraft
      ? null
      : validatePublishedAgent(nextConfig, nextPermissions);
    if (validationError) {
      throw createApiError('CHAT_BOT_INVALID', validationError);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (payload.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(payload.name);
    }
    if (payload.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(payload.description);
    }
    if (payload.commandHint !== undefined) {
      updates.push(`command_hint = $${paramIndex++}`);
      values.push(payload.commandHint);
    }
    if (payload.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(payload.category);
    }
    if (payload.permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      values.push(toJsonString(payload.permissions));
    }
    if (payload.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(payload.icon);
    }
    if (payload.isDraft !== undefined) {
      updates.push(`is_draft = $${paramIndex++}`);
      values.push(payload.isDraft);
    }
    if (payload.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(payload.status);
    }
    if (payload.runtimeMode !== undefined) {
      updates.push(`runtime_mode = $${paramIndex++}`);
      values.push(payload.runtimeMode);
    }
    if (payload.agentConfig !== undefined) {
      updates.push(`agent_config = $${paramIndex++}`);
      values.push(toJsonString(nextConfig));
      if (payload.runtimeMode === undefined) {
        updates.push(`runtime_mode = $${paramIndex++}`);
        values.push('ai');
      }
      if (payload.status === undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push('available');
      }
    }

    if (updates.length === 0) {
      throw createApiError('CHAT_BOT_INVALID', 'No fields to update');
    }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());
    values.push(botId);

    await db.query(
      `UPDATE chat_bots SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    await db.query(
      `
      INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [
        createRuntimeId('baev'),
        botId,
        userId,
        'updated',
        toJsonString({ fields: Object.keys(payload) }),
      ]
    );

    return {
      ok: true,
      id: botId,
    };
  });

  app.delete('/bots/:botId', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({ botId: z.string().min(2).max(120) });
    const { botId } = paramsSchema.parse(request.params);
    const userId = request.authUser.userId;

    const existing = await db.query<{ owner_id: string; type: 'system' | 'custom'; name: string }>(
      `SELECT owner_id, type, name FROM chat_bots WHERE id = $1 LIMIT 1`,
      [botId]
    );

    if (!existing.rowCount) {
      throw createApiError('CHAT_BOT_NOT_FOUND', 'Bot not found', { botId });
    }

    const bot = existing.rows[0];
    if (bot.type !== 'custom' || bot.owner_id !== userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the bot owner can delete this bot');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Mark all group installs as removed
      await client.query(
        `UPDATE chat_bot_installs SET status = 'removed', updated_at = NOW() WHERE bot_id = $1`,
        [botId]
      );

      await client.query(
        `
        INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [createRuntimeId('baev'), botId, userId, 'deleted', toJsonString({ name: bot.name })]
      );

      await client.query(
        `DELETE FROM chat_bots WHERE id = $1`,
        [botId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      ok: true,
      id: botId,
      deleted: true,
    };
  });
};
