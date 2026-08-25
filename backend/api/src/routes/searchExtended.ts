import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  getCachedOrRevalidate,
  setCachedSearchResult,
  recordSearchAnalytics,
  trackQueryFrequency,
  type SearchQueryParams,
  type CachedSearchResult,
} from '../lib/searchCache.js';
import type { RetrievalMeta, RetrievalFallbackReason } from '../lib/retrievalMeta.js';

type SearchExtendedRouteDependencies = {
  app: FastifyInstance;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
  redis: Redis;
};

const searchListingsQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  sort: z.enum(['relevance', 'recent', 'price_asc', 'price_desc']).default('relevance'),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

/**
 * Compute search results from the database. Extracted as a helper
 * so it can be called both on cache miss and during background
 * revalidation.
 */
async function computeSearchResults(
  dbPool: Pool,
  q: string,
  limit: number,
  category: string | undefined,
  condition: string | undefined,
  size: string | undefined,
  priceMin: number | undefined,
  priceMax: number | undefined,
  sort: string,
  page: number,
  searchPolicyVersion: string,
): Promise<Omit<CachedSearchResult, 'cachedAt' | 'fromCache' | 'stale'>> {
  const offset = (page - 1) * limit;

  // Build dynamic WHERE clause for filters
  const filterConditions: string[] = [];
  const filterArgs: unknown[] = [];
  let filterIdx = 2; // $1 is the query text

  if (category) {
    filterConditions.push(`l.category = $${filterIdx++}`);
    filterArgs.push(category);
  }
  if (condition) {
    filterConditions.push(`l.condition = $${filterIdx++}`);
    filterArgs.push(condition);
  }
  if (size) {
    filterConditions.push(`l.size = $${filterIdx++}`);
    filterArgs.push(size);
  }
  if (priceMin !== undefined) {
    filterConditions.push(`l.price_gbp >= $${filterIdx++}`);
    filterArgs.push(priceMin);
  }
  if (priceMax !== undefined) {
    filterConditions.push(`l.price_gbp <= $${filterIdx++}`);
    filterArgs.push(priceMax);
  }

  const filterClause = filterConditions.length > 0
    ? `AND ${filterConditions.join(' AND ')}`
    : '';

  // Determine ORDER BY based on sort option
  let orderBy: string;
  switch (sort) {
    case 'recent':
      orderBy = 'l.created_at DESC, l.id DESC';
      break;
    case 'price_asc':
      orderBy = 'l.price_gbp ASC, l.id DESC';
      break;
    case 'price_desc':
      orderBy = 'l.price_gbp DESC, l.id DESC';
      break;
    case 'relevance':
    default:
      orderBy = 'rank_score::numeric DESC, l.created_at DESC, l.id DESC';
      break;
  }

  const result = await dbPool.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: string;
    image_url: string | null;
    created_at: string;
    rank_score: string;
    seller_username: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    category: string | null;
  }>(
    `
      SELECT
        l.id,
        l.seller_id,
        l.title,
        l.description,
        l.price_gbp::text,
        l.image_url,
        l.created_at::text,
        ts_rank_cd(l.search_vector, websearch_to_tsquery('simple', $1))::text AS rank_score,
        u.username AS seller_username,
        l.brand,
        l.size,
        l.condition,
        l.category
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      WHERE l.status = 'active'
        AND (
          l.search_vector @@ websearch_to_tsquery('simple', $1)
          OR POSITION(lower($1) IN lower(COALESCE(l.brand, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.category, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.size, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.condition, ''))) > 0
        )
        ${filterClause}
      ORDER BY ${orderBy}
      LIMIT $${filterIdx} OFFSET $${filterIdx + 1}
    `,
    [q, ...filterArgs, limit, offset]
  );

  if (result.rowCount && result.rowCount > 0) {
    const retrievalMeta: RetrievalMeta = {
      method: 'lexical',
      embedderConfigured: false,
      searchEngineVersion: searchPolicyVersion,
    };
    return {
      ok: true,
      query: q,
      decision: {
        policyVersion: searchPolicyVersion,
        capabilityLevel: 'postgres_lexical',
        fallback: false,
      },
      retrievalMeta,
      items: result.rows.map((row) => ({
        id: row.id,
        sellerId: row.seller_id,
        title: row.title,
        description: row.description,
        priceGbp: Number(row.price_gbp),
        imageUrl: row.image_url,
        rank: Number(row.rank_score),
        createdAt: row.created_at,
        // Commerce facts are passed through as-is (including null). The
        // frontend renders only known facts and never fabricates a brand,
        // size, or condition (audit P0.4).
        brand: row.brand,
        size: row.size,
        condition: row.condition,
        category: row.category,
        seller: row.seller_username
          ? {
              id: row.seller_id,
              username: row.seller_username,
              avatar: null,
              rating: null,
              reviewCount: null,
              location: null,
            }
          : null,
      })),
    };
  }

  // Fallback: ILIKE search when full-text search returns nothing
  const fallback = await dbPool.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: string;
    image_url: string | null;
    created_at: string;
    seller_username: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    category: string | null;
  }>(
    `
      SELECT l.id, l.seller_id, l.title, l.description, l.price_gbp::text, l.image_url, l.created_at::text,
        u.username AS seller_username,
        l.brand, l.size, l.condition, l.category
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      WHERE l.status = 'active'
        AND (
          POSITION(lower($1) IN lower(l.title)) > 0
          OR POSITION(lower($1) IN lower(l.description)) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.brand, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.category, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.size, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.condition, ''))) > 0
        )
        ${filterClause}
      ORDER BY ${sort === 'price_asc' ? 'l.price_gbp ASC' : sort === 'price_desc' ? 'l.price_gbp DESC' : 'l.created_at DESC'}, l.id DESC
      LIMIT $${filterIdx} OFFSET $${filterIdx + 1}
    `,
    [q, ...filterArgs, limit, offset]
  );

  const fallbackReason: RetrievalFallbackReason = 'fts_no_matches_ilike_fallback';
  const retrievalMeta: RetrievalMeta = {
    method: 'lexical',
    fallbackReason,
    embedderConfigured: false,
    searchEngineVersion: searchPolicyVersion,
  };
  return {
    ok: true,
    query: q,
    fallback: true,
    decision: {
      policyVersion: searchPolicyVersion,
      capabilityLevel: 'postgres_lexical',
      fallback: true,
    },
    retrievalMeta,
    items: fallback.rows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      priceGbp: Number(row.price_gbp),
      imageUrl: row.image_url,
      rank: 0,
      createdAt: row.created_at,
      // Commerce facts passed through as-is (including null) so the
      // frontend renders only known facts (audit P0.4).
      brand: row.brand,
      size: row.size,
      condition: row.condition,
      category: row.category,
      seller: row.seller_username
        ? {
            id: row.seller_id,
            username: row.seller_username,
            avatar: null,
            rating: null,
            reviewCount: null,
            location: null,
          }
        : null,
    })),
  };
}

