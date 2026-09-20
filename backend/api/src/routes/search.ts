import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createSearchAdapter, type SearchQuery, type SearchBackend } from '../lib/searchAdapter.js';
import {
  configureSearchIndex,
  reindexListingsBlueGreen,
  syncListingsToSearchIndex,
} from '../lib/searchSync.js';
import { semanticSearch, checkEmbedderReadiness } from '../lib/vectorSearch.js';
import type { RetrievalMeta } from '../lib/retrievalMeta.js';

type ApiError = Error & { code: string; statusCode?: number };

type CreateApiError = (code: string, message: string, details?: Record<string, unknown>) => ApiError;

type ResolveAuthenticatedUserId = (
  request: FastifyRequest,
  requestedUserId?: string,
) => string;

type ServeMode = 'personalized' | 'degraded_lexical' | 'cold_start';

function deriveServeMode(
  backend: SearchBackend,
  embedderReady: boolean,
  method: RetrievalMeta['method'],
): ServeMode {
  if (backend === 'in_memory' || backend === 'elasticsearch_placeholder') {
    return 'cold_start';
  }
  if (backend === 'meilisearch' && embedderReady && method === 'hybrid') {
    return 'personalized';
  }
  return 'degraded_lexical';
}

type SearchRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: CreateApiError;
  resolveAuthenticatedUserId: ResolveAuthenticatedUserId;
};

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  /**
   * Result scope. 'items' (default) is the legacy adapter-backed listing
   * search — its response shape is unchanged. 'people' and 'boards' are
   * served by postgres (users / moodboards are not indexed in Meilisearch —
   * only the listings index exists — so they use the same ILIKE matching as
   * /users/search and /moodboards?q=). 'all' fuses all three scopes into one
   * ranked `results` list via reciprocal rank fusion.
   */
  scope: z.enum(['items', 'people', 'boards', 'all']).default('items'),
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

// ── Scoped (non-item) search ──────────────────────────────────────────────────
// Users and moodboards are not indexed in the search backend — only the
// listings index exists — so the people/boards scopes are always served by
// postgres ILIKE matching, mirroring /users/search and /moodboards?q=. The
// CASE tiers reproduce the /users/search match ordering and double as the
// scope-native score field that the fused 'all' mode ranks on.
//
// SCOPED_SEARCH_ENGINE_VERSION identifies the scoped-search SQL contract in
// retrievalMeta.searchEngineVersion.

const SCOPED_SEARCH_ENGINE_VERSION = 'scoped-search-postgres-v1';

type BoardSearchRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  cover_image_url: string;
  theme: string;
  item_count: number;
  created_at: string;
  updated_at: string;
  curator_username: string | null;
  curator_name: string | null;
  curator_avatar: string | null;
  score: string | number;
};

type PersonSearchRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar: string | null;
  is_following: boolean;
  score: string | number;
};

/**
 * Public moodboards matching the query on title/description — same
 * visibility gate and ILIKE matching as GET /moodboards, plus the
 * bidirectional block exclusion this endpoint applies to every scope.
 * Cover falls back to the board's first item media so search tiles never
 * carry a fabricated image.
 */
async function searchPublicBoards(
  db: Pool,
  q: string,
  opts: { limit: number; offset: number; excludedCreatorIds: string[] },
): Promise<BoardSearchRow[]> {
  const result = await db.query<BoardSearchRow>(
    `
      SELECT
        m.id, m.creator_id, m.title, m.description, m.theme,
        m.created_at::text, m.updated_at::text,
        COALESCE(
          NULLIF(m.cover_image_url, ''),
          (SELECT CASE WHEN mi.media_type = 'video' AND mi.poster_url <> ''
                       THEN mi.poster_url ELSE mi.media_url END
           FROM moodboard_items mi
           WHERE mi.moodboard_id = m.id AND mi.deleted_at IS NULL
           ORDER BY mi.sort_order
           LIMIT 1),
          ''
        ) AS cover_image_url,
        (SELECT COUNT(*)::int FROM moodboard_items mi
         WHERE mi.moodboard_id = m.id AND mi.deleted_at IS NULL) AS item_count,
        u.username AS curator_username,
        u.display_name AS curator_name,
        u.avatar AS curator_avatar,
        CASE
          WHEN lower(m.title) = lower($1) THEN 1.0
          WHEN lower(m.title) LIKE lower($1) || '%' THEN 0.8
          WHEN lower(m.title) LIKE '%' || lower($1) || '%' THEN 0.6
          ELSE 0.4
        END AS score
      FROM moodboards m
      LEFT JOIN users u ON u.id = m.creator_id
      WHERE m.visibility = 'public'
        AND m.deleted_at IS NULL
        AND (m.title ILIKE '%' || $1 || '%' OR m.description ILIKE '%' || $1 || '%')
        AND NOT (m.creator_id = ANY($2::text[]))
        AND u.is_erased = FALSE
        AND u.deleted_at IS NULL
      ORDER BY score DESC, m.updated_at DESC, m.id ASC
      LIMIT $3 OFFSET $4
    `,
    [q, opts.excludedCreatorIds, opts.limit, opts.offset]
  );
  return result.rows;
}

