import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createSearchAdapter, type SearchQuery } from '../lib/searchAdapter.js';
import {
  configureSearchIndex,
  syncListingsToSearchIndex,
} from '../lib/searchSync.js';
import { semanticSearch } from '../lib/vectorSearch.js';

type ApiError = Error & { code: string; statusCode?: number };

type CreateApiError = (code: string, message: string, details?: Record<string, unknown>) => ApiError;

type ResolveAuthenticatedUserId = (
  request: FastifyRequest,
  requestedUserId?: string,
) => string;

type SearchRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: CreateApiError;
  resolveAuthenticatedUserId: ResolveAuthenticatedUserId;
};

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});

const autocompleteSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const semanticSearchSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  filters: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Register search-related routes on the Fastify instance:
 *   GET  /search              — search listings via the SearchAdapter
 *   GET  /search/autocomplete — autocomplete suggestions
 *   GET  /search/health       — search backend health check
 *   POST /search/semantic     — semantic (hybrid/vector) search
 *   POST /search/reindex      — admin-only full reindex trigger
 */
export function registerSearchRoutes({
  app,
  db,
  createApiError: _createApiError,
  resolveAuthenticatedUserId,
}: SearchRouteDependencies): void {
  app.get('/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid search query', details: parsed.error.flatten() };
    }

    const { q, category, condition, size, minPrice, maxPrice, limit, offset } = parsed.data;

    const query: SearchQuery = {
      query: q,
      filters: {
        category,
        condition,
        size,
        minPrice,
        maxPrice,
      },
      limit,
      offset,
    };

    try {
      const adapter = createSearchAdapter();
      const results = await adapter.search(query);
      return {
        ok: true,
        query: q,
        total: results.length,
        items: results.map((result) => ({
          score: result.score,
          ...result.document,
        })),
      };
    } catch (error) {
      request.log.error({ err: error, query: q }, 'Search request failed');
      reply.code(500);
      return { ok: false, error: 'Search failed' };
    }
  });

  app.get('/search/autocomplete', async (request, reply) => {
    const parsed = autocompleteSchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid autocomplete query', details: parsed.error.flatten() };
    }

    const { q, limit } = parsed.data;

    try {
      const adapter = createSearchAdapter();
      const suggestions = await adapter.autocomplete(q, limit);
      return { ok: true, query: q, suggestions };
    } catch (error) {
      request.log.error({ err: error, query: q }, 'Autocomplete request failed');
      reply.code(500);
      return { ok: false, error: 'Autocomplete failed' };
    }
  });

  app.get('/search/health', async (_request, reply) => {
    try {
      const adapter = createSearchAdapter();
      const healthy = await adapter.health();
      reply.code(healthy ? 200 : 503);
      return { ok: healthy };
    } catch (error) {
      reply.code(503);
      return { ok: false, error: 'Search backend unhealthy' };
    }
  });

  app.post('/search/semantic', async (request, reply) => {
    const parsed = semanticSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid semantic search request', details: parsed.error.flatten() };
    }

    const { query, limit, filters } = parsed.data;

    try {
      const results = await semanticSearch(query, { limit, filters });
      return {
        ok: true,
        query,
        total: results.length,
        items: results.map((result) => ({
          score: result.score,
          ...result.document,
        })),
      };
    } catch (error) {
      request.log.error({ err: error, query }, 'Semantic search request failed');
      reply.code(500);
      return { ok: false, error: 'Semantic search failed' };
    }
  });

  app.post('/search/reindex', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    if (request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden: admin role required' };
    }

    request.log.info({ actorUserId }, 'Admin triggered full search reindex');

    try {
      await configureSearchIndex();
      const result = await syncListingsToSearchIndex(db);
      return {
        ok: true,
        synced: result.synced,
        failed: result.failed,
        total: result.total,
      };
    } catch (error) {
      request.log.error({ err: error }, 'Full reindex failed');
      reply.code(500);
      return { ok: false, error: 'Reindex failed' };
    }
  });
}