/**
 * Register the remaining inline search routes that are not already handled
 * by `registerSearchRoutes` in `search.ts`:
 *   GET /search/listings      — cached postgres full-text listing search
 *   GET /search/autocomplete  — autocomplete suggestions (cached)
 *   GET /search/analytics     — recent search analytics summary
 *
 * NOTE: `/search`, `/search/autocomplete` (adapter-backed), `/search/health`,
 * `/search/semantic` and `/search/reindex` are registered by `search.ts`.
 * The `/search/autocomplete` route here is the legacy postgres-backed
 * implementation that predates the SearchAdapter. Both are registered; the
 * last registration wins in Fastify, so the order in `index.ts` determines
 * which handler serves the route at runtime.
 */
export const registerSearchExtendedRoutes = ({
  app,
  readDb,
  redis,
}: SearchExtendedRouteDependencies): void => {
  app.get('/search/listings', async (request) => {
    const { q, limit, category, condition, size, priceMin, priceMax, sort, page } =
      searchListingsQuerySchema.parse(request.query);
    const searchPolicyVersion = 'listing-search-postgres-v3.0';
    const startTime = Date.now();

    // Build cache params from the normalized query
    const cacheParams: SearchQueryParams = {
      q,
      filters: {
        category,
        condition,
        size,
        priceMin,
        priceMax,
      },
      sort,
      page,
      limit,
    };

    // ── Cache-first read with stale-while-revalidate ──
    const revalidate = async (): Promise<void> => {
      const freshResult = await computeSearchResults(
        readDb, q, limit, category, condition, size, priceMin, priceMax, sort, page,
        searchPolicyVersion,
      );
      await setCachedSearchResult(redis, cacheParams, freshResult);
    };

    const cached = await getCachedOrRevalidate(redis, cacheParams, revalidate);
    if (cached) {
      const responseTimeMs = Date.now() - startTime;
      const zeroResults = cached.items.length === 0;

      // Track analytics (fire-and-forget)
      void recordSearchAnalytics(redis, {
        query: q,
        responseTimeMs,
        zeroResults,
        cacheHit: true,
      });
      void trackQueryFrequency(redis, q);

      return {
        ...cached,
        fromCache: true,
        responseTimeMs,
      };
    }

    // ── Cache miss: compute results from DB ──
    const computed = await computeSearchResults(
      readDb, q, limit, category, condition, size, priceMin, priceMax, sort, page,
      searchPolicyVersion,
    );

    const responseTimeMs = Date.now() - startTime;
    const zeroResults = computed.items.length === 0;

    // Cache the result (fire-and-forget, don't block response)
    void setCachedSearchResult(redis, cacheParams, computed);

    // Track analytics and query frequency (fire-and-forget)
    void recordSearchAnalytics(redis, {
      query: q,
      responseTimeMs,
      zeroResults,
      cacheHit: false,
    });
    void trackQueryFrequency(redis, q);

    return {
      ...computed,
      fromCache: false,
      responseTimeMs,
    };
  });

  // ── Autocomplete endpoint ─────────────────────────────────────────────────────

  app.get('/search/autocomplete', async (request) => {
    const { q, limit } = autocompleteQuerySchema.parse(request.query);
    const startTime = Date.now();

    // Check autocomplete cache first
    const { getCachedAutocomplete, setCachedAutocomplete } = await import('../lib/searchCache.js');
    const cached = await getCachedAutocomplete(redis, q);
    if (cached) {
      return {
        ok: true,
        query: q,
        suggestions: cached.slice(0, limit),
        fromCache: true,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Query database for autocomplete suggestions
    const result = await readDb.query<{ term: string; suggestion_type: 'item' | 'brand' | 'category'; frequency: string }>(
      `
        SELECT
          MIN(display_term) AS term,
          suggestion_type,
          COUNT(*)::text AS frequency
        FROM (
          SELECT trim(l.title) AS display_term, lower(trim(l.title)) AS normalized_term, 'item' AS suggestion_type
          FROM listings l
          WHERE l.status = 'active' AND lower(trim(l.title)) LIKE lower($1 || '%')
          UNION ALL
          SELECT trim(COALESCE(l.brand, '')) AS display_term, lower(trim(COALESCE(l.brand, ''))) AS normalized_term, 'brand' AS suggestion_type
          FROM listings l
          WHERE l.status = 'active' AND lower(trim(COALESCE(l.brand, ''))) LIKE lower($1 || '%')
          UNION ALL
          SELECT trim(COALESCE(l.category, '')) AS display_term, lower(trim(COALESCE(l.category, ''))) AS normalized_term, 'category' AS suggestion_type
          FROM listings l
          WHERE l.status = 'active' AND lower(trim(COALESCE(l.category, ''))) LIKE lower($1 || '%')
        ) AS suggestions
        WHERE normalized_term != ''
        GROUP BY normalized_term, suggestion_type
        ORDER BY frequency DESC, length(normalized_term) ASC
        LIMIT $2
      `,
      [q, limit]
    );

    const suggestions = result.rows.map((row) => ({
      text: row.term,
      type: row.suggestion_type,
      score: Number(row.frequency),
    }));

    // Cache the suggestions (fire-and-forget)
    void setCachedAutocomplete(redis, q, suggestions);

    return {
      ok: true,
      query: q,
      suggestions,
      fromCache: false,
      responseTimeMs: Date.now() - startTime,
    };
  });

  // ── Search analytics endpoint ─────────────────────────────────────────────────

  app.get('/search/analytics', async () => {
    const { getSearchAnalytics } = await import('../lib/searchCache.js');
    const analytics = await getSearchAnalytics(redis, 5);
    return { ok: true, analytics };
  });
};
