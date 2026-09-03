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
  sustainableOnly: z.coerce.boolean().optional().default(false),
  sort: z.enum(['relevance', 'recent', 'price_asc', 'price_desc', 'most_liked', 'ending_soon']).default('relevance'),
  page: z.coerce.number().int().min(1).max(100).default(1),
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
  sustainableOnly: boolean,
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
  if (sustainableOnly) {
    filterConditions.push(`l.sustainability_grade IN ('A', 'B')`);
  }

  const filterClause = filterConditions.length > 0
    ? `AND ${filterConditions.join(' AND ')}`
    : '';

  // Determine ORDER BY based on sort option
  const extraJoins: string[] = [];
  const extraSelects: string[] = [];
  if (sort === 'most_liked') {
    extraSelects.push('COALESCE(wl.like_count, 0) AS like_count');
    extraJoins.push(
      `LEFT JOIN (SELECT listing_id, COUNT(DISTINCT user_id) AS like_count FROM interactions WHERE action = 'wishlist' GROUP BY listing_id) wl ON wl.listing_id = l.id`,
    );
  }
  if (sort === 'ending_soon') {
    extraSelects.push('a.ends_at');
    extraJoins.push('LEFT JOIN auctions a ON a.listing_id = l.id');
  }

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
    case 'most_liked':
      orderBy = 'like_count DESC, l.created_at DESC, l.id DESC';
      break;
    case 'ending_soon':
      orderBy = 'a.ends_at ASC NULLS LAST, l.created_at DESC, l.id DESC';
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
    like_count?: string | number | null;
    ends_at?: string | null;
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
        l.category${extraSelects.length ? `, ${extraSelects.join(', ')}` : ''}
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      ${extraJoins.join('\n      ')}
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
        l.brand, l.size, l.condition, l.category${extraSelects.length ? `, ${extraSelects.join(', ')}` : ''}
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      ${extraJoins.join('\n      ')}
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
      ORDER BY ${orderBy}
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
 *   GET /search/analytics     — recent search analytics summary
 *
 * NOTE: `/search`, `/search/autocomplete`, `/search/health`,
 * `/search/semantic` and `/search/reindex` are registered by `search.ts`.
 * The `/search/autocomplete` route is solely owned by `search.ts`
 * (adapter-backed with Redis caching and analytics); no duplicate is
 * registered here.
 */
export const registerSearchExtendedRoutes = ({
  app,
  readDb,
  redis,
}: SearchExtendedRouteDependencies): void => {
  app.get('/search/listings', async (request) => {
    const { q, limit, category, condition, size, priceMin, priceMax, sustainableOnly, sort, page } =
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
        sustainableOnly,
      },
      sort,
      page,
      limit,
    };

    // ── Cache-first read with stale-while-revalidate ──
    const revalidate = async (): Promise<void> => {
      const freshResult = await computeSearchResults(
        readDb, q, limit, category, condition, size, priceMin, priceMax, sort, page,
        searchPolicyVersion, sustainableOnly,
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
      searchPolicyVersion, sustainableOnly,
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

  // ── Search analytics endpoint ─────────────────────────────────────────────────

  app.get('/search/analytics', async () => {
    const { getSearchAnalytics } = await import('../lib/searchCache.js');
    const analytics = await getSearchAnalytics(redis, 5);
    return { ok: true, analytics };
  });
};
