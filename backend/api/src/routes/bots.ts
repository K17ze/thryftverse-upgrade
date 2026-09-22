import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import { normalizeAgentConfig, validatePublishedAgent } from '../botRuntime/agentConfig.js';
import {
  agentRuntimeReadinessReason,
  isAgentRuntimeReady,
} from '../botRuntime/openaiAgent.js';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../lib/messageEncryption.js';
import { isLoopbackIp, isPrivateIp } from '../lib/media/remoteImport.js';
import { fetchPinnedRemoteMedia } from '../lib/safeRemoteMediaFetch.js';

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

// ── Provider connection credential vault ───────────────────────────────
//
// API keys are encrypted at rest with AES-256-GCM via the shared vault in
// lib/messageEncryption.ts (keyed by config.encryptionKey). The raw key is
// NEVER returned in API responses — only the masked form.

interface ProviderConnectionRow {
  id: string;
  owner_id: string;
  provider: string;
  label: string;
  environment: string;
  encrypted_key: string;
  base_url: string | null;
  health_status: string;
  last_verified_at: string | null;
  last_failed_at: string | null;
  last_error: string | null;
  discovered_models: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function serializeConnection(row: ProviderConnectionRow, maskedKey: string) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    provider: row.provider,
    label: row.label,
    environment: row.environment,
    maskedKey,
    baseUrl: row.base_url,
    healthStatus: row.health_status,
    lastVerifiedAt: row.last_verified_at,
    lastFailedAt: row.last_failed_at,
    lastError: row.last_error,
    discoveredModels: row.discovered_models,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Each provider is verified against its own first-party endpoint with its
// own auth scheme — a key must never be sent to a different provider's
// host. `custom` uses the caller-supplied base URL, validated against SSRF
// below. Callers needing an OpenAI-compatible gateway should use `custom`.
const PROVIDER_VERIFICATION: Record<
  string,
  { baseUrl: string; headers: (apiKey: string) => Record<string, string> }
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }),
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
  },
};

/**
 * Validate a caller-supplied `custom` provider base URL before sending a
 * key to it. HTTPS-only, no embedded credentials, and the hostname must
 * not be — or resolve to — a loopback, private, link-local, or multicast
 * address (the request carries the user's API key, so an internal or
 * cloud-metadata endpoint would exfiltrate it).
 */
async function assertSafeCustomProviderBaseUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('custom provider baseUrl is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('custom provider baseUrl must use https://');
  }
  if (parsed.username || parsed.password) {
    throw new Error('custom provider baseUrl must not contain credentials');
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    throw new Error('custom provider baseUrl has no hostname');
  }

  const isBlockedAddress = (ip: string) => isLoopbackIp(ip) || isPrivateIp(ip);

  // Literal IP host — check directly, no DNS needed.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new Error('custom provider baseUrl targets a private or local address');
    }
    return parsed;
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch (error) {
    throw new Error(
      `custom provider hostname could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (addresses.length === 0) {
    throw new Error('custom provider hostname has no DNS records');
  }
  for (const addr of addresses) {
    if (isBlockedAddress(addr.address)) {
      throw new Error('custom provider baseUrl resolves to a private or local address');
    }
  }
  return parsed;
}

async function verifyProviderKey(
  provider: string,
  apiKey: string,
  baseUrl: string | null,
): Promise<{ healthy: boolean; models: string[]; error: string | null }> {
  let endpoint: string;
  let headers: Record<string, string>;

  if (provider === 'custom') {
    if (!baseUrl) {
      return {
        healthy: false,
        models: [],
        error: 'A baseUrl is required for custom providers',
      };
    }
    try {
      endpoint = (await assertSafeCustomProviderBaseUrl(baseUrl))
        .toString()
        .replace(/\/+$/, '');
    } catch (error) {
      return {
        healthy: false,
        models: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    // OpenAI-compatible auth convention for custom endpoints.
    headers = { Authorization: `Bearer ${apiKey}` };
  } else {
    const spec = PROVIDER_VERIFICATION[provider];
    if (!spec) {
      return { healthy: false, models: [], error: `Unsupported provider: ${provider}` };
    }
    endpoint = spec.baseUrl;
    headers = spec.headers(apiKey);
  }

  try {
    // The custom-provider URL was DNS-validated above, but validation alone
    // leaves a TOCTOU window — a rebound DNS answer could redirect the
    // API-key-bearing request. The pinned transport re-validates and pins
    // the connection to the blocklist-checked address set (F15/B3).
    const result = await fetchPinnedRemoteMedia({
      url: `${endpoint}/models`,
      // HTTPS-only — mirrors assertSafeCustomProviderBaseUrl and the
      // hardcoded provider endpoints.
      allowHttp: false,
      timeoutMs: 10_000,
      headers: {
        'User-Agent': 'ThryftVerse-Provider-Verify/1.0',
        Accept: 'application/json',
        ...headers,
      },
    });
    if (result.ok) {
      const payload = JSON.parse(result.buffer.toString('utf8')) as unknown;
      const models = extractModelIds(payload);
      return { healthy: true, models, error: null };
    }
    return {
      healthy: false,
      models: [],
      error: result.code === 'http_error' && result.statusCode !== undefined
        ? `Provider returned ${result.statusCode}: ${result.message}`
        : result.message,
    };
  } catch (error) {
    return {
      healthy: false,
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;

  // OpenAI / Anthropic / OpenAI-compatible: { data: [{ id }] }
  if (Array.isArray(record.data)) {
    return record.data
      .map((entry: unknown) => {
        if (entry && typeof entry === 'object') {
          const id = (entry as Record<string, unknown>).id;
          return typeof id === 'string' ? id : '';
        }
        return '';
      })
      .filter(Boolean);
  }

  // Gemini: { models: [{ name: 'models/<id>' }] }
  if (Array.isArray(record.models)) {
    return record.models
      .map((entry: unknown) => {
        if (entry && typeof entry === 'object') {
          const name = (entry as Record<string, unknown>).name;
          return typeof name === 'string' ? name.replace(/^models\//, '') : '';
        }
        return '';
      })
      .filter(Boolean);
  }

  return [];
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
        agentConfig: row.runtime_mode === 'ai' ? publicAgentConfig(row.agent_config) : null,
        ...botRuntimeReadiness(row.runtime_mode),
      })),
    };
  });

  app.post('/bots/validate', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const bodySchema = z.object({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().min(2).max(500),
      commandHint: z.string().trim().min(1).max(120),
      category: z.enum(['moderation', 'commerce', 'automation', 'safety', 'assistant', 'styling']),
      permissions: z.array(z.string()).default([]),
      isDraft: z.boolean().default(false),
      agentConfig: agentConfigSchema.optional(),
    });

    const payload = bodySchema.parse(request.body);
    const normalizedAgentConfig = normalizeAgentConfig(payload.agentConfig);
    const validationError = payload.isDraft
      ? null
      : validatePublishedAgent(normalizedAgentConfig, payload.permissions);

    const checks = [
      { key: 'name', passed: payload.name.trim().length >= 2 },
      { key: 'description', passed: payload.description.trim().length >= 2 },
      { key: 'instructions', passed: payload.isDraft || normalizedAgentConfig.instructions.length >= 20 },
      { key: 'permissions_reply', passed: payload.isDraft || payload.permissions.includes('reply_in_chat') },
      { key: 'runtime_ready', passed: normalizedAgentConfig ? isAgentRuntimeReady() : true },
    ];

    return {
      ok: true,
      valid: validationError === null,
      validationError,
      checks,
      runtimeReady: isAgentRuntimeReady(),
      runtimeReadinessReason: agentRuntimeReadinessReason(),
    };
  });

  app.post('/bots/:botId/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({ botId: z.string().min(2).max(120) });
    const bodySchema = z.object({
      publishNotes: z.string().trim().max(500).optional(),
      idempotencyKey: z.string().trim().max(120).optional(),
    });
    const { botId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});
    const userId = request.authUser.userId;

    const existing = await db.query<{
      owner_id: string;
      type: 'system' | 'custom';
      agent_config: unknown;
      permissions: unknown;
      is_draft: boolean;
      current_version_id: string | null;
    }>(
      `SELECT owner_id, type, agent_config, permissions, is_draft, current_version_id FROM chat_bots WHERE id = $1 LIMIT 1`,
      [botId]
    );

    if (!existing.rowCount) {
      throw createApiError('CHAT_BOT_NOT_FOUND', 'Bot not found', { botId });
    }

    const bot = existing.rows[0];
    if (bot.type !== 'custom' || bot.owner_id !== userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the bot owner can publish this bot');
    }

    const normalizedConfig = normalizeAgentConfig(bot.agent_config);
    const permissions = Array.isArray(bot.permissions)
      ? bot.permissions.filter((p): p is string => typeof p === 'string')
      : [];
    const validationError = validatePublishedAgent(normalizedConfig, permissions);
    if (validationError) {
      throw createApiError('CHAT_BOT_INVALID', validationError);
    }

    // Compute next version number
    const versionResult = await db.query<{ max_version: number }>(
      `SELECT COALESCE(MAX(version_number), 0) as max_version FROM agent_versions WHERE bot_id = $1`,
      [botId]
    );
    const nextVersion = (versionResult.rows[0]?.max_version ?? 0) + 1;
    const versionId = createRuntimeId('ver');

    const configChecksum = createHash('md5').update(toJsonString(normalizedConfig)).digest('hex');
    const permissionsChecksum = createHash('md5').update(toJsonString(permissions)).digest('hex');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO agent_versions (id, bot_id, version_number, publisher_id, agent_config, permissions, config_checksum, permissions_checksum, publish_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [versionId, botId, nextVersion, userId, toJsonString(normalizedConfig), toJsonString(permissions), configChecksum, permissionsChecksum, payload.publishNotes ?? null]
      );

      await client.query(
        `UPDATE chat_bots SET current_version_id = $1, is_draft = FALSE, updated_at = NOW() WHERE id = $2`,
        [versionId, botId]
      );

      await client.query(
        `INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [createRuntimeId('baev'), botId, userId, 'published', toJsonString({ versionId, versionNumber: nextVersion, publishNotes: payload.publishNotes ?? null })]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    reply.code(201);
    return {
      ok: true,
      botId,
      versionId,
      versionNumber: nextVersion,
      configChecksum,
      permissionsChecksum,
    };
  });

  app.get('/bots/:botId/versions', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({ botId: z.string().min(2).max(120) });
    const { botId } = paramsSchema.parse(request.params);
    const userId = request.authUser.userId;

    // Verify ownership
    const botResult = await db.query<{ owner_id: string; type: 'system' | 'custom' }>(
      `SELECT owner_id, type FROM chat_bots WHERE id = $1 LIMIT 1`,
      [botId]
    );
    if (!botResult.rowCount) {
      throw createApiError('CHAT_BOT_NOT_FOUND', 'Bot not found', { botId });
    }
    if (botResult.rows[0].type === 'custom' && botResult.rows[0].owner_id !== userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the bot owner can view versions');
    }

    const result = await db.query<{
      id: string;
      version_number: number;
      publisher_id: string;
      config_checksum: string;
      permissions_checksum: string;
      publish_notes: string | null;
      created_at: string;
    }>(
      `SELECT id, version_number, publisher_id, config_checksum, permissions_checksum, publish_notes, created_at
       FROM agent_versions WHERE bot_id = $1 ORDER BY version_number DESC`,
      [botId]
    );

    return {
      ok: true,
      botId,
      items: result.rows.map((row) => ({
        id: row.id,
        versionNumber: row.version_number,
        publisherId: row.publisher_id,
        configChecksum: row.config_checksum,
        permissionsChecksum: row.permissions_checksum,
        publishNotes: row.publish_notes,
        createdAt: row.created_at,
      })),
    };
  });

  app.post('/bots/:botId/versions/:versionId/rollback', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({
      botId: z.string().min(2).max(120),
      versionId: z.string().min(2).max(120),
    });
    const { botId, versionId } = paramsSchema.parse(request.params);
    const userId = request.authUser.userId;

    const botResult = await db.query<{ owner_id: string; type: 'system' | 'custom' }>(
      `SELECT owner_id, type FROM chat_bots WHERE id = $1 LIMIT 1`,
      [botId]
    );
    if (!botResult.rowCount) {
      throw createApiError('CHAT_BOT_NOT_FOUND', 'Bot not found', { botId });
    }
    if (botResult.rows[0].type === 'custom' && botResult.rows[0].owner_id !== userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the bot owner can rollback');
    }

    const versionResult = await db.query<{
      id: string;
      version_number: number;
      agent_config: unknown;
      permissions: unknown;
    }>(
      `SELECT id, version_number, agent_config, permissions FROM agent_versions WHERE id = $1 AND bot_id = $2 LIMIT 1`,
      [versionId, botId]
    );
    if (!versionResult.rowCount) {
      throw createApiError('CHAT_BOT_NOT_FOUND', 'Version not found', { versionId });
    }

    const version = versionResult.rows[0];
    const normalizedConfig = normalizeAgentConfig(version.agent_config);
    const permissions = Array.isArray(version.permissions)
      ? version.permissions.filter((p): p is string => typeof p === 'string')
      : [];

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Restore the bot config from the version
      await client.query(
        `UPDATE chat_bots SET agent_config = $1, permissions = $2, current_version_id = $3, is_draft = FALSE, updated_at = NOW() WHERE id = $4`,
        [toJsonString(normalizedConfig), toJsonString(permissions), versionId, botId]
      );

      // Update active installs to pin this version and refresh snapshots
      await client.query(
        `UPDATE chat_bot_installs SET permissions_snapshot = $1, configuration_snapshot = $2, agent_version_id = $3, updated_at = NOW() WHERE bot_id = $4 AND status = 'active'`,
        [toJsonString(permissions), toJsonString(normalizedConfig), versionId, botId]
      );

      await client.query(
        `INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [createRuntimeId('baev'), botId, userId, 'rolled_back', toJsonString({ versionId, versionNumber: version.version_number })]
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
      botId,
      versionId,
      versionNumber: version.version_number,
    };
  });

  // ── Provider connection management ────────────────────────────────────

  app.post('/agent-connections', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const bodySchema = z.object({
      provider: z.enum(['openai', 'anthropic', 'gemini', 'custom']),
      apiKey: z.string().trim().min(1).max(500),
      label: z.string().trim().min(1).max(120).optional(),
      baseUrl: z.string().trim().url().max(500).optional(),
      environment: z.enum(['production', 'staging', 'development']).optional(),
    });

    const payload = bodySchema.parse(request.body);
    const userId = request.authUser.userId;
    const connectionId = createRuntimeId('conn');

    // Verify the key against the provider before storing.
    const verification = await verifyProviderKey(
      payload.provider,
      payload.apiKey,
      payload.baseUrl ?? null,
    );

    const encryptedKey = encryptApiKey(payload.apiKey);
    const maskedKey = maskApiKey(payload.apiKey);

    const result = await db.query<ProviderConnectionRow>(
      `INSERT INTO provider_connections (
         id, owner_id, provider, label, environment, encrypted_key, base_url,
         health_status, last_verified_at, last_failed_at, last_error, discovered_models
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        connectionId,
        userId,
        payload.provider,
        payload.label ?? 'Default',
        payload.environment ?? 'production',
        encryptedKey,
        payload.baseUrl ?? null,
        verification.healthy ? 'healthy' : 'failed',
        verification.healthy ? new Date().toISOString() : null,
        verification.healthy ? null : new Date().toISOString(),
        verification.error,
        toJsonString(verification.models),
      ]
    );

    await db.query(
      `INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        createRuntimeId('baev'),
        connectionId,
        userId,
        'connection_created',
        toJsonString({
          connectionId,
          provider: payload.provider,
          label: payload.label ?? 'Default',
          healthStatus: verification.healthy ? 'healthy' : 'failed',
        }),
      ]
    );

    reply.code(201);
    return {
      ok: true,
      connection: serializeConnection(result.rows[0], maskedKey),
    };
  });

  app.get('/agent-connections', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const userId = request.authUser.userId;
    const result = await db.query<ProviderConnectionRow>(
      `SELECT * FROM provider_connections WHERE owner_id = $1 AND is_active = TRUE ORDER BY created_at DESC`,
      [userId]
    );

    return {
      ok: true,
      items: result.rows.map((row) => {
        let maskedKey = '••••';
        try {
          maskedKey = maskApiKey(decryptApiKey(row.encrypted_key));
        } catch {
          // If decryption fails, show a generic mask.
        }
        return serializeConnection(row, maskedKey);
      }),
    };
  });

  app.get('/agent-connections/:id/capabilities', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({ id: z.string().min(2).max(120) });
    const { id } = paramsSchema.parse(request.params);
    const userId = request.authUser.userId;

    const result = await db.query<ProviderConnectionRow>(
      `SELECT * FROM provider_connections WHERE id = $1 AND owner_id = $2 AND is_active = TRUE LIMIT 1`,
      [id, userId]
    );

    if (!result.rowCount) {
      throw createApiError('CONNECTION_NOT_FOUND', 'Connection not found', { id });
    }

    const connection = result.rows[0];

    // If we have cached models, return them.
    const cachedModels = Array.isArray(connection.discovered_models)
      ? connection.discovered_models.filter((m): m is string => typeof m === 'string')
      : [];

    if (cachedModels.length > 0) {
      return {
        ok: true,
        connectionId: id,
        provider: connection.provider,
        models: cachedModels,
        healthStatus: connection.health_status,
        lastVerifiedAt: connection.last_verified_at,
        cached: true,
      };
    }

    // Re-verify to discover models.
    let apiKey = '';
    try {
      apiKey = decryptApiKey(connection.encrypted_key);
    } catch {
      throw createApiError('CONNECTION_DECRYPT_FAILED', 'Failed to decrypt connection key');
    }

    const verification = await verifyProviderKey(
      connection.provider,
      apiKey,
      connection.base_url,
    );

    await db.query(
      `UPDATE provider_connections
       SET health_status = $1, last_verified_at = $2, last_failed_at = $3,
           last_error = $4, discovered_models = $5
       WHERE id = $6`,
      [
        verification.healthy ? 'healthy' : connection.health_status,
        verification.healthy ? new Date().toISOString() : connection.last_verified_at,
        verification.healthy ? connection.last_failed_at : new Date().toISOString(),
        verification.error,
        toJsonString(verification.models),
        id,
      ]
    );

    return {
      ok: true,
      connectionId: id,
      provider: connection.provider,
      models: verification.models,
      healthStatus: verification.healthy ? 'healthy' : connection.health_status,
      lastVerifiedAt: verification.healthy ? new Date().toISOString() : connection.last_verified_at,
      cached: false,
    };
  });

  app.delete('/agent-connections/:id', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({ id: z.string().min(2).max(120) });
    const { id } = paramsSchema.parse(request.params);
    const userId = request.authUser.userId;

    const existing = await db.query<ProviderConnectionRow>(
      `SELECT * FROM provider_connections WHERE id = $1 AND owner_id = $2 LIMIT 1`,
      [id, userId]
    );

    if (!existing.rowCount) {
      throw createApiError('CONNECTION_NOT_FOUND', 'Connection not found', { id });
    }

    // Preview impact: which agents are bound to this connection?
    const boundBots = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM chat_bots WHERE provider_connection_id = $1`,
      [id]
    );

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE provider_connections SET is_active = FALSE WHERE id = $1`,
        [id]
      );

      // Unbind agents so they don't reference a deactivated connection.
      await client.query(
        `UPDATE chat_bots SET provider_connection_id = NULL WHERE provider_connection_id = $1`,
        [id]
      );

      await client.query(
        `INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          createRuntimeId('baev'),
          id,
          userId,
          'connection_revoked',
          toJsonString({
            connectionId: id,
            unboundBots: boundBots.rows.map((b) => b.id),
          }),
        ]
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
      connectionId: id,
      deactivated: true,
      impact: {
        unboundBots: boundBots.rows.map((b) => ({ id: b.id, name: b.name })),
      },
    };
  });

  app.post('/agent-connections/:id/reverify', async (request: FastifyRequest) => {
    if (!request.authUser) {
      throw createApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const paramsSchema = z.object({ id: z.string().min(2).max(120) });
    const { id } = paramsSchema.parse(request.params);
    const userId = request.authUser.userId;

    const existing = await db.query<ProviderConnectionRow>(
      `SELECT * FROM provider_connections WHERE id = $1 AND owner_id = $2 AND is_active = TRUE LIMIT 1`,
      [id, userId]
    );

    if (!existing.rowCount) {
      throw createApiError('CONNECTION_NOT_FOUND', 'Connection not found', { id });
    }

    const connection = existing.rows[0];

    let apiKey = '';
    try {
      apiKey = decryptApiKey(connection.encrypted_key);
    } catch {
      throw createApiError('CONNECTION_DECRYPT_FAILED', 'Failed to decrypt connection key');
    }

    const verification = await verifyProviderKey(
      connection.provider,
      apiKey,
      connection.base_url,
    );

    const result = await db.query<ProviderConnectionRow>(
      `UPDATE provider_connections
       SET health_status = $1, last_verified_at = $2, last_failed_at = $3,
           last_error = $4, discovered_models = $5
       WHERE id = $6
       RETURNING *`,
      [
        verification.healthy ? 'healthy' : 'failed',
        verification.healthy ? new Date().toISOString() : connection.last_verified_at,
        verification.healthy ? connection.last_failed_at : new Date().toISOString(),
        verification.error,
        toJsonString(verification.models),
        id,
      ]
    );

    await db.query(
      `INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        createRuntimeId('baev'),
        id,
        userId,
        'connection_verified',
        toJsonString({
          connectionId: id,
          healthStatus: verification.healthy ? 'healthy' : 'failed',
          modelsFound: verification.models.length,
        }),
      ]
    );

    let maskedKey = '••••';
    try {
      maskedKey = maskApiKey(decryptApiKey(result.rows[0].encrypted_key));
    } catch {
      // If decryption fails, show a generic mask.
    }

    return {
      ok: true,
      connection: serializeConnection(result.rows[0], maskedKey),
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
        agentConfig: bot.runtime_mode === 'ai'
          ? (bot.type === 'system' ? publicAgentConfig(bot.agent_config) : normalizeAgentConfig(bot.agent_config))
          : null,
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

  // ── Agent approval endpoints ──────────────────────────────────────────
  //
  // Durable approval checkpoints for consequential tool calls. When the
  // policy engine requires approval, an agent_approval_requests row is
  // created. The actor (or a delegate) can then approve or reject the
  // proposed action. Approvals are single-use — once decided, the row
  // transitions to a terminal state and cannot be reused.

  app.get('/agent-approvals', async (request: FastifyRequest) => {
    if (!request.authUser) throw createApiError('UNAUTHORIZED', 'Unauthorized');
    const userId = request.authUser.userId;

    // Lazily expire rows past their TTL so the list and the decision
    // endpoints agree on what is still decidable.
    await db.query(
      `UPDATE agent_approval_requests SET status = 'expired'
       WHERE actor_user_id = $1 AND status = 'pending'
         AND expires_at IS NOT NULL AND expires_at <= NOW()`,
      [userId]
    );

    const result = await db.query<{
      id: string; run_id: string; bot_id: string; conversation_id: string;
      tool_name: string; tool_arguments: unknown; status: string;
      expires_at: string | null; created_at: string;
    }>(
      `SELECT id, run_id, bot_id, conversation_id, tool_name, tool_arguments, status, expires_at, created_at
       FROM agent_approval_requests
       WHERE actor_user_id = $1 AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );

    return {
      ok: true,
      items: result.rows.map((row) => ({
        id: row.id,
        runId: row.run_id,
        botId: row.bot_id,
        conversationId: row.conversation_id,
        toolName: row.tool_name,
        toolArguments: row.tool_arguments,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      })),
    };
  });

  app.post('/agent-approvals/:id/approve', async (request: FastifyRequest) => {
    if (!request.authUser) throw createApiError('UNAUTHORIZED', 'Unauthorized');
    const paramsSchema = z.object({ id: z.string().min(2).max(120) });
    const bodySchema = z.object({
      editedArguments: z.record(z.unknown()).optional(),
    }).default({});
    const { id } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});
    const userId = request.authUser.userId;

    const existing = await db.query<{
      actor_user_id: string;
      status: string;
      run_id: string;
      bot_id: string;
      conversation_id: string;
      expires_at: string | null;
      continuation_token: string;
    }>(
      `SELECT actor_user_id, status, run_id, bot_id, conversation_id, expires_at, continuation_token FROM agent_approval_requests WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!existing.rowCount) throw createApiError('NOT_FOUND', 'Approval request not found', { id });
    if (existing.rows[0].actor_user_id !== userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the request actor can approve');
    }
    if (existing.rows[0].status !== 'pending') {
      throw createApiError('APPROVAL_TERMINAL', 'Approval request is no longer pending');
    }
    if (existing.rows[0].expires_at && new Date(existing.rows[0].expires_at) <= new Date()) {
      // Mark expired so the row leaves the pending set permanently.
      await db.query(
        `UPDATE agent_approval_requests SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
        [id]
      );
      throw createApiError('APPROVAL_EXPIRED', 'Approval request has expired');
    }

    // Atomic decision — the status guard is part of the UPDATE so two
    // concurrent deciders cannot both win. Zero rows means the request was
    // decided (or expired) between the SELECT above and this write.
    const decided = await db.query<{ id: string }>(
      `UPDATE agent_approval_requests SET status = 'approved', decided_by = $2, decided_at = NOW(), edited_arguments = $3
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [id, userId, payload.editedArguments ? toJsonString(payload.editedArguments) : null]
    );
    if (!decided.rowCount) {
      throw createApiError('APPROVAL_TERMINAL', 'Approval request is no longer pending');
    }

    // Sibling pending rows for the same tool call are superseded — only
    // one decision per proposed call may stand.
    await db.query(
      `UPDATE agent_approval_requests SET status = 'superseded'
       WHERE run_id = $1 AND continuation_token = $2 AND status = 'pending' AND id <> $3`,
      [existing.rows[0].run_id, existing.rows[0].continuation_token, id]
    );

    await db.query(
      `INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
       SELECT $1, bot_id, $2, 'tool_approved', $3 FROM agent_approval_requests WHERE id = $4`,
      [createRuntimeId('baev'), userId, toJsonString({ approvalId: id, edited: Boolean(payload.editedArguments) }), id]
    );

    // Resume the run: reset it to 'queued' so the worker re-executes —
    // processToolCalls honors this approval for the same tool. Only a run
    // that finished waiting (succeeded) is resumed; a failed/cancelled run
    // stays terminal.
    const resumed = await db.query<{ id: string }>(
      `UPDATE agent_runs SET status = 'queued', completed_at = NULL
       WHERE id = $1 AND status = 'succeeded'
       RETURNING id`,
      [existing.rows[0].run_id],
    );
    if (resumed.rowCount) {
      const { agentRunQueue } = await import('../lib/queues.js');
      await agentRunQueue.add('agent-run', {
        runId: existing.rows[0].run_id,
        botId: existing.rows[0].bot_id,
        conversationId: existing.rows[0].conversation_id,
        actorUserId: existing.rows[0].actor_user_id,
        triggerMessageId: null,
        messageText: '',
      });
    }

    return { ok: true, approvalId: id, status: 'approved', resumed: (resumed.rowCount ?? 0) > 0 };
  });

  app.post('/agent-approvals/:id/reject', async (request: FastifyRequest) => {
    if (!request.authUser) throw createApiError('UNAUTHORIZED', 'Unauthorized');
    const paramsSchema = z.object({ id: z.string().min(2).max(120) });
    const bodySchema = z.object({
      reason: z.string().trim().max(500).optional(),
    }).default({});
    const { id } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});
    const userId = request.authUser.userId;

    const existing = await db.query<{
      actor_user_id: string;
      status: string;
      run_id: string;
      expires_at: string | null;
      continuation_token: string;
    }>(
      `SELECT actor_user_id, status, run_id, expires_at, continuation_token FROM agent_approval_requests WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!existing.rowCount) throw createApiError('NOT_FOUND', 'Approval request not found', { id });
    if (existing.rows[0].actor_user_id !== userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the request actor can reject');
    }
    if (existing.rows[0].status !== 'pending') {
      throw createApiError('APPROVAL_TERMINAL', 'Approval request is no longer pending');
    }
    if (existing.rows[0].expires_at && new Date(existing.rows[0].expires_at) <= new Date()) {
      // Mark expired so the row leaves the pending set permanently.
      await db.query(
        `UPDATE agent_approval_requests SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
        [id]
      );
      throw createApiError('APPROVAL_EXPIRED', 'Approval request has expired');
    }

    // Atomic decision — the status guard is part of the UPDATE so two
    // concurrent deciders cannot both win. Zero rows means the request was
    // decided (or expired) between the SELECT above and this write.
    const decided = await db.query<{ id: string }>(
      `UPDATE agent_approval_requests SET status = 'rejected', decided_by = $2, decided_at = NOW(), metadata = metadata || $3
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [id, userId, toJsonString({ rejectionReason: payload.reason ?? null })]
    );
    if (!decided.rowCount) {
      throw createApiError('APPROVAL_TERMINAL', 'Approval request is no longer pending');
    }

    // Sibling pending rows for the same tool call are superseded — only
    // one decision per proposed call may stand.
    await db.query(
      `UPDATE agent_approval_requests SET status = 'superseded'
       WHERE run_id = $1 AND continuation_token = $2 AND status = 'pending' AND id <> $3`,
      [existing.rows[0].run_id, existing.rows[0].continuation_token, id]
    );

    await db.query(
      `INSERT INTO chat_bot_audit_events (id, bot_id, actor_user_id, event_type, metadata)
       SELECT $1, bot_id, $2, 'tool_rejected', $3 FROM agent_approval_requests WHERE id = $4`,
      [createRuntimeId('baev'), userId, toJsonString({ approvalId: id, reason: payload.reason ?? null }), id]
    );

    return { ok: true, approvalId: id, status: 'rejected' };
  });

  // ── Playground endpoint ─────────────────────────────────────────────────
  //
  // Lets the bot owner test an agent without deploying it. The run is
  // executed synchronously and the result is returned immediately — it is
  // never posted to a conversation. A temporary agent_runs row with
  // trigger_type='test' is created so the run is observable in the trace UI.

  app.post('/bots/:botId/playground', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) throw createApiError('UNAUTHORIZED', 'Unauthorized');
    const paramsSchema = z.object({ botId: z.string().min(2).max(120) });
    const bodySchema = z.object({
      message: z.string().trim().min(1).max(2000),
      conversationContext: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).max(20).default([]),
    });
    const { botId } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});
    const userId = request.authUser.userId;

    const botResult = await db.query<{ owner_id: string; type: 'system' | 'custom'; agent_config: unknown; permissions: unknown; runtime_mode: string; provider_connection_id: string | null }>(
      `SELECT owner_id, type, agent_config, permissions, runtime_mode, provider_connection_id FROM chat_bots WHERE id = $1 LIMIT 1`,
      [botId]
    );
    if (!botResult.rowCount) throw createApiError('CHAT_BOT_NOT_FOUND', 'Bot not found', { botId });
    const bot = botResult.rows[0];
    if (bot.type === 'custom' && bot.owner_id !== userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the bot owner can use the playground');
    }

    if (bot.runtime_mode !== 'ai') {
      return {
        ok: true,
        playground: true,
        response: 'This agent does not use the AI runtime. Playground is only available for AI agents.',
        usage: null,
      };
    }

    const runId = createRuntimeId('run');

    // agent_runs.conversation_id REFERENCES chat_conversations(id), so the
    // playground needs a real conversation row — a synthetic 'playground'
    // id violates the FK and 500s every call. A deterministic per-user id
    // gives each owner their own scratch conversation (and their own
    // conversation-scoped quota bucket instead of a shared global one).
    const playgroundConversationId = `agent-playground-${userId}`;
    await db.query(
      `INSERT INTO chat_conversations (id, type, title, owner_id, metadata)
       VALUES ($1, 'dm', 'Agent Playground', $2, '{"playground":true}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [playgroundConversationId, userId]
    );

    // Create a test run record
    await db.query(
      `INSERT INTO agent_runs (id, bot_id, conversation_id, actor_user_id, trigger_type, status, idempotency_key)
       VALUES ($1, $2, $3, $4, 'test', 'running', $5)`,
      [runId, botId, playgroundConversationId, userId, `playground:${runId}`]
    );

    // Playground calls the real provider — it must consume the same hourly
    // quota as a conversation run, or it is an unmetered spend path.
    const { reserveAiUsageQuota, recordAiUsageEvent } = await import('../lib/aiUsage.js');
    const { redis } = await import('../lib/redis.js');
    const aiQuota = await reserveAiUsageQuota(
      { userId, conversationId: playgroundConversationId },
      redis,
    );

    if (!aiQuota.allowed) {
      // R113: distinguish a platform daily-budget block from the per-hour
      // rate quota — different cause, different honest message.
      const quotaCode = aiQuota.budgetExceeded ? 'AI_DAILY_BUDGET_EXCEEDED' : 'AI_HOURLY_QUOTA_EXCEEDED';
      await db.query(
        `UPDATE agent_runs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [runId, quotaCode],
      );
      reply.code(429);
      return {
        ok: false,
        playground: true,
        error: aiQuota.budgetExceeded
          ? "Today's AI usage budget has been reached. Please try again tomorrow."
          : 'Hourly AI usage limit reached for this account. Try again at the start of the next hour.',
        code: quotaCode,
        usage: null,
      };
    }

    try {
      // Execute directly (synchronous for playground)
      const normalizedConfig = normalizeAgentConfig(bot.agent_config);
      const permissions = Array.isArray(bot.permissions) ? bot.permissions.filter((p): p is string => typeof p === 'string') : [];

      // Use the OpenAI agent directly with the test message. The bot's
      // bound provider connection (if any) supplies the credential, exactly
      // as it would in a real conversation run.
      const { executeOpenAiAgent } = await import('../botRuntime/openaiAgent.js');
      const { resolveProviderConnectionCredential } = await import('../botRuntime/index.js');
      const connectionCredential = bot.provider_connection_id
        ? await resolveProviderConnectionCredential(db, bot.provider_connection_id)
        : undefined;
      const result = await executeOpenAiAgent({
        conversationId: playgroundConversationId,
        conversationType: 'dm',
        conversationTitle: 'Playground',
        actorUserId: userId,
        actorUserName: null,
        botId,
        botName: '',
        botSlug: '',
        botCategory: 'assistant',
        botType: 'custom',
        commandHint: '',
        permissionsSnapshot: permissions,
        command: '',
        args: [],
        messageText: payload.message,
        agentConfig: normalizedConfig,
        conversationHistory: payload.conversationContext.map((m) => ({
          role: m.role,
          text: m.content,
        })),
        runtimeData: { listings: [], recentMessagesAnalyzed: 0, messagesRequiringReview: 0 },
      }, connectionCredential, db, runId);

      await db.query(
        `UPDATE agent_runs SET status = 'succeeded', completed_at = NOW(), result_text = $2, input_tokens = $3, output_tokens = $4, total_tokens = $5 WHERE id = $1`,
        [runId, result.text, result.metadata?.providerUsage ? (result.metadata.providerUsage as { inputTokens: number }).inputTokens : 0, result.metadata?.providerUsage ? (result.metadata.providerUsage as { outputTokens: number }).outputTokens : 0, result.metadata?.providerUsage ? (result.metadata.providerUsage as { totalTokens: number }).totalTokens : 0]
      );

      const providerUsage = result.metadata?.providerUsage as Record<string, unknown> | undefined;
      await recordAiUsageEvent(db, {
        id: createRuntimeId('aiuse'),
        userId,
        conversationId: playgroundConversationId,
        botId,
        model: typeof result.metadata?.model === 'string'
          ? result.metadata.model
          : normalizedConfig?.model ?? 'unconfigured',
        providerRequestId: typeof result.metadata?.providerRequestId === 'string'
          ? result.metadata.providerRequestId
          : null,
        status: 'succeeded',
        usage: providerUsage
          ? {
            inputTokens: Number(providerUsage.inputTokens) || 0,
            outputTokens: Number(providerUsage.outputTokens) || 0,
            totalTokens: Number(providerUsage.totalTokens) || 0,
          }
          : undefined,
        // Settle the admission reservation against the real provider cost.
        spendReservation: {
          reservedMicrousd: aiQuota.reservedMicrousd,
          spendKey: aiQuota.spendKey,
        },
        metadata: { playground: true, confidence: result.confidence ?? null },
      }, redis);

      return {
        ok: true,
        playground: true,
        runId,
        response: result.text,
        usage: result.metadata?.providerUsage ?? null,
        confidence: result.confidence,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown error';
      await db.query(
        `UPDATE agent_runs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
        [runId, errorMessage.slice(0, 500)]
      );
      await recordAiUsageEvent(db, {
        id: createRuntimeId('aiuse'),
        userId,
        conversationId: playgroundConversationId,
        botId,
        model: 'unconfigured',
        status: 'failed',
        errorCode: 'AI_EXECUTION_FAILED',
        // Refund the admission reservation — a failed run is not billable.
        spendReservation: {
          reservedMicrousd: aiQuota.reservedMicrousd,
          spendKey: aiQuota.spendKey,
        },
        metadata: { playground: true },
      }, redis).catch(() => {});
      throw createApiError('AGENT_EXECUTION_FAILED', errorMessage);
    }
  });

  // ── Trace timeline endpoint ─────────────────────────────────────────────
  //
  // Returns the step-by-step trace for a run — useful for debugging and
  // the trace timeline UI. Includes agent_run_steps and any approval
  // requests associated with the run.

  app.get('/agent-runs/:runId/trace', async (request: FastifyRequest) => {
    if (!request.authUser) throw createApiError('UNAUTHORIZED', 'Unauthorized');
    const paramsSchema = z.object({ runId: z.string().min(2).max(120) });
    const { runId } = paramsSchema.parse(request.params);

    // Verify ownership
    const runResult = await db.query<{ actor_user_id: string; status: string; bot_id: string }>(
      `SELECT actor_user_id, status, bot_id FROM agent_runs WHERE id = $1 LIMIT 1`,
      [runId]
    );
    if (!runResult.rowCount) throw createApiError('NOT_FOUND', 'Run not found', { runId });
    if (runResult.rows[0].actor_user_id !== request.authUser.userId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the run actor can view the trace');
    }

    const stepsResult = await db.query<{
      id: string; step_number: number; step_type: string; status: string;
      input_summary: string | null; output_summary: string | null;
      duration_ms: number | null; tokens_used: number | null;
      error_message: string | null; metadata: unknown; created_at: string;
    }>(
      `SELECT id, step_number, step_type, status, input_summary, output_summary, duration_ms, tokens_used, error_message, metadata, created_at
       FROM agent_run_steps WHERE run_id = $1 ORDER BY step_number ASC`,
      [runId]
    );

    // Also fetch any approval requests for this run
    const approvalsResult = await db.query<{
      id: string; tool_name: string; tool_arguments: unknown; status: string;
      decided_by: string | null; decided_at: string | null; created_at: string;
    }>(
      `SELECT id, tool_name, tool_arguments, status, decided_by, decided_at, created_at
       FROM agent_approval_requests WHERE run_id = $1 ORDER BY created_at ASC`,
      [runId]
    );

    return {
      ok: true,
      runId,
      steps: stepsResult.rows.map((row) => ({
        id: row.id,
        stepNumber: row.step_number,
        stepType: row.step_type,
        status: row.status,
        inputSummary: row.input_summary,
        outputSummary: row.output_summary,
        durationMs: row.duration_ms,
        tokensUsed: row.tokens_used,
        errorMessage: row.error_message,
        metadata: row.metadata,
        createdAt: row.created_at,
      })),
      approvals: approvalsResult.rows.map((row) => ({
        id: row.id,
        toolName: row.tool_name,
        toolArguments: row.tool_arguments,
        status: row.status,
        decidedBy: row.decided_by,
        decidedAt: row.decided_at,
        createdAt: row.created_at,
      })),
    };
  });
};