/**
 * People scope — mirrors /users/search: only users who opted into search
 * visibility, not erased/deleted, not blocked in either direction, and the
 * viewer is excluded from their own results. Scores mirror the tiered
 * match ordering (exact > username prefix > display-name prefix > infix).
 */
async function searchVisiblePeople(
  db: Pool,
  q: string,
  opts: {
    limit: number;
    offset: number;
    viewerUserId: string | null;
    excludedUserIds: string[];
  },
): Promise<PersonSearchRow[]> {
  const result = await db.query<PersonSearchRow>(
    `
      SELECT
        u.id, u.username, u.display_name, u.avatar,
        ($2::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM user_follows f
          WHERE f.follower_id = $2 AND f.following_id = u.id
        )) AS is_following,
        CASE
          WHEN lower(u.username) = lower($1) THEN 1.0
          WHEN lower(u.username) LIKE lower($1) || '%' THEN 0.8
          WHEN lower(u.display_name) LIKE lower($1) || '%' THEN 0.65
          WHEN lower(u.username) LIKE '%' || lower($1) || '%' THEN 0.5
          ELSE 0.35
        END AS score
      FROM users u
      WHERE (u.username ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%')
        AND u.is_erased = FALSE
        AND u.deleted_at IS NULL
        AND u.search_visibility = 'visible'
        AND ($2::text IS NULL OR u.id <> $2)
        AND NOT (u.id = ANY($3::text[]))
      ORDER BY score DESC, u.username ASC
      LIMIT $4 OFFSET $5
    `,
    [q, opts.viewerUserId, opts.excludedUserIds, opts.limit, opts.offset]
  );
  return result.rows;
}

function mapBoardHit(row: BoardSearchRow) {
  return {
    type: 'board' as const,
    id: row.id,
    title: row.title,
    description: row.description,
    coverImage: row.cover_image_url,
    curator: row.curator_name ?? row.curator_username ?? row.creator_id,
    curatorUsername: row.curator_username,
    curatorAvatar: row.curator_avatar,
    creatorId: row.creator_id,
    itemCount: Number(row.item_count),
    theme: row.theme,
    isPublic: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    score: Number(row.score),
  };
}

function mapPersonHit(row: PersonSearchRow) {
  return {
    type: 'person' as const,
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    isFollowing: row.is_following,
    score: Number(row.score),
  };
}

// ── Fused ranking (scope='all') ───────────────────────────────────────────────
// Scopes produce incomparable raw scores (adapter _rankingScore / in-memory
// rank vs the CASE tiers above), so fusion ranks by *position* — reciprocal
// rank fusion: score = 1 / (RRF_K + rank within scope). Scope-internal order
// is preserved verbatim and the top hit of each scope interleaves naturally.
// The fused `score` is the ordering key; `rawScore` keeps the scope's own
// relevance signal for display/debug.

const RRF_K = 60;

type FusedHitType = 'item' | 'person' | 'board';

export type FusedSearchHit = {
  /** Prefixed id (`item:lst_1`) — raw id lives on `data.id`. */
  id: string;
  type: FusedHitType;
  score: number;
  rawScore: number;
  data: Record<string, unknown>;
};

export function fuseScopedHits(
  scopes: Array<{
    type: FusedHitType;
    entries: Array<{ id: string; score: number; data: Record<string, unknown> }>;
  }>,
): FusedSearchHit[] {
  const fused: FusedSearchHit[] = [];
  for (const scopeResult of scopes) {
    scopeResult.entries.forEach((entry, index) => {
      fused.push({
        id: `${scopeResult.type}:${entry.id}`,
        type: scopeResult.type,
        score: 1 / (RRF_K + index + 1),
        rawScore: entry.score,
        data: entry.data,
      });
    });
  }
  // Stable sort: equal RRF scores keep scope order (items → people → boards).
  fused.sort((a, b) => b.score - a.score);
  return fused;
}

/**
 * Register search-related routes on the Fastify instance:
 *   GET  /search              — scoped search: items (SearchAdapter) +
 *                               people/boards (postgres) + fused 'all' mode
 *   GET  /search/autocomplete — autocomplete suggestions
 *   GET  /search/health       — search backend health check
 *   GET  /search/readiness    — embedder readiness probe
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

    const { q, scope, category, condition, size, minPrice, maxPrice, limit, offset } = parsed.data;
    const viewerUserId = request.authUser?.userId ?? null;

    // Sellers/creators blocked in either direction must not surface in any
    // scope. Blocks change too fast to index, so we over-fetch and filter at
    // read time — requesting extra rows keeps filtered pages full.
    let excludedSellerIds: Set<string> | null = null;
    if (viewerUserId) {
      const blockedResult = await db.query<{ other_id: string }>(
        `SELECT CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END AS other_id
         FROM user_blocks
         WHERE blocker_id = $1 OR blocked_id = $1`,
        [viewerUserId]
      );
      if (blockedResult.rows.length > 0) {
        excludedSellerIds = new Set(blockedResult.rows.map((r) => r.other_id));
      }
    }
    const excludedIdList = excludedSellerIds ? [...excludedSellerIds] : [];

    // ── Single-scope postgres paths (people / boards) ──
    // The structured filters (category, price bounds, …) are item-only —
    // they are silently inert for the people/boards scopes.
    if (scope === 'boards' || scope === 'people') {
      try {
        const hits =
          scope === 'boards'
            ? (await searchPublicBoards(db, q, {
                limit,
                offset,
                excludedCreatorIds: excludedIdList,
              })).map(mapBoardHit)
            : (await searchVisiblePeople(db, q, {
                limit,
                offset,
                viewerUserId,
                excludedUserIds: excludedIdList,
              })).map(mapPersonHit);
        return {
          ok: true,
          query: q,
          scope,
          total: hits.length,
          retrievalMeta: {
            method: 'lexical',
            embedderConfigured: false,
            searchEngineVersion: SCOPED_SEARCH_ENGINE_VERSION,
          } satisfies RetrievalMeta,
          items: hits,
        };
      } catch (error) {
        request.log.error({ err: error, query: q, scope }, 'Scoped search request failed');
        reply.code(500);
        return { ok: false, error: 'Search failed' };
      }
    }

    const fetchLimit = excludedSellerIds ? Math.min(limit + offset + 50, 200) : limit;

    const query: SearchQuery = {
      query: q,
      filters: {
        category,
        condition,
        size,
        minPrice,
        maxPrice,
      },
      limit: fetchLimit,
      offset: excludedSellerIds ? 0 : offset,
    };

    // ── Fused 'all' scope ──
    // Runs the three scopes concurrently, then merges into one ranked list.
    // `offset` is intentionally not applied here: fusion is a top-N
    // relevance window — deep pagination goes through the scoped modes.
    if (scope === 'all') {
      try {
        const adapter = createSearchAdapter();
        const [itemResults, peopleRows, boardRows] = await Promise.all([
          adapter.search({ ...query, offset: 0 }),
          searchVisiblePeople(db, q, {
            limit,
            offset: 0,
            viewerUserId,
            excludedUserIds: excludedIdList,
          }),
          searchPublicBoards(db, q, {
            limit,
            offset: 0,
            excludedCreatorIds: excludedIdList,
          }),
        ]);

        // Batch-resolve seller + card fields for the item leg in one query:
        // drops blocked sellers (same policy as scope=items) and attaches
        // the real cover/seller fields the fused tile needs — the index
        // document carries neither.
        const cardById = new Map<
          string,
          { sellerId: string; imageUrl: string | null; sellerUsername: string | null }
        >();
        if (itemResults.length > 0) {
          const cardRows = await db.query<{
            id: string;
            seller_id: string;
            image_url: string | null;
            seller_username: string | null;
          }>(
            `SELECT l.id, l.seller_id, l.image_url, u.username AS seller_username
             FROM listings l
             LEFT JOIN users u ON u.id = l.seller_id
             WHERE l.id = ANY($1::text[])`,
            [itemResults.map((r) => r.id)]
          );
          for (const row of cardRows.rows) {
            cardById.set(row.id, {
              sellerId: row.seller_id,
              imageUrl: row.image_url,
              sellerUsername: row.seller_username,
            });
          }
        }
        const visibleItems = (excludedSellerIds
          ? itemResults.filter((result) => {
              const sellerId = cardById.get(result.id)?.sellerId;
              return !sellerId || !excludedSellerIds.has(sellerId);
            })
          : itemResults
        ).slice(0, limit);

        const fused = fuseScopedHits([
          {
            type: 'item',
            entries: visibleItems.map((result) => ({
              id: result.id,
              score: result.score,
              data: {
                ...result.document,
                imageUrl: cardById.get(result.id)?.imageUrl ?? null,
                sellerUsername: cardById.get(result.id)?.sellerUsername ?? null,
              } as Record<string, unknown>,
            })),
          },
          {
            type: 'person',
            entries: peopleRows.map((row) => {
              const { type: _type, score, ...data } = mapPersonHit(row);
              return { id: row.id, score, data };
            }),
          },
          {
            type: 'board',
            entries: boardRows.map((row) => {
              const { type: _type, score, ...data } = mapBoardHit(row);
              return { id: row.id, score, data };
            }),
          },
        ]).slice(0, limit);

        const info = adapter.retrievalInfo();
        const readiness = await checkEmbedderReadiness();
        const retrievalMeta: RetrievalMeta = {
          method: 'lexical',
          embedderConfigured: info.embedderConfigured,
          searchEngineVersion: info.searchEngineVersion,
          // backend/degraded describe the item leg — people/boards are
          // postgres lexical in every deployment (no boards index exists).
          backend: info.backend,
          degraded: info.degraded === true ? true : undefined,
        };
        const serveMode = deriveServeMode(info.backend, readiness.ready, retrievalMeta.method);
        return {
          ok: true,
          query: q,
          scope,
          total: fused.length,
          counts: {
            items: visibleItems.length,
            people: peopleRows.length,
            boards: boardRows.length,
          },
          retrievalMeta,
          serveMode,
          results: fused,
        };
      } catch (error) {
        request.log.error({ err: error, query: q, scope }, 'Fused search request failed');
        reply.code(500);
        return { ok: false, error: 'Search failed' };
      }
    }

    try {
      const adapter = createSearchAdapter();
      let results = await adapter.search(query);
      if (excludedSellerIds && results.length > 0) {
        // The index document carries no seller id — batch-resolve sellers
        // for the candidate ids and drop blocked ones.
        const sellerRows = await db.query<{ id: string; seller_id: string }>(
          `SELECT id, seller_id FROM listings WHERE id = ANY($1::text[])`,
          [results.map((r) => r.id)]
        );
        const sellerById = new Map(sellerRows.rows.map((r) => [r.id, r.seller_id]));
        results = results
          .filter((result) => {
            const sellerId = sellerById.get(result.id);
            return !sellerId || !excludedSellerIds!.has(sellerId);
          })
          .slice(offset, offset + limit);
      }
      const info = adapter.retrievalInfo();
      const readiness = await checkEmbedderReadiness();
      const retrievalMeta: RetrievalMeta = {
        method: 'lexical',
        embedderConfigured: info.embedderConfigured,
        searchEngineVersion: info.searchEngineVersion,
        backend: info.backend,
        degraded: info.degraded === true ? true : undefined,
      };
      const serveMode = deriveServeMode(info.backend, readiness.ready, retrievalMeta.method);
      return {
        ok: true,
        query: q,
        scope,
        total: results.length,
        retrievalMeta,
        serveMode,
        items: results.map((result) => ({
          score: result.score,
          ...result.document,
          // Discriminator last so an index document can never shadow it.
          type: 'item' as const,
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
      const info = adapter.retrievalInfo();
      const healthy = await adapter.health();
      reply.code(healthy ? 200 : 503);
      // Report which backend actually serves and whether the configured
      // shared backend is degraded — a 200 here must mean the configured
      // backend answers, never that the in-memory fallback does.
      return {
        ok: healthy,
        backend: info.backend,
        degraded: info.degraded === true,
        searchEngineVersion: info.searchEngineVersion ?? null,
      };
    } catch (error) {
      reply.code(503);
      return { ok: false, error: 'Search backend unhealthy' };
    }
  });

  app.get('/search/readiness', async (_request, reply) => {
    try {
      const adapter = createSearchAdapter();
      const info = adapter.retrievalInfo();
      const readiness = await checkEmbedderReadiness();
      reply.code(readiness.ready ? 200 : 503);
      return {
        ok: readiness.ready,
        embedder: {
          ready: readiness.ready,
          names: readiness.embedderNames,
          reason: readiness.reason ?? null,
        },
        backend: info.backend,
        degraded: info.degraded === true,
        searchEngineVersion: info.searchEngineVersion ?? null,
      };
    } catch (error) {
      reply.code(503);
      return { ok: false, error: 'Readiness probe failed' };
    }
  });

  app.post('/search/semantic', async (request, reply) => {
    const parsed = semanticSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid semantic search request', details: parsed.error.flatten() };
    }

    const { query, limit, filters } = parsed.data;
    const viewerUserId = request.authUser?.userId ?? null;

    // Same bidirectional block exclusion as lexical search — over-fetch
    // and filter at read time since blocks aren't indexed.
    let excludedSellerIds: Set<string> | null = null;
    if (viewerUserId) {
      const blockedResult = await db.query<{ other_id: string }>(
        `SELECT CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END AS other_id
         FROM user_blocks
         WHERE blocker_id = $1 OR blocked_id = $1`,
        [viewerUserId]
      );
      if (blockedResult.rows.length > 0) {
        excludedSellerIds = new Set(blockedResult.rows.map((r) => r.other_id));
      }
    }

    try {
      const adapter = createSearchAdapter();
      const info = adapter.retrievalInfo();
      const { results, retrievalMeta } = await semanticSearch(query, {
        limit: excludedSellerIds ? Math.min(limit + 50, 200) : limit,
        filters,
      });
      let visibleResults = results;
      if (excludedSellerIds && results.length > 0) {
        const sellerRows = await db.query<{ id: string; seller_id: string }>(
          `SELECT id, seller_id FROM listings WHERE id = ANY($1::text[])`,
          [results.map((r) => r.id)]
        );
        const sellerById = new Map(sellerRows.rows.map((r) => [r.id, r.seller_id]));
        visibleResults = results
          .filter((result) => {
            const sellerId = sellerById.get(result.id);
            return !sellerId || !excludedSellerIds!.has(sellerId);
          })
          .slice(0, limit);
      }
      const readiness = await checkEmbedderReadiness();
      const serveMode = deriveServeMode(info.backend, readiness.ready, retrievalMeta.method);
      return {
        ok: true,
        query,
        total: visibleResults.length,
        retrievalMeta: {
          ...retrievalMeta,
          backend: info.backend,
          degraded: info.degraded === true ? true : undefined,
        },
        serveMode,
        items: visibleResults.map((result) => ({
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
      // Blue/green: build a versioned staging index and atomically swap it
      // live — an admin reindex can never corrupt the serving index.
      // Degrades to in-place when Meilisearch isn't configured.
      const result = await reindexListingsBlueGreen(db);
      if (!result.ok) {
        reply.code(500);
        return { ok: false, error: result.error ?? 'Reindex failed' };
      }
      return {
        ok: true,
        mode: result.mode,
        swapped: result.swapped,
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
