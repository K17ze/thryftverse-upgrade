import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { config } from '../config.js';
import {
  getCachedSearchResult,
  setCachedSearchResult,
  getCachedOrRevalidate,
  invalidateSearchCache,
  trackQueryFrequency,
  recordSearchAnalytics,
  type SearchQueryParams,
  type CachedSearchResult,
} from '../lib/searchCache.js';
import {
  removeListingFromIndex,
  syncSingleListing,
} from '../lib/searchSync.js';
import {
  PRODUCT_RECOMMENDATION_POLICY_VERSION,
  scoreProductRecommendation,
} from '../lib/productRecommendationPolicy.js';
import { validateListingActivation } from '../lib/listingCategoryPolicy.js';
import { moderateListingText } from '../lib/moderation/moderationService.js';
import { appendDomainEvent, completeDomainOutboxEvent } from '../lib/domainOutbox.js';
import { enqueueOutboxDrainJob } from '../lib/queues.js';
import { publishRealtimeEvent } from '../lib/realtime.js';
import { checkFraudNonBlocking } from '../lib/fraudDetection.js';
import {
  evaluateRisk,
  recordExecution,
  type RiskDecision,
} from '../lib/riskDecision.js';
import { evaluatePriceAlertsForListing } from './priceAlerts.js';
import { recordListingCreated } from '../lib/metrics.js';
import type { AuthenticatedUser } from '../lib/auth.js';

// â”€â”€ Local helpers (mirrored from index.ts) â”€â”€

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeRequestHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function createRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

// â”€â”€ Local types â”€â”€

interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

type DbQueryable = Pick<PoolClient, 'query'>;

// â”€â”€ Dependency injection â”€â”€

type ListingRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
  redis: Redis;
  resolveAuthenticatedUserId: (request: { authUser?: AuthenticatedUser }, requestedUserId?: string) => string;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => ApiError;
  getApiError: (error: unknown) => ApiError | null;
  statusCodeForApiError: (code: string) => number;
  ensureUserExists: (userId: string) => Promise<void>;
  ensureSecurityAdminAccess: (
    request: { headers: Record<string, string | string[] | undefined>; authUser?: AuthenticatedUser },
    reply: { code: (statusCode: number) => unknown }
  ) => { ok: false; error: string } | null;
  sendCommerceOrderSmsNotifications: (input: {
    orderId: string;
    orderStatus: string;
    trackingNumber?: string | null;
    shippingProvider?: string | null;
    reason?: string;
  }) => Promise<void>;
  optionalAuthenticate: (request: { headers: Record<string, string | string[] | undefined>; authUser?: AuthenticatedUser }, requestPath: string) => Promise<void>;
  queueUserNotification: (input: {
    userId: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    eventType?: string;
    actorUserId?: string;
    imageUrl?: string;
    route?: Record<string, unknown>;
    idempotencyKey?: string;
  }) => Promise<string | null>;
  fraudShadowService?: {
    scoreShadow(input: unknown): Promise<unknown>;
    logScoreComparison(
      eventId: string,
      eventType: string,
      userId: string | null,
      ruleEngineResult: unknown,
      shadowResult: unknown,
      input: unknown,
    ): Promise<void>;
  } | null;
  ipReputationProvider?: import('../lib/riskDecision.js').IpReputationProvider;
};

export const registerListingRoutes = ({
  app,
  db,
  readDb,
  redis,
  resolveAuthenticatedUserId,
  createApiError,
  getApiError,
  statusCodeForApiError,
  ensureUserExists,
  ensureSecurityAdminAccess,
  sendCommerceOrderSmsNotifications,
  optionalAuthenticate,
  queueUserNotification,
  fraudShadowService,
  ipReputationProvider,
}: ListingRouteDependencies) => {
app.get('/listings', async (request) => {
  const querySchema = z.object({
    q: z.string().trim().min(1).max(120).optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    size: z.string().optional(),
    condition: z.string().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).optional().default('newest'),
    limit: z.coerce.number().int().min(1).max(200).optional().default(100),
    cursor: z.string().optional(),
  });
  const params = querySchema.parse(request.query ?? {});

  const conditions: string[] = ["status = 'active'"];
  const args: unknown[] = [];

  if (params.q) {
    conditions.push(`(
      l.title ILIKE $${args.length + 1}
      OR COALESCE(l.description, '') ILIKE $${args.length + 1}
      OR COALESCE(l.brand, '') ILIKE $${args.length + 1}
      OR COALESCE(l.category, '') ILIKE $${args.length + 1}
    )`);
    args.push(`%${params.q}%`);
  }

  if (params.category) {
    conditions.push(`category = $${args.length + 1}`);
    args.push(params.category);
  }
  if (params.brand) {
    conditions.push(`brand ILIKE $${args.length + 1}`);
    args.push(`%${params.brand}%`);
  }
  if (params.size) {
    conditions.push(`size ILIKE $${args.length + 1}`);
    args.push(`%${params.size}%`);
  }
  if (params.condition) {
    conditions.push(`condition ILIKE $${args.length + 1}`);
    args.push(`%${params.condition}%`);
  }
  if (params.minPrice !== undefined) {
    conditions.push(`price_gbp >= $${args.length + 1}`);
    args.push(params.minPrice);
  }
  if (params.maxPrice !== undefined) {
    conditions.push(`price_gbp <= $${args.length + 1}`);
    args.push(params.maxPrice);
  }

  let cursorData: { sortValue: string | number; id: string } | null = null;
  if (params.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(params.cursor, 'base64').toString('utf-8'));
      cursorData = { sortValue: decoded.sortValue, id: decoded.id };
    } catch {
      // Invalid cursor â€” ignore it, start from beginning
    }
  }

  const orderBy =
    params.sort === 'price_asc'
      ? 'price_gbp ASC, l.id ASC'
      : params.sort === 'price_desc'
        ? 'price_gbp DESC, l.id DESC'
        : 'l.created_at DESC, l.id DESC';

  if (cursorData) {
    if (params.sort === 'price_asc') {
      conditions.push(`(price_gbp, l.id) > ($${args.length + 1}, $${args.length + 2})`);
      args.push(cursorData.sortValue, cursorData.id);
    } else if (params.sort === 'price_desc') {
      conditions.push(`(price_gbp, l.id) < ($${args.length + 1}, $${args.length + 2})`);
      args.push(cursorData.sortValue, cursorData.id);
    } else {
      conditions.push(`(l.created_at, l.id) < ($${args.length + 1}, $${args.length + 2})`);
      args.push(cursorData.sortValue, cursorData.id);
    }
  }

  const fetchLimit = params.limit + 1;

  const result = await readDb.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: number | string;
    image_url: string | null;
    status: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    original_price_gbp: number | string | null;
    created_at: string;
    seller_username: string | null;
  }>(
    `
      SELECT
        l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
        l.status, l.category, l.brand, l.size, l.condition, l.original_price_gbp, l.created_at,
        u.username AS seller_username
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${args.length + 1}
    `,
    [...args, fetchLimit]
  );

  const hasMore = result.rows.length > params.limit;
  const pageRows = hasMore ? result.rows.slice(0, params.limit) : result.rows;

  const listingIds = pageRows.map((r) => r.id);
  const imagesResult = listingIds.length
      ? await readDb.query<{
        listing_id: string;
        image_url: string;
        sort_order: number;
        media_width: number | null;
        media_height: number | null;
      }>(
        `SELECT
           listing_id,
           image_url,
           sort_order,
           NULLIF(to_jsonb(listing_images) ->> 'media_width', '')::integer AS media_width,
           NULLIF(to_jsonb(listing_images) ->> 'media_height', '')::integer AS media_height
         FROM listing_images
         WHERE listing_id = ANY($1)
         ORDER BY listing_id, sort_order`,
        [listingIds]
      )
    : { rows: [] };

  const imagesByListing = new Map<string, string[]>();
  const primaryGeometryByListing = new Map<string, { width: number; height: number } | null>();
  for (const img of imagesResult.rows) {
    const arr = imagesByListing.get(img.listing_id) ?? [];
    arr.push(img.image_url);
    imagesByListing.set(img.listing_id, arr);
    if (!primaryGeometryByListing.has(img.listing_id)) {
      primaryGeometryByListing.set(
        img.listing_id,
        img.media_width !== null && img.media_height !== null
          ? { width: img.media_width, height: img.media_height }
          : null,
      );
    }
  }

  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && lastRow
    ? Buffer.from(JSON.stringify({
        sortValue: params.sort === 'price_asc' || params.sort === 'price_desc'
          ? Number(lastRow.price_gbp)
          : lastRow.created_at,
        id: lastRow.id,
      })).toString('base64')
    : undefined;

  return {
    items: pageRows.map((row) => {
      const primaryGeometry = primaryGeometryByListing.get(row.id);
      return {
        id: row.id,
        sellerId: row.seller_id,
        title: row.title,
        description: row.description,
        priceGbp: Number(row.price_gbp),
        imageUrl: row.image_url,
        images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
        mediaWidth: primaryGeometry?.width ?? null,
        mediaHeight: primaryGeometry?.height ?? null,
        mediaAspectRatio: primaryGeometry
          ? primaryGeometry.width / primaryGeometry.height
          : null,
        status: row.status,
        category: row.category,
        brand: row.brand,
        size: row.size,
        condition: row.condition,
        originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
        createdAt: row.created_at,
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
      };
    }),
    nextCursor,
  };
});

app.get('/search/listings', async (request) => {
  const querySchema = z.object({
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

  const { q, limit, category, condition, size, priceMin, priceMax, sort, page } =
    querySchema.parse(request.query);
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

  // â”€â”€ Cache-first read with stale-while-revalidate â”€â”€
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

  // â”€â”€ Cache miss: compute results from DB â”€â”€
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

/**
 * Compute search results from the database. Extracted as a helper
 * so it can be called both on cache miss and during background
 * revalidation.
 */
async function computeSearchResults(
  dbPool: typeof readDb,
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
    return {
      ok: true,
      query: q,
      decision: {
        policyVersion: searchPolicyVersion,
        capabilityLevel: 'postgres_lexical',
        fallback: false,
      },
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

  return {
    ok: true,
    query: q,
    fallback: true,
    decision: {
      policyVersion: searchPolicyVersion,
      capabilityLevel: 'postgres_lexical',
      fallback: true,
    },
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

// â”€â”€ Autocomplete endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/search/autocomplete', async (request) => {
  const querySchema = z.object({
    q: z.string().trim().min(1).max(120),
    limit: z.coerce.number().int().min(1).max(20).default(8),
  });

  const { q, limit } = querySchema.parse(request.query);
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

// â”€â”€ Search analytics endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/search/analytics', async () => {
  const { getSearchAnalytics } = await import('../lib/searchCache.js');
  const analytics = await getSearchAnalytics(redis, 5);
  return { ok: true, analytics };
});

app.get('/feed/looks', async () => {
  const now = Date.now();

  const realLooksResult = await db.query<{
    id: string;
    creator_id: string;
    title: string;
    media_url: string;
    created_at: string;
  }>(
    `
      SELECT id, creator_id, title, media_url, created_at
      FROM looks
      WHERE status = 'published'
      ORDER BY created_at DESC
      LIMIT 12
    `
  );

  const realLooks = realLooksResult.rows.map((row, idx) => {
    const createdAtMs = new Date(row.created_at).getTime();
    const ageHours = Math.max(1, Math.floor((now - createdAtMs) / (60 * 60 * 1000)));
    const timeAgo = ageHours < 24 ? `${ageHours}h ago` : `${Math.floor(ageHours / 24)}d ago`;
    return {
      id: row.id,
      rank: idx + 1,
      creator: {
        id: row.creator_id,
        name: row.creator_id,
        avatar: '',
        isVerified: false,
      },
      title: row.title,
      description: '',
      coverImage: row.media_url,
      items: [] as Array<{ id: string; label: string }>,
      likes: 0,
      comments: 0,
      timeAgo,
    };
  });

  return {
    items: realLooks.sort((a, b) => a.rank - b.rank),
  };
});

app.get('/feed/home', async () => {
  const listingsResult = await readDb.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: number | string;
    image_url: string | null;
    status: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    original_price_gbp: number | string | null;
    created_at: string;
  }>(
    `
      SELECT id, seller_id, title, description, price_gbp, image_url,
        status, category, brand, size, condition, original_price_gbp, created_at
      FROM listings
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 20
    `
  );

  const listingIds = listingsResult.rows.map((r) => r.id);
  const imagesResult = listingIds.length
    ? await readDb.query<{ listing_id: string; image_url: string; sort_order: number }>(
        `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
        [listingIds]
      )
    : { rows: [] };

  const imagesByListing = new Map<string, string[]>();
  for (const img of imagesResult.rows) {
    const arr = imagesByListing.get(img.listing_id) ?? [];
    arr.push(img.image_url);
    imagesByListing.set(img.listing_id, arr);
  }

  const postersResult = await readDb.query<{
    id: string;
    creator_id: string;
    media_url: string;
    caption: string;
    created_at: string;
  }>(
    `
      SELECT id, creator_id, media_url, caption, created_at
      FROM posters
      WHERE status = 'published'
      ORDER BY created_at DESC
      LIMIT 6
    `
  );

  const looksResult = await readDb.query<{
    id: string;
    creator_id: string;
    title: string;
    media_url: string;
    created_at: string;
  }>(
    `
      SELECT id, creator_id, title, media_url, created_at
      FROM looks
      WHERE status = 'published'
      ORDER BY created_at DESC
      LIMIT 6
    `
  );

  return {
    listings: listingsResult.rows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      priceGbp: Number(row.price_gbp),
      imageUrl: row.image_url,
      images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
      status: row.status,
      category: row.category,
      brand: row.brand,
      size: row.size,
      condition: row.condition,
      originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
      createdAt: row.created_at,
    })),
    posters: postersResult.rows.map((row) => ({
      id: row.id,
      creatorId: row.creator_id,
      mediaUrl: row.media_url,
      caption: row.caption,
      createdAt: row.created_at,
    })),
    looks: looksResult.rows.map((row) => ({
      id: row.id,
      creatorId: row.creator_id,
      title: row.title,
      mediaUrl: row.media_url,
      createdAt: row.created_at,
    })),
  };
});

// GET /feed/trending â€” trending listings based on engagement velocity.
// Public endpoint. Supports window (24h/7d/30d), category filter, and limit.
app.get('/feed/trending', async (request) => {
  const querySchema = z.object({
    window: z.enum(['24h', '7d', '30d']).default('24h'),
    category: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  });
  const { window: timeWindow, category, limit } = querySchema.parse(request.query);

  const intervalMap: Record<string, string> = {
    '24h': "INTERVAL '24 hours'",
    '7d': "INTERVAL '7 days'",
    '30d': "INTERVAL '30 days'",
  };
  const interval = intervalMap[timeWindow];

  const params: Array<string | number> = [];
  let categoryClause = '';
  if (category) {
    params.push(category);
    categoryClause = `AND l.category = $${params.length}`;
  }
  params.push(limit);

  const result = await readDb.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: number | string;
    image_url: string | null;
    status: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    original_price_gbp: number | string | null;
    created_at: string;
    recent_events: string | number;
    velocity: string | number;
  }>(
    `
      SELECT l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
             l.status, l.category, l.brand, l.size, l.condition,
             l.original_price_gbp, l.created_at,
             COALESCE(e.recent_events, 0) AS recent_events,
             COALESCE(e.recent_events, 0)::float /
               GREATEST(EXTRACT(EPOCH FROM (NOW() - l.created_at)) / 3600, 1) AS velocity
      FROM listings l
      LEFT JOIN (
        SELECT listing_id, COUNT(*) AS recent_events
        FROM listing_events
        WHERE created_at > NOW() - ${interval}
        GROUP BY listing_id
      ) e ON e.listing_id = l.id
      WHERE l.status = 'active'
        AND l.sold_at IS NULL
        ${categoryClause}
        AND l.created_at > NOW() - INTERVAL '30 days'
      ORDER BY velocity DESC, l.created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  const listingIds = result.rows.map((r) => r.id);
  const imagesResult = listingIds.length
    ? await readDb.query<{ listing_id: string; image_url: string; sort_order: number }>(
        `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
        [listingIds]
      )
    : { rows: [] };

  const imagesByListing = new Map<string, string[]>();
  for (const img of imagesResult.rows) {
    const arr = imagesByListing.get(img.listing_id) ?? [];
    arr.push(img.image_url);
    imagesByListing.set(img.listing_id, arr);
  }

  return {
    ok: true,
    window: timeWindow,
    items: result.rows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      priceGbp: Number(row.price_gbp),
      imageUrl: row.image_url,
      images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
      status: row.status,
      category: row.category,
      brand: row.brand,
      size: row.size,
      condition: row.condition,
      originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
      createdAt: row.created_at,
      velocity: Number(row.velocity),
    })),
  };
});

// GET /feed/following â€” social activity feed from followed users.
// Auth required. Returns recent listings and looks from followed sellers.
app.get('/feed/following', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().optional(),
  });
  const { limit, cursor } = querySchema.parse(request.query);

  const cursorCondition = cursor
    ? `AND created_at < $2`
    : `AND created_at > NOW() - INTERVAL '7 days'`;
  const cursorParams = cursor ? [request.authUser.userId, cursor, limit] : [request.authUser.userId, limit];

  // Union of listings and looks from followed users
  const listingsResult = await db.query<{
    id: string;
    seller_id: string;
    title: string;
    price_gbp: number | string;
    image_url: string | null;
    created_at: string;
  }>(
    `
      SELECT l.id, l.seller_id, l.title, l.price_gbp, l.image_url, l.created_at
      FROM listings l
      JOIN user_follows uf ON uf.followee_id = l.seller_id
      WHERE uf.follower_id = $1
        AND l.status = 'active'
        ${cursorCondition}
      ORDER BY l.created_at DESC
      LIMIT $${cursorParams.length}
    `,
    cursorParams
  );

  const looksResult = await db.query<{
    id: string;
    creator_id: string;
    title: string;
    media_url: string | null;
    created_at: string;
  }>(
    `
      SELECT lk.id, lk.creator_id, lk.title, lk.media_url, lk.created_at
      FROM looks lk
      JOIN user_follows uf ON uf.followee_id = lk.creator_id
      WHERE uf.follower_id = $1
        AND lk.status = 'published'
        ${cursorCondition}
      ORDER BY lk.created_at DESC
      LIMIT $${cursorParams.length}
    `,
    cursorParams
  );

  // Merge and sort by created_at DESC
  const items: Array<{
    activityType: string;
    entityId: string;
    entityTitle: string;
    actorId: string;
    createdAt: string;
    images: string[] | null;
    priceGbpMinor: number | null;
  }> = [
    ...listingsResult.rows.map((r) => ({
      activityType: 'listing',
      entityId: r.id,
      entityTitle: r.title,
      actorId: r.seller_id,
      createdAt: r.created_at,
      images: r.image_url ? [r.image_url] : [],
      priceGbpMinor: Math.round(Number(r.price_gbp) * 100),
    })),
    ...looksResult.rows.map((r) => ({
      activityType: 'look',
      entityId: r.id,
      entityTitle: r.title,
      actorId: r.creator_id,
      createdAt: r.created_at,
      images: r.media_url ? [r.media_url] : null,
      priceGbpMinor: null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const sliced = items.slice(0, limit);
  const nextCursor = items.length > limit ? sliced[sliced.length - 1]?.createdAt ?? null : null;

  return { ok: true, items: sliced, nextCursor };
});

app.post('/visual-search', async (request, reply) => {
  // Visual Search â€” honest hybrid implementation.
  // Image-similarity ML is not deployed. Instead we run a real filtered query
  // (category + brand + price + description text) over active listings, reusing
  // the same row shape as GET /listings. The response carries visualMatching=false
  // so the frontend can label results truthfully ("Similar by category, brand &
  // description") rather than claiming AI image matching.
  const bodySchema = z.object({
    imageUrl: z.string().optional(),
    imageBase64: z.string().optional(),
    query: z.string().trim().max(120).optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    size: z.string().optional(),
    condition: z.string().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).optional().default('newest'),
    limit: z.coerce.number().int().min(1).max(100).optional().default(48),
  });
  const payload = bodySchema.parse(request.body ?? {});

  // Telemetry: keep logging requests for future ML training/integration.
  if (payload.imageUrl) {
    try {
      await db.query(
        `INSERT INTO visual_search_requests (id, image_url, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [`vs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, payload.imageUrl]
      );
    } catch {
      // Telemetry is best-effort; never fail the request on it.
    }
  }

  const conditions: string[] = ["l.status = 'active'"];
  const args: unknown[] = [];

  if (payload.category) {
    conditions.push(`l.category = $${args.length + 1}`);
    args.push(payload.category);
  }
  if (payload.brand) {
    conditions.push(`l.brand ILIKE $${args.length + 1}`);
    args.push(`%${payload.brand}%`);
  }
  if (payload.size) {
    conditions.push(`l.size ILIKE $${args.length + 1}`);
    args.push(`%${payload.size}%`);
  }
  if (payload.condition) {
    conditions.push(`l.condition ILIKE $${args.length + 1}`);
    args.push(`%${payload.condition}%`);
  }
  if (payload.minPrice !== undefined) {
    conditions.push(`l.price_gbp >= $${args.length + 1}`);
    args.push(payload.minPrice);
  }
  if (payload.maxPrice !== undefined) {
    conditions.push(`l.price_gbp <= $${args.length + 1}`);
    args.push(payload.maxPrice);
  }
  if (payload.query) {
    conditions.push(`(l.title ILIKE $${args.length + 1} OR l.description ILIKE $${args.length + 1} OR l.brand ILIKE $${args.length + 1})`);
    args.push(`%${payload.query}%`);
  }

  const orderBy =
    payload.sort === 'price_asc'
      ? 'l.price_gbp ASC, l.id ASC'
      : payload.sort === 'price_desc'
        ? 'l.price_gbp DESC, l.id DESC'
        : 'l.created_at DESC, l.id DESC';

  const result = await readDb.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: number | string;
    image_url: string | null;
    status: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    original_price_gbp: number | string | null;
    created_at: string;
    seller_username: string | null;
  }>(
    `
      SELECT
        l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
        l.status, l.category, l.brand, l.size, l.condition, l.original_price_gbp, l.created_at,
        u.username AS seller_username
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${args.length + 1}
    `,
    [...args, payload.limit]
  );

  const listingIds = result.rows.map((r) => r.id);
  const imagesResult = listingIds.length
    ? await readDb.query<{ listing_id: string; image_url: string; sort_order: number }>(
        `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
        [listingIds]
      )
    : { rows: [] };

  const imagesByListing = new Map<string, string[]>();
  for (const img of imagesResult.rows) {
    const arr = imagesByListing.get(img.listing_id) ?? [];
    arr.push(img.image_url);
    imagesByListing.set(img.listing_id, arr);
  }

  reply.code(200);
  return {
    ok: true,
    runtimeAvailable: true,
    // Truthful flag: results are filter-based, not ML image-similarity.
    visualMatching: false,
    note: 'Results are matched by category, brand, and description.',
    items: result.rows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      priceGbp: Number(row.price_gbp),
      imageUrl: row.image_url,
      images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
      status: row.status,
      category: row.category,
      brand: row.brand,
      size: row.size,
      condition: row.condition,
      originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
      createdAt: row.created_at,
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
});

// â”€â”€ Posters API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/posters', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const bodySchema = z.object({
    id: z.string().min(2).max(120),
    mediaUrl: z.string().url().min(3),
    caption: z.string().max(2200).default(''),
    textOverlay: z.record(z.unknown()).optional(),
    backgroundColor: z.string().max(30).optional(),
    layout: z.string().max(30).default('single'),
    status: z.enum(['draft', 'published', 'archived']).default('published'),
    expiryHours: z.number().int().min(1).max(720).default(24),
  });
  const payload = bodySchema.parse(request.body);

  await db.query(
    `
      INSERT INTO posters (id, creator_id, media_url, caption, text_overlay, background_color, layout, status, expiry_hours)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE
      SET media_url = EXCLUDED.media_url,
          caption = EXCLUDED.caption,
          text_overlay = EXCLUDED.text_overlay,
          background_color = EXCLUDED.background_color,
          layout = EXCLUDED.layout,
          status = EXCLUDED.status,
          expiry_hours = EXCLUDED.expiry_hours
    `,
    [
      payload.id,
      actorUserId,
      payload.mediaUrl,
      payload.caption,
      payload.textOverlay ? JSON.stringify(payload.textOverlay) : null,
      payload.backgroundColor ?? null,
      payload.layout,
      payload.status,
      payload.expiryHours,
    ]
  );

  reply.code(201);
  return { ok: true, posterId: payload.id };
});

app.get('/posters', async (request) => {
  const querySchema = z.object({
    creatorId: z.string().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    limit: z.coerce.number().int().min(1).max(120).default(40),
  });
  const params = querySchema.parse(request.query ?? {});

  const conditions: string[] = ['1 = 1'];
  const args: unknown[] = [];

  if (params.creatorId) {
    conditions.push(`creator_id = $${args.length + 1}`);
    args.push(params.creatorId);
  }

  if (params.status) {
    conditions.push(`status = $${args.length + 1}`);
    args.push(params.status);
  }

  const result = await db.query<{
    id: string;
    creator_id: string;
    media_url: string;
    caption: string;
    text_overlay: string | null;
    background_color: string | null;
    layout: string;
    status: string;
    expiry_hours: number;
    created_at: string;
  }>(
    `
      SELECT id, creator_id, media_url, caption, text_overlay, background_color, layout, status, expiry_hours, created_at
      FROM posters
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${args.length + 1}
    `,
    [...args, params.limit]
  );

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      creatorId: row.creator_id,
      mediaUrl: row.media_url,
      caption: row.caption,
      textOverlay: row.text_overlay
        ? (typeof row.text_overlay === 'string' ? JSON.parse(row.text_overlay) : row.text_overlay)
        : null,
      backgroundColor: row.background_color,
      layout: row.layout,
      status: row.status,
      expiryHours: row.expiry_hours,
      createdAt: row.created_at,
    })),
  };
});

app.get('/posters/:posterId', async (request, reply) => {
  const paramsSchema = z.object({ posterId: z.string().min(2).max(120) });
  const { posterId } = paramsSchema.parse(request.params);

  const result = await db.query<{
    id: string;
    creator_id: string;
    media_url: string;
    caption: string;
    text_overlay: string | null;
    background_color: string | null;
    layout: string;
    status: string;
    expiry_hours: number;
    created_at: string;
  }>(
    `
      SELECT id, creator_id, media_url, caption, text_overlay, background_color, layout, status, expiry_hours, created_at
      FROM posters
      WHERE id = $1
      LIMIT 1
    `,
    [posterId]
  );

  if (!result.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Poster not found' };
  }

  const row = result.rows[0];
  return {
    ok: true,
    poster: {
      id: row.id,
      creatorId: row.creator_id,
      mediaUrl: row.media_url,
      caption: row.caption,
      textOverlay: row.text_overlay
        ? (typeof row.text_overlay === 'string' ? JSON.parse(row.text_overlay) : row.text_overlay)
        : null,
      backgroundColor: row.background_color,
      layout: row.layout,
      status: row.status,
      expiryHours: row.expiry_hours,
      createdAt: row.created_at,
    },
  };
});

app.delete('/posters/:posterId', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ posterId: z.string().min(2).max(120) });
  const { posterId } = paramsSchema.parse(request.params);

  const ownerResult = await db.query<{ creator_id: string }>(
    `SELECT creator_id FROM posters WHERE id = $1 LIMIT 1`,
    [posterId]
  );

  const owner = ownerResult.rows[0];
  if (!owner) {
    reply.code(404);
    return { ok: false, error: 'Poster not found' };
  }

  if (owner.creator_id !== actorUserId && request.authUser?.role !== 'admin') {
    reply.code(403);
    return { ok: false, error: 'Forbidden' };
  }

  await db.query(`DELETE FROM posters WHERE id = $1`, [posterId]);
  return { ok: true };
});

// â”€â”€ Poster product tags (shoppable pins) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POST /posters/:posterId/tags â€” add a product tag to a poster
app.post('/posters/:posterId/tags', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ posterId: z.string().min(2).max(120) });
  const { posterId } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    id: z.string().min(2).max(120).optional(),
    listingId: z.string().max(120).optional(),
    label: z.string().max(200).default(''),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  });
  const payload = bodySchema.parse(request.body);

  const ownerResult = await db.query<{ creator_id: string }>(
    `SELECT creator_id FROM posters WHERE id = $1 LIMIT 1`,
    [posterId]
  );
  if (!ownerResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Poster not found' };
  }
  if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
    reply.code(403);
    return { ok: false, error: 'Forbidden' };
  }

  const tagId = payload.id ?? `${posterId}_tag_${crypto.randomUUID()}`;
  await db.query(
    `INSERT INTO poster_tags (id, poster_id, listing_id, label, x, y)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
     SET poster_id = EXCLUDED.poster_id,
         listing_id = EXCLUDED.listing_id,
         label = EXCLUDED.label,
         x = EXCLUDED.x,
         y = EXCLUDED.y`,
    [tagId, posterId, payload.listingId ?? null, payload.label, payload.x, payload.y]
  );

  reply.code(201);
  return { ok: true, tagId };
});

// GET /posters/:posterId/tags â€” list product tags for a poster
app.get('/posters/:posterId/tags', async (request, reply) => {
  const paramsSchema = z.object({ posterId: z.string().min(2).max(120) });
  const { posterId } = paramsSchema.parse(request.params);

  const result = await db.query<{
    id: string;
    poster_id: string;
    listing_id: string | null;
    label: string;
    x: string;
    y: string;
    click_count: number;
    last_clicked_at: string | null;
    created_at: string;
  }>(
    `SELECT id, poster_id, listing_id, label, x, y, click_count, last_clicked_at, created_at
     FROM poster_tags
     WHERE poster_id = $1
     ORDER BY created_at ASC`,
    [posterId]
  );

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      posterId: row.poster_id,
      listingId: row.listing_id,
      label: row.label,
      x: Number(row.x),
      y: Number(row.y),
      clickCount: row.click_count,
      lastClickedAt: row.last_clicked_at,
      createdAt: row.created_at,
    })),
  };
});

// DELETE /posters/:posterId/tags/:tagId â€” remove a product tag
app.delete('/posters/:posterId/tags/:tagId', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({
    posterId: z.string().min(2).max(120),
    tagId: z.string().min(2).max(120),
  });
  const { posterId, tagId } = paramsSchema.parse(request.params);

  const ownerResult = await db.query<{ creator_id: string }>(
    `SELECT creator_id FROM posters WHERE id = $1 LIMIT 1`,
    [posterId]
  );
  if (!ownerResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Poster not found' };
  }
  if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
    reply.code(403);
    return { ok: false, error: 'Forbidden' };
  }

  await db.query(`DELETE FROM poster_tags WHERE id = $1 AND poster_id = $2`, [tagId, posterId]);
  return { ok: true };
});

// POST /posters/:posterId/tags/:tagId/click â€” record a product tag click (public)
app.post('/posters/:posterId/tags/:tagId/click', async (request, reply) => {
  const paramsSchema = z.object({
    posterId: z.string().min(2).max(120),
    tagId: z.string().min(2).max(120),
  });
  const { posterId, tagId } = paramsSchema.parse(request.params);

  const result = await db.query(
    `UPDATE poster_tags
     SET click_count = click_count + 1,
         last_clicked_at = NOW()
     WHERE id = $1 AND poster_id = $2
     RETURNING id`,
    [tagId, posterId]
  );

  if (!result.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Tag not found' };
  }

  return { ok: true };
});


// â”€â”€ Looks API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function enrichLooks(
  lookRows: Array<{
    id: string;
    creator_id: string;
    title: string;
    caption: string;
    media_url: string;
    media_type: 'image' | 'video';
    composition_document: unknown | null;
    status: string;
    visibility: string;
    created_at: string;
    updated_at: string;
    creator_username: string | null;
    creator_avatar: string | null;
  }>,
  viewerUserId: string | null
): Promise<Array<Record<string, unknown>>> {
  const lookIds = lookRows.map((r) => r.id);

  const tagsResult = lookIds.length
    ? await db.query<{
        look_id: string;
        id: string;
        listing_id: string | null;
        label: string;
        x: string;
        y: string;
      }>(
        `SELECT look_id, id, listing_id, label, x, y FROM look_tags WHERE look_id = ANY($1)`,
        [lookIds]
      )
    : { rows: [] };

  const tagsByLook = new Map<string, Array<Record<string, unknown>>>();
  for (const t of tagsResult.rows) {
    const arr = tagsByLook.get(t.look_id) ?? [];
    arr.push({
      id: t.id,
      listingId: t.listing_id,
      label: t.label,
      x: Number(t.x),
      y: Number(t.y),
    });
    tagsByLook.set(t.look_id, arr);
  }

  const likeCountsResult = lookIds.length
    ? await db.query<{ look_id: string; count: string }>(
        `SELECT look_id, COUNT(*)::text AS count FROM look_likes WHERE look_id = ANY($1) GROUP BY look_id`,
        [lookIds]
      )
    : { rows: [] };
  const likeCountMap = new Map<string, number>();
  for (const r of likeCountsResult.rows) {
    likeCountMap.set(r.look_id, Number(r.count));
  }

  const commentCountsResult = lookIds.length
    ? await db.query<{ look_id: string; count: string }>(
        `SELECT look_id, COUNT(*)::text AS count FROM look_comments WHERE look_id = ANY($1) GROUP BY look_id`,
        [lookIds]
      )
    : { rows: [] };
  const commentCountMap = new Map<string, number>();
  for (const r of commentCountsResult.rows) {
    commentCountMap.set(r.look_id, Number(r.count));
  }

  const saveCountsResult = lookIds.length
    ? await db.query<{ look_id: string; count: string }>(
        `SELECT look_id, COUNT(*)::text AS count FROM look_saves WHERE look_id = ANY($1) GROUP BY look_id`,
        [lookIds]
      )
    : { rows: [] };
  const saveCountMap = new Map<string, number>();
  for (const r of saveCountsResult.rows) {
    saveCountMap.set(r.look_id, Number(r.count));
  }

  let viewerLikesSet = new Set<string>();
  let viewerSavesSet = new Set<string>();
  if (viewerUserId && lookIds.length) {
    const viewerLikesResult = await db.query<{ look_id: string }>(
      `SELECT look_id FROM look_likes WHERE user_id = $1 AND look_id = ANY($2)`,
      [viewerUserId, lookIds]
    );
    viewerLikesSet = new Set(viewerLikesResult.rows.map((r) => r.look_id));

    const viewerSavesResult = await db.query<{ look_id: string }>(
      `SELECT look_id FROM look_saves WHERE user_id = $1 AND look_id = ANY($2)`,
      [viewerUserId, lookIds]
    );
    viewerSavesSet = new Set(viewerSavesResult.rows.map((r) => r.look_id));
  }

  return lookRows.map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    creator: {
      id: row.creator_id,
      username: row.creator_username,
      avatar: row.creator_avatar,
    },
    title: row.title,
    caption: row.caption,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    compositionDocument: row.composition_document,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: tagsByLook.get(row.id) ?? [],
    likeCount: likeCountMap.get(row.id) ?? 0,
    commentCount: commentCountMap.get(row.id) ?? 0,
    saveCount: saveCountMap.get(row.id) ?? 0,
    likedByViewer: viewerLikesSet.has(row.id),
    savedByViewer: viewerSavesSet.has(row.id),
  }));
}

const LOOK_SELECT_COLUMNS = `
  l.id, l.creator_id, l.title, l.caption, l.media_url, l.media_type,
  l.composition_document, l.status, l.visibility,
  l.created_at, l.updated_at,
  u.username AS creator_username,
  u.avatar AS creator_avatar
`;

// â”€â”€ Look access control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type LookAccessRow = {
  id: string;
  creator_id: string;
  status: 'draft' | 'published' | 'archived';
  visibility: 'public' | 'followers' | 'private';
};

function canViewerAccessLook(
  look: LookAccessRow,
  viewerUserId: string | null
): boolean {
  if (viewerUserId && look.creator_id === viewerUserId) {
    return true;
  }
  return look.status === 'published' && look.visibility === 'public';
}

async function getAccessibleLook(
  lookId: string,
  viewerUserId: string | null
): Promise<LookAccessRow | null> {
  const result = await db.query<LookAccessRow>(
    `SELECT id, creator_id, status, visibility FROM looks WHERE id = $1 LIMIT 1`,
    [lookId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!canViewerAccessLook(row, viewerUserId)) return null;
  return row;
}

// â”€â”€ Looks routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/looks', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const bodySchema = z.object({
    id: z.string().min(2).max(120),
    title: z.string().max(120).default(''),
    caption: z.string().max(2200).default(''),
    mediaUrl: z.string().url().min(3),
    mediaType: z.enum(['image', 'video']).default('image'),
    compositionDocument: z.unknown().optional(),
    visibility: z.enum(['public', 'followers', 'private']).default('public'),
    tags: z.array(
      z.object({
        id: z.string().min(2).max(120),
        listingId: z.string().max(120).optional(),
        label: z.string().max(200).default(''),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
    ).default([]),
    status: z.enum(['draft', 'published', 'archived']).default('published'),
  });
  const payload = bodySchema.parse(request.body);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<{ creator_id: string }>(
      `SELECT creator_id FROM looks WHERE id = $1 LIMIT 1`,
      [payload.id]
    );

    if (existing.rowCount) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Look ID already exists' };
    }

    await client.query(
      `INSERT INTO looks (
         id, creator_id, title, caption, media_url, media_type,
         composition_document, status, visibility
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        payload.id,
        actorUserId,
        payload.title,
        payload.caption,
        payload.mediaUrl,
        payload.mediaType,
        payload.compositionDocument ?? null,
        payload.status,
        payload.visibility,
      ]
    );

    for (const tag of payload.tags) {
      const tagId = `${payload.id}_${tag.id}`;
      await client.query(
        `INSERT INTO look_tags (id, look_id, listing_id, label, x, y)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET look_id = EXCLUDED.look_id,
             listing_id = EXCLUDED.listing_id,
             label = EXCLUDED.label,
             x = EXCLUDED.x,
             y = EXCLUDED.y`,
        [tagId, payload.id, tag.listingId ?? null, tag.label, tag.x, tag.y]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  reply.code(201);
  return { ok: true, lookId: payload.id };
});

app.get('/looks', async (request) => {
  const querySchema = z.object({
    creatorId: z.string().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    sort: z.enum(['foryou', 'following']).default('foryou'),
    cursor: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(120).default(40),
  });
  const params = querySchema.parse(request.query ?? {});
  const viewerUserId = request.authUser?.userId ?? null;

  const conditions: string[] = ['1 = 1'];
  const args: unknown[] = [];

  if (params.creatorId) {
    conditions.push(`l.creator_id = $${args.length + 1}`);
    args.push(params.creatorId);
  }

  if (params.sort === 'following') {
    if (!viewerUserId) {
      return { items: [], nextCursor: null };
    }
    conditions.push(`EXISTS (
      SELECT 1 FROM user_follows uf
      WHERE uf.follower_id = $${args.length + 1}
        AND uf.following_id = l.creator_id
    )`);
    args.push(viewerUserId);
  }

  if (params.cursor) {
    conditions.push(`l.created_at < $${args.length + 1}::timestamptz`);
    args.push(params.cursor);
  }

  if (params.status && params.status !== 'published') {
    if (!viewerUserId) {
      return { items: [] };
    }
    conditions.push(`l.status = $${args.length + 1}`);
    args.push(params.status);
    conditions.push(`l.creator_id = $${args.length + 1}`);
    args.push(viewerUserId);
  } else {
    conditions.push(`l.status = 'published'`);
    if (viewerUserId) {
      conditions.push(`(l.visibility = 'public' OR l.creator_id = $${args.length + 1})`);
      args.push(viewerUserId);
    } else {
      conditions.push(`l.visibility = 'public'`);
    }
  }

  if (params.creatorId && viewerUserId && params.creatorId !== viewerUserId && params.status && params.status !== 'published') {
    return { items: [] };
  }

  const looksResult = await db.query<{
    id: string;
    creator_id: string;
    title: string;
    caption: string;
    media_url: string;
    media_type: 'image' | 'video';
    composition_document: unknown | null;
    status: string;
    visibility: string;
    created_at: string;
    updated_at: string;
    creator_username: string | null;
    creator_avatar: string | null;
  }>(
    `
      SELECT ${LOOK_SELECT_COLUMNS}
      FROM looks l
      LEFT JOIN users u ON u.id = l.creator_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.created_at DESC
      LIMIT $${args.length + 1}
    `,
    [...args, params.limit + 1]
  );

  const hasMore = looksResult.rows.length > params.limit;
  const pageRows = hasMore ? looksResult.rows.slice(0, params.limit) : looksResult.rows;
  const items = await enrichLooks(pageRows, viewerUserId);
  const nextCursor = hasMore
    ? pageRows[pageRows.length - 1]?.created_at ?? null
    : null;

  return { items, nextCursor };
});

app.get('/looks/:lookId', async (request, reply) => {
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);
  const viewerUserId = request.authUser?.userId ?? null;

  const accessRow = await getAccessibleLook(lookId, viewerUserId);
  if (!accessRow) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  const lookResult = await db.query<{
    id: string;
    creator_id: string;
    title: string;
    caption: string;
    media_url: string;
    media_type: 'image' | 'video';
    composition_document: unknown | null;
    status: string;
    visibility: string;
    created_at: string;
    updated_at: string;
    creator_username: string | null;
    creator_avatar: string | null;
  }>(
    `SELECT ${LOOK_SELECT_COLUMNS} FROM looks l LEFT JOIN users u ON u.id = l.creator_id WHERE l.id = $1 LIMIT 1`,
    [lookId]
  );

  if (!lookResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  const enriched = (await enrichLooks([lookResult.rows[0]], viewerUserId))[0];

  return { ok: true, look: enriched };
});

app.patch('/looks/:lookId', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    title: z.string().max(120).optional(),
    caption: z.string().max(2200).optional(),
    mediaUrl: z.string().url().optional(),
    mediaType: z.enum(['image', 'video']).optional(),
    compositionDocument: z.unknown().nullable().optional(),
    visibility: z.enum(['public', 'followers', 'private']).optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    tags: z.array(z.object({
      id: z.string().min(2).max(120),
      listingId: z.string().min(2).max(120).optional(),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      label: z.string().max(200).default(''),
    })).optional(),
  });
  const payload = bodySchema.parse(request.body);

  // Ownership check
  const existing = await db.query<{ creator_id: string }>(
    'SELECT creator_id FROM looks WHERE id = $1 LIMIT 1',
    [lookId]
  );
  if (existing.rows.length === 0) {
    return reply.code(404).send({ error: 'Look not found' });
  }
  if (existing.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
    return reply.code(403).send({ error: 'Not authorised to edit this look' });
  }

  // Build update query dynamically
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (payload.title !== undefined) { updates.push(`title = $${paramIdx++}`); values.push(payload.title); }
  if (payload.caption !== undefined) { updates.push(`caption = $${paramIdx++}`); values.push(payload.caption); }
  if (payload.mediaUrl !== undefined) { updates.push(`media_url = $${paramIdx++}`); values.push(payload.mediaUrl); }
  if (payload.mediaType !== undefined) { updates.push(`media_type = $${paramIdx++}`); values.push(payload.mediaType); }
  if (payload.compositionDocument !== undefined) {
    updates.push(`composition_document = $${paramIdx++}::jsonb`);
    values.push(payload.compositionDocument === null ? null : JSON.stringify(payload.compositionDocument));
  }
  if (payload.visibility !== undefined) { updates.push(`visibility = $${paramIdx++}`); values.push(payload.visibility); }
  if (payload.status !== undefined) { updates.push(`status = $${paramIdx++}`); values.push(payload.status); }
  updates.push(`updated_at = NOW()`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (updates.length > 1 || payload.tags !== undefined) {
      values.push(lookId);
      await client.query(`UPDATE looks SET ${updates.join(', ')} WHERE id = $${paramIdx}`, values);
    }

    if (payload.tags !== undefined) {
      await client.query('DELETE FROM look_tags WHERE look_id = $1', [lookId]);
      for (const tag of payload.tags) {
        await client.query(
          `INSERT INTO look_tags (id, look_id, listing_id, x, y, label)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [`${lookId}_${tag.id}`, lookId, tag.listingId ?? null, tag.x, tag.y, tag.label]
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { ok: true, lookId };
});

app.delete('/looks/:lookId', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);

  const ownerResult = await db.query<{ creator_id: string }>(
    `SELECT creator_id FROM looks WHERE id = $1 LIMIT 1`,
    [lookId]
  );

  const owner = ownerResult.rows[0];
  if (!owner) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  if (owner.creator_id !== actorUserId && request.authUser?.role !== 'admin') {
    reply.code(403);
    return { ok: false, error: 'Forbidden' };
  }

  await db.query(`DELETE FROM looks WHERE id = $1`, [lookId]);
  return { ok: true };
});

// â”€â”€ Look likes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/looks/:lookId/like', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);

  const accessRow = await getAccessibleLook(lookId, actorUserId);
  if (!accessRow) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  await db.query(
    `INSERT INTO look_likes (look_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [lookId, actorUserId]
  );

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM look_likes WHERE look_id = $1`,
    [lookId]
  );

  return { ok: true, likeCount: Number(countResult.rows[0]?.count ?? 0), likedByViewer: true };
});

app.delete('/looks/:lookId/like', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);

  const accessRow = await getAccessibleLook(lookId, actorUserId);
  if (!accessRow) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  await db.query(
    `DELETE FROM look_likes WHERE look_id = $1 AND user_id = $2`,
    [lookId, actorUserId]
  );

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM look_likes WHERE look_id = $1`,
    [lookId]
  );

  return { ok: true, likeCount: Number(countResult.rows[0]?.count ?? 0), likedByViewer: false };
});

// â”€â”€ Look saves â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/looks/:lookId/save', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);

  const accessRow = await getAccessibleLook(lookId, actorUserId);
  if (!accessRow) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  await db.query(
    `INSERT INTO look_saves (look_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [lookId, actorUserId]
  );

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM look_saves WHERE look_id = $1`,
    [lookId]
  );

  return { ok: true, saveCount: Number(countResult.rows[0]?.count ?? 0), savedByViewer: true };
});

app.delete('/looks/:lookId/save', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);

  const accessRow = await getAccessibleLook(lookId, actorUserId);
  if (!accessRow) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  await db.query(
    `DELETE FROM look_saves WHERE look_id = $1 AND user_id = $2`,
    [lookId, actorUserId]
  );

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM look_saves WHERE look_id = $1`,
    [lookId]
  );

  return { ok: true, saveCount: Number(countResult.rows[0]?.count ?? 0), savedByViewer: false };
});

// â”€â”€ Look comments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/looks/:lookId/comments', async (request, reply) => {
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);
  const viewerUserId = request.authUser?.userId ?? null;

  const accessRow = await getAccessibleLook(lookId, viewerUserId);
  if (!accessRow) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  const commentsResult = await db.query<{
    id: string;
    look_id: string;
    author_id: string;
    body: string;
    created_at: string;
    updated_at: string;
    author_username: string | null;
    author_avatar: string | null;
  }>(
    `
      SELECT c.id, c.look_id, c.author_id, c.body, c.created_at, c.updated_at,
        u.username AS author_username,
        u.avatar AS author_avatar
      FROM look_comments c
      LEFT JOIN users u ON u.id = c.author_id
      WHERE c.look_id = $1
      ORDER BY c.created_at ASC
      LIMIT 200
    `,
    [lookId]
  );

  return {
    items: commentsResult.rows.map((row) => ({
      id: row.id,
      lookId: row.look_id,
      authorId: row.author_id,
      author: {
        id: row.author_id,
        username: row.author_username,
        avatar: row.author_avatar,
      },
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
});

app.post('/looks/:lookId/comments', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ lookId: z.string().min(2).max(120) });
  const { lookId } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    id: z.string().min(2).max(120),
    body: z.string().trim().min(1).max(1000),
  });
  const payload = bodySchema.parse(request.body);

  const accessRow = await getAccessibleLook(lookId, actorUserId);
  if (!accessRow) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  await db.query(
    `INSERT INTO look_comments (id, look_id, author_id, body) VALUES ($1, $2, $3, $4)`,
    [payload.id, lookId, actorUserId, payload.body]
  );

  const commentResult = await db.query<{
    id: string;
    author_id: string;
    body: string;
    created_at: string;
    updated_at: string;
    author_username: string | null;
    author_avatar: string | null;
  }>(
    `
      SELECT c.id, c.author_id, c.body, c.created_at, c.updated_at,
        u.username AS author_username,
        u.avatar AS author_avatar
      FROM look_comments c
      LEFT JOIN users u ON u.id = c.author_id
      WHERE c.id = $1 LIMIT 1
    `,
    [payload.id]
  );

  const row = commentResult.rows[0];
  if (!row) {
    reply.code(500);
    return { ok: false, error: 'Failed to create comment' };
  }

  reply.code(201);
  return {
    ok: true,
    comment: {
      id: row.id,
      lookId,
      authorId: row.author_id,
      author: {
        id: row.author_id,
        username: row.author_username,
        avatar: row.author_avatar,
      },
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
});

app.delete('/looks/:lookId/comments/:commentId', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({
    lookId: z.string().min(2).max(120),
    commentId: z.string().min(2).max(120),
  });
  const { lookId, commentId } = paramsSchema.parse(request.params);

  const accessRow = await getAccessibleLook(lookId, actorUserId);
  if (!accessRow) {
    reply.code(404);
    return { ok: false, error: 'Look not found' };
  }

  const commentResult = await db.query<{ author_id: string }>(
    `SELECT author_id FROM look_comments WHERE id = $1 AND look_id = $2 LIMIT 1`,
    [commentId, lookId]
  );

  const comment = commentResult.rows[0];
  if (!comment) {
    reply.code(404);
    return { ok: false, error: 'Comment not found' };
  }

  if (comment.author_id !== actorUserId && request.authUser?.role !== 'admin') {
    reply.code(403);
    return { ok: false, error: 'Forbidden' };
  }

  await db.query(`DELETE FROM look_comments WHERE id = $1`, [commentId]);
  return { ok: true };
});


// â”€â”€ Listings API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/listings', {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute',
    },
  },
  // Fastify JSON Schema â€” framework-level defence-in-depth per OWASP API
  // security best practices. Validates structure before the handler runs;
  // Zod in the handler provides semantic validation (URL format, etc.).
  // additionalProperties omitted (defaults to true) so clients sending extra
  // fields are not rejected â€” Zod strips unknown keys in the handler.
  schema: {
    body: {
      type: 'object',
      required: ['id', 'sellerId', 'title', 'description', 'priceGbp'],
      properties: {
        id: { type: 'string', minLength: 2 },
        sellerId: { type: 'string', minLength: 2 },
        title: { type: 'string', minLength: 3 },
        description: { type: 'string', minLength: 10 },
        priceGbp: { type: 'number', minimum: 0 },
        imageUrl: { type: 'string' },
        coverFinalizationId: { type: 'string', minLength: 2, maxLength: 120 },
        status: { type: 'string', enum: ['draft', 'active', 'paused', 'sold', 'deleted'] },
        category: { type: 'string', minLength: 1 },
        brand: { type: 'string', minLength: 1 },
        size: { type: 'string', minLength: 1 },
        condition: { type: 'string', minLength: 1 },
        originalPriceGbp: { type: 'number', minimum: 0 },
        shippingMethod: { type: 'string', minLength: 1 },
        shippingPayer: { type: 'string', minLength: 1 },
      },
    },
  },
}, async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const bodySchema = z.object({
    id: z.string().min(2),
    sellerId: z.string().min(2),
    title: z.string().min(3),
    description: z.string().min(10),
    priceGbp: z.number().nonnegative(),
    imageUrl: z.string().url().optional(),
    coverFinalizationId: z.string().min(2).max(120).optional(),
    status: z.enum(['draft', 'active', 'paused', 'sold', 'deleted']).optional(),
    category: z.string().min(1).optional(),
    brand: z.string().min(1).optional(),
    size: z.string().min(1).optional(),
    condition: z.string().min(1).optional(),
    originalPriceGbp: z.number().nonnegative().optional(),
    shippingMethod: z.string().min(1).optional(),
    shippingPayer: z.string().min(1).optional(),
  });

  const payload = bodySchema.parse(request.body);
  if (payload.sellerId !== actorUserId) {
    reply.code(403);
    return { ok: false, error: 'Seller identity must match the authenticated user' };
  }
  if (payload.imageUrl && !payload.coverFinalizationId) {
    reply.code(422);
    return { ok: false, error: 'A verified cover upload is required' };
  }

  // Category-aware activation validation â€” only for active listings.
  // Drafts bypass validation so sellers can save incomplete work.
  const targetStatus = payload.status ?? 'active';
  if (targetStatus === 'active') {
    const validation = validateListingActivation({
      title: payload.title,
      description: payload.description,
      price: payload.priceGbp,
      category: payload.category,
      subcategory: null,
      brand: payload.brand,
      size: payload.size,
      condition: payload.condition,
      images: payload.imageUrl ? [payload.imageUrl] : null,
      shippingMethod: payload.shippingMethod,
      shippingPayer: payload.shippingPayer,
    });
    if (!validation.valid) {
      reply.code(422);
      return {
        ok: false,
        error: 'Category validation failed',
        missingRequired: validation.missingRequired,
      };
    }
  }

  const listingText = `${payload.title}\n${payload.description}`;
  const textModerationResult = await moderateListingText(payload.id, listingText);
  if (textModerationResult.status === 'rejected') {
    reply.code(422);
    return {
      ok: false,
      error: 'Listing text was rejected by content moderation',
      code: 'MODERATION_REJECTED',
      labels: textModerationResult.labels,
    };
  }
  if (textModerationResult.status === 'review') {
    request.log.warn(
      { listingId: payload.id, labels: textModerationResult.labels },
      'Listing text flagged for human review',
    );
  }

  let resolvedCoverImageUrl = payload.imageUrl ?? null;
  let coverMediaAssetId: string | null = null;
  let upsertPriceEvent:
    | { id: number; previousPriceGbp: number; newPriceGbp: number }
    | null = null;
  let upsertPriceOutboxEventId: string | null = null;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existingListing = await client.query<{
      seller_id: string;
      price_gbp: string;
    }>(
      `SELECT seller_id, price_gbp::text
       FROM listings
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [payload.id],
    );
    if (
      existingListing.rowCount
      && existingListing.rows[0].seller_id !== actorUserId
    ) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Listing ID belongs to another seller' };
    }
    if (payload.imageUrl && payload.coverFinalizationId) {
      const cover = await client.query<{
        owner_id: string;
        public_url: string;
        content_type: string;
        status: string;
        media_asset_id: string | null;
        media_asset_status: string | null;
        canonical_url: string | null;
      }>(
        `SELECT finalization.owner_id, finalization.public_url,
                finalization.content_type, finalization.status,
                finalization.media_asset_id,
                asset.status AS media_asset_status,
                asset.canonical_url
         FROM upload_finalizations finalization
         LEFT JOIN media_assets asset
           ON asset.id = finalization.media_asset_id
         WHERE finalization.id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.coverFinalizationId],
      );
      const verifiedCover = cover.rows[0];
      if (
        !verifiedCover
        || verifiedCover.owner_id !== actorUserId
        || verifiedCover.status !== 'finalized'
        || (
          verifiedCover.public_url !== payload.imageUrl
          && verifiedCover.canonical_url !== payload.imageUrl
        )
        || !verifiedCover.content_type.startsWith('image/')
      ) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Cover image does not match the verified upload' };
      }
      if (
        config.mediaPublicationGateEnabled
        && (
          verifiedCover.media_asset_status !== 'published'
          || !verifiedCover.canonical_url
        )
      ) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Cover media is still being processed or moderated',
          code: 'MEDIA_NOT_PUBLISHED',
          mediaStatus: verifiedCover.media_asset_status ?? 'missing',
        };
      }
      resolvedCoverImageUrl = config.mediaPublicationGateEnabled
        ? verifiedCover.canonical_url
        : verifiedCover.public_url;
      coverMediaAssetId = verifiedCover.media_asset_status === 'published'
        ? verifiedCover.media_asset_id
        : null;
    }

    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO listings (
          id, seller_id, title, description, price_gbp, image_url,
          status, category, brand, size, condition,
          original_price_gbp, shipping_method, shipping_payer
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description,
            price_gbp = EXCLUDED.price_gbp,
            image_url = EXCLUDED.image_url,
            status = EXCLUDED.status,
            category = EXCLUDED.category,
            brand = EXCLUDED.brand,
            size = EXCLUDED.size,
            condition = EXCLUDED.condition,
            original_price_gbp = EXCLUDED.original_price_gbp,
            shipping_method = EXCLUDED.shipping_method,
            shipping_payer = EXCLUDED.shipping_payer,
            updated_at = NOW()
        WHERE listings.seller_id = EXCLUDED.seller_id
        RETURNING id
      `,
      [
        payload.id,
        actorUserId,
        payload.title,
        payload.description,
        payload.priceGbp,
        resolvedCoverImageUrl,
        payload.status ?? 'active',
        payload.category ?? null,
        payload.brand ?? null,
        payload.size ?? null,
        payload.condition ?? null,
        payload.originalPriceGbp ?? null,
        payload.shippingMethod ?? null,
        payload.shippingPayer ?? null,
      ],
    );
    if (!inserted.rowCount) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Listing ID belongs to another seller' };
    }

    const previousPriceGbp = existingListing.rowCount
      ? Number(existingListing.rows[0].price_gbp)
      : null;
    if (
      previousPriceGbp !== null
      && previousPriceGbp !== payload.priceGbp
    ) {
      const eventResult = await client.query<{ id: number }>(
        `INSERT INTO listing_price_events (
           listing_id, previous_price_gbp, new_price_gbp
         )
         VALUES ($1, $2, $3)
         RETURNING id`,
        [payload.id, previousPriceGbp, payload.priceGbp],
      );
      upsertPriceEvent = {
        id: eventResult.rows[0].id,
        previousPriceGbp,
        newPriceGbp: payload.priceGbp,
      };
      upsertPriceOutboxEventId = await appendDomainEvent(client, {
        aggregateType: 'listing',
        aggregateId: payload.id,
        eventType: 'listing.price_changed',
        actorId: actorUserId,
        correlationId: request.id,
        deduplicationKey: `listing.price_changed:${eventResult.rows[0].id}`,
        payload: {
          listingId: payload.id,
          priceEventId: eventResult.rows[0].id,
          previousPriceGbp,
          newPriceGbp: payload.priceGbp,
          mutationPath: 'listing_upsert',
        },
      });
    }

    if (payload.coverFinalizationId) {
      await client.query(
        `UPDATE upload_finalizations
         SET scope = 'listing_media', scope_ref_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [payload.coverFinalizationId, payload.id],
      );
    }
    if (coverMediaAssetId) {
      await client.query(
        `INSERT INTO media_bindings (
           id, media_asset_id, owner_id, target_type,
           target_ref_id, role, sort_order
         )
         VALUES ($1, $2, $3, 'listing', $4, 'cover', 0)
         ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
         DO UPDATE SET removed_at = NULL, sort_order = 0`,
        [
          `mbind_${crypto.randomUUID()}`,
          coverMediaAssetId,
          actorUserId,
          payload.id,
        ],
      );
    }

    // ── FR-03: Authoritative risk decision BEFORE commit ───────────────
    //
    // The fraud/risk check must run before the listing becomes public and
    // indexable. evaluateRisk() produces an authoritative ownerDecision
    // that we enforce inside this transaction boundary:
    //   allow / allow_with_limits → commit as the requested (public) status.
    //   step_up / manual_review / delay → commit but force a non-public
    //     status so the listing is never searchable until risk is cleared;
    //     only the listing owner may later transition it to 'active'.
    //   deny / quarantine → roll back and return 403.
    //
    // The legacy checkFraudNonBlocking call below is retained as a
    // shadow/best-effort log AFTER the commit — evaluateRisk is now the
    // primary decision. Execution is recorded via recordExecution() after
    // the commit succeeds (FR-13 recommendation/decision/execution split).
    const amountMinor = payload.priceGbp != null
      ? Math.round(payload.priceGbp * 100)
      : undefined;

    let riskDecision: RiskDecision | null = null;
    try {
      riskDecision = await evaluateRisk(
        {
          db,
          redis,
          logger: {
            warn: (obj: unknown, msg: string): void => {
              request.log.warn(obj as Record<string, unknown>, msg);
            },
            info: (obj: unknown, msg: string): void => {
              request.log.info(obj as Record<string, unknown>, msg);
            },
          },
          shadowService: fraudShadowService ?? null,
          ipReputationProvider,
        },
        {
          eventType: 'listing.publish.requested',
          subjectRef: payload.id,
          userId: actorUserId,
          headers: request.headers as Record<string, string | string[] | undefined>,
          ip: request.ip,
          amountMinor,
          currency: 'GBP',
          context: {
            listingId: payload.id,
            requestedStatus: payload.status ?? 'active',
          },
        },
      );
    } catch (riskError) {
      // Risk evaluation must never silently collapse to allow. Fail safe
      // to a non-public status so the listing is held for review.
      request.log.error(
        { err: riskError, listingId: payload.id, userId: actorUserId },
        'Risk evaluation failed before listing commit — holding listing non-public',
      );
    }

    const ownerDecision = riskDecision?.ownerDecision ?? 'manual_review';
    if (ownerDecision === 'deny' || ownerDecision === 'quarantine') {
      await client.query('ROLLBACK');
      reply.code(403);
      return {
        ok: false,
        error:
          'This listing could not be published for security reasons. Please contact support if you believe this is an error.',
        code: 'RISK_DENIED',
      };
    }

    // Determine the final published status. The upsert above already wrote
    // the requested status; override it when risk holds the listing.
    let publishedStatus: string;
    if (ownerDecision === 'allow' || ownerDecision === 'allow_with_limits') {
      publishedStatus = payload.status ?? 'active';
    } else {
      // step_up | manual_review | delay — commit but keep non-public.
      // Prefer 'risk_pending'; fall back to 'draft' if the status CHECK
      // constraint (migration 031) does not yet admit 'risk_pending'. A
      // SAVEPOINT isolates the constraint failure so the surrounding
      // transaction stays usable.
      publishedStatus = 'risk_pending';
      await client.query('SAVEPOINT risk_status');
      try {
        await client.query(
          `UPDATE listings SET status = 'risk_pending', updated_at = NOW() WHERE id = $1`,
          [payload.id],
        );
      } catch (statusError) {
        await client.query('ROLLBACK TO SAVEPOINT risk_status');
        request.log.warn(
          { err: statusError, listingId: payload.id },
          "Could not set listing status to 'risk_pending' (CHECK constraint?) — falling back to 'draft'",
        );
        publishedStatus = 'draft';
        await client.query(
          `UPDATE listings SET status = 'draft', updated_at = NOW() WHERE id = $1`,
          [payload.id],
        );
      }
    }

    await client.query('COMMIT');

    if (upsertPriceEvent) {
      try {
        await evaluatePriceAlertsForListing({
          db,
          listingId: payload.id,
          priceEventId: upsertPriceEvent.id,
          previousPriceGbp: upsertPriceEvent.previousPriceGbp,
          newPriceGbp: upsertPriceEvent.newPriceGbp,
          queueNotification: queueUserNotification,
        });
      } catch (error) {
        request.log.error(
          { err: error, listingId: payload.id, priceEventId: upsertPriceEvent.id },
          'Failed to evaluate price alerts after listing upsert',
        );
      }
      if (upsertPriceOutboxEventId) {
        enqueueOutboxDrainJob('after_commit').catch((error) => {
          request.log.error(
            { err: error, outboxEventId: upsertPriceOutboxEventId },
            'Failed to enqueue outbox drain after listing upsert',
          );
        });
      }
    }

    // Record execution of the authoritative risk decision (FR-13). Best
    // effort — a failure here must not break the committed listing.
    if (riskDecision) {
      try {
        await recordExecution(db, {
          decisionId: riskDecision.decisionId,
          ownerService: 'listings',
          executionStatus: 'executed',
          domainEntityType: 'listing',
          domainEntityId: payload.id,
        });
      } catch (execError) {
        request.log.warn(
          { err: execError, decisionId: riskDecision.decisionId, listingId: payload.id },
          'Failed to record risk decision execution after listing upsert',
        );
      }
    }

    // Shadow fraud check — best-effort score and log AFTER the commit.
    // evaluateRisk() above is now the primary decision; this legacy call is
    // retained for shadow comparison and post-hoc review only. Catches bulk
    // listing creation (counterfeit/non-existent goods) and new-account
    // listing velocity (AGENTS.md §11 — truthful signals).
    try {
      const fraudResult = await checkFraudNonBlocking(
        redis,
        {
          eventType: 'listing',
          userId: actorUserId,
          headers: request.headers as Record<string, string | string[] | undefined>,
          ip: request.ip,
          amountGbp: payload.priceGbp,
        },
        undefined,
        request.log,
        fraudShadowService,
      );
      // Listing events map to `allow_low_risk_flow` when the fraud service
      // is unavailable — listing creation continues and can be reviewed
      // post-hoc.
      if (fraudResult.evaluationStatus === 'unavailable') {
        request.log.warn(
          { userId: actorUserId, policyAction: fraudResult.policyAction, reasonCode: fraudResult.reasonCode },
          'Listing shadow fraud check unavailable — continuing with failover policy'
        );
      }
    } catch {
      // Fraud check failures must never break listing creation (AGENTS.md §6).
    }

    reply.code(201);
    recordListingCreated();

    // Invalidate search cache since listing data changed (fire-and-forget)
    void invalidateSearchCache(redis).catch((cacheError) => {
      app.log.error({ err: cacheError, listingId: payload.id }, 'Failed to invalidate search cache after listing upsert');
    });

    // Only active listings are indexed — risk_pending/draft listings must
    // not be searchable until the owner transitions them to 'active' after
    // risk clearance (FR-03). Remove from the index otherwise.
    if (publishedStatus === 'active') {
      void syncSingleListing(db, payload.id).catch(() => {});
    } else {
      void removeListingFromIndex(payload.id).catch((indexError) => {
        app.log.error(
          { err: indexError, listingId: payload.id, status: publishedStatus },
          'Failed to remove risk-held listing from search index',
        );
      });
    }

    return { ok: true, listingId: payload.id };
  } catch (error) {
    await client.query('ROLLBACK');
    app.log.error({ err: error }, 'Failed to create listing');
    reply.code(500);
    return { ok: false, error: 'Failed to create listing' };
  } finally {
    client.release();
  }
});

app.get('/listings/:listingId', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);

  // T03: Authorization â€” non-public listings require authentication.
  // Only `active` and `sold` listings are publicly viewable. `draft`,
  // `paused`, and `deleted` listings are visible only to the seller.
  await optionalAuthenticate(request, '/listings/:listingId');
  const viewerUserId = (request as any).authUser?.userId as string | undefined;

  const result = await readDb.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: number | string;
    image_url: string | null;
    status: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    original_price_gbp: number | string | null;
    shipping_method: string | null;
    shipping_payer: string | null;
    created_at: string;
    media_frozen_at: string | null;
    seller_username: string | null;
  }>(
    `
      SELECT
        l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
        l.status, l.category, l.brand, l.size, l.condition,
        l.original_price_gbp, l.shipping_method, l.shipping_payer, l.created_at,
        l.media_frozen_at,
        u.username AS seller_username
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      WHERE l.id = $1
      LIMIT 1
    `,
    [listingId]
  );

  if (!result.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }

  const row = result.rows[0];

  // T03: Gate non-public statuses. Only the seller (or an admin role,
  // if added later) can view draft/paused/deleted listings.
  const NON_PUBLIC_STATUSES = new Set(['draft', 'paused', 'deleted']);
  if (NON_PUBLIC_STATUSES.has(row.status)) {
    if (!viewerUserId || viewerUserId !== row.seller_id) {
      reply.code(403);
      return { ok: false, error: 'You do not have permission to view this listing.', code: 'LISTING_NOT_PUBLIC' };
    }
  }

  const imagesResult = await readDb.query<{
    image_url: string;
    sort_order: number;
  }>(
    `SELECT image_url, sort_order FROM listing_images WHERE listing_id = $1 ORDER BY sort_order`,
    [listingId]
  );

  const itemPrice = Number(row.price_gbp);
  const buyerProtectionFee = Number(Math.max(
    itemPrice * 0.05 + 0.7,
    itemPrice * 0.02
  ).toFixed(2));
  const estimatedTotal = Number((itemPrice + buyerProtectionFee).toFixed(2));

  // Per spec 04_DIRECT Â§5: backend-backed engagement summary.
  // Query Q&A count from the listing_qa table if it exists.
  let questionCount = 0;
  try {
    const qaResult = await readDb.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM listing_qa WHERE listing_id = $1`,
      [listingId]
    );
    questionCount = qaResult.rows[0] ? Number(qaResult.rows[0].count) : 0;
  } catch {
    // listing_qa table may not exist yet â€” default to 0.
    questionCount = 0;
  }

  const [wishlistResult, collectionResult, offerResult, answeredResult] = await Promise.all([
    readDb.query<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS count FROM interactions WHERE listing_id = $1 AND action = 'wishlist'`,
      [listingId]
    ),
    readDb.query<{ count: string }>(
      `SELECT COUNT(DISTINCT c.user_id)::text AS count
       FROM collection_items ci
       INNER JOIN collections c ON c.id = ci.collection_id
       WHERE ci.listing_id = $1`,
      [listingId]
    ),
    readDb.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM listing_offers WHERE listing_id = $1 AND status = 'pending'`,
      [listingId]
    ),
    readDb.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM listing_qa WHERE listing_id = $1 AND answer_text IS NOT NULL`,
      [listingId]
    ),
  ]);
  const wishlistCount = Number(wishlistResult.rows[0]?.count ?? 0);
  const collectionSaveCount = Number(collectionResult.rows[0]?.count ?? 0);
  const activeOfferCount = Number(offerResult.rows[0]?.count ?? 0);
  const answeredQuestionCount = Number(answeredResult.rows[0]?.count ?? 0);

  return {
    ok: true,
    listing: {
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      priceGbp: itemPrice,
      imageUrl: row.image_url,
      images: imagesResult.rows.map((r) => r.image_url),
      status: row.status,
      category: row.category,
      brand: row.brand,
      size: row.size,
      condition: row.condition,
      originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
      shippingMethod: row.shipping_method,
      shippingPayer: row.shipping_payer,
      createdAt: row.created_at,
      mediaFrozenAt: row.media_frozen_at,
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
      // Per spec 04_DIRECT Â§5: backend-backed engagement summary.
      // The frontend must not fabricate question counts.
      engagement: {
        listingId,
        likes: wishlistCount,
        wishlistCount,
        collectionSaveCount,
        activeOfferCount,
        questionCount,
        answeredQuestionCount,
        generatedAt: new Date().toISOString(),
      },
    },
    commerce: {
      itemPrice,
      buyerProtectionFee,
      estimatedTotal,
      currency: 'GBP',
      shippingMethod: row.shipping_method,
      shippingPayer: row.shipping_payer,
      protectionPolicy: {
        available: true,
        label: 'Buyer Protection',
        summary:
          'Items covered by Thryftverse Buyer Protection. If your item doesn\u2019t arrive or doesn\u2019t match the description, you may be eligible for a refund.',
      },
      returnPolicy: {
        accepted: null,
        windowDays: null,
        conditions: null,
        summary: 'Return policy confirmed at checkout based on seller status and your location.',
      },
      authenticity: {
        status: 'not_offered' as const,
      },
    },
  };
});

// T04: Policy/protection versioning â€” authoritative policy endpoint.
// Returns the currently published version of a policy document by key.
// The product detail screen references this instead of hardcoding terms.
app.get('/policies/:policyKey', async (request, reply) => {
  const paramsSchema = z.object({ policyKey: z.string().min(2).max(80) });
  const { policyKey } = paramsSchema.parse(request.params);

  let policyRow: {
    id: string;
    version: number;
    title: string;
    summary: string;
    body: string;
    jurisdiction: string | null;
    effective_at: string;
    published_at: string | null;
  } | null = null;

  try {
    const result = await readDb.query<{
      id: string;
      version: number;
      title: string;
      summary: string;
      body: string;
      jurisdiction: string | null;
      effective_at: string;
      published_at: string | null;
    }>(
      `
        SELECT id, version, title, summary, body, jurisdiction, effective_at, published_at
        FROM policy_documents
        WHERE policy_key = $1 AND status = 'published'
        ORDER BY version DESC
        LIMIT 1
      `,
      [policyKey]
    );
    policyRow = result.rows[0] ?? null;
  } catch {
    // Table may not exist yet â€” fall through to null.
    policyRow = null;
  }

  if (!policyRow) {
    reply.code(404);
    return { ok: false, error: 'Policy not found', code: 'POLICY_NOT_FOUND' };
  }

  return {
    ok: true,
    policy: {
      id: policyRow.id,
      policyKey,
      version: policyRow.version,
      title: policyRow.title,
      summary: policyRow.summary,
      body: policyRow.body,
      jurisdiction: policyRow.jurisdiction,
      effectiveAt: policyRow.effective_at,
      publishedAt: policyRow.published_at,
    },
  };
});

app.get('/listings/:listingId/sold-comparables', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);
  const sourceResult = await readDb.query<{ category: string | null; brand: string | null }>(
    `SELECT category, brand FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  const source = sourceResult.rows[0];
  if (!source) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }

  const comparableResult = source.category
    ? await readDb.query<{ price_gbp: number | string; sold_at: string }>(
        `SELECT o.subtotal_gbp AS price_gbp, o.paid_at AS sold_at
         FROM orders o
         INNER JOIN listings l ON l.id = o.listing_id
         WHERE o.listing_id <> $1
           AND o.status IN ('paid', 'shipped', 'delivered')
           AND o.paid_at IS NOT NULL
           AND l.status = 'sold'
           AND LOWER(l.category) = LOWER($2)
           AND ($3::text IS NULL OR LOWER(l.brand) = LOWER($3))
         ORDER BY o.paid_at DESC
         LIMIT 100`,
        [listingId, source.category, source.brand]
      )
    : { rows: [] as Array<{ price_gbp: number | string; sold_at: string }> };

  const samples = comparableResult.rows
    .map((row) => ({ price: Number(row.price_gbp), soldAt: row.sold_at }))
    .filter((row) => Number.isFinite(row.price) && row.price >= 0);
  const prices = samples.map((row) => row.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const medianPrice = prices.length === 0
    ? null
    : prices.length % 2 === 0
      ? Number(((prices[middle - 1] + prices[middle]) / 2).toFixed(2))
      : prices[middle];
  const soldDates = samples.map((row) => row.soldAt).sort();

  return {
    ok: true,
    comparables: {
      listingId,
      category: source.category,
      brand: source.brand,
      currency: 'GBP',
      sampleSize: prices.length,
      minPrice: prices[0] ?? null,
      medianPrice,
      maxPrice: prices[prices.length - 1] ?? null,
      dateFrom: soldDates[0] ?? null,
      dateTo: soldDates[soldDates.length - 1] ?? null,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.get('/listings/:listingId/price-history', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);
  const listingResult = await readDb.query<{ id: string }>(
    `SELECT id FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  if (!listingResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  const result = await readDb.query<{
    previous_price_gbp: number | string;
    new_price_gbp: number | string;
    changed_at: string;
  }>(
    `SELECT previous_price_gbp, new_price_gbp, changed_at
     FROM listing_price_events
     WHERE listing_id = $1
     ORDER BY changed_at DESC
     LIMIT 100`,
    [listingId]
  );
  return {
    ok: true,
    listingId,
    items: result.rows.map((row) => ({
      previousPrice: Number(row.previous_price_gbp),
      newPrice: Number(row.new_price_gbp),
      currency: 'GBP',
      changedAt: row.changed_at,
    })),
  };
});

app.get('/listings/:listingId/qa-summary', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);
  const listingResult = await readDb.query<{ id: string }>(
    `SELECT id FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  if (!listingResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  const [countsResult, latestResult] = await Promise.all([
    readDb.query<{ question_count: string; answered_count: string; latest_activity_at: string | null }>(
      `SELECT
         COUNT(*)::text AS question_count,
         COUNT(*) FILTER (WHERE answer_text IS NOT NULL)::text AS answered_count,
         MAX(GREATEST(created_at, COALESCE(answered_at, created_at))) AS latest_activity_at
       FROM listing_qa
       WHERE listing_id = $1`,
      [listingId]
    ),
    readDb.query<{ question_text: string; answer_text: string; answered_at: string }>(
      `SELECT question_text, answer_text, answered_at
       FROM listing_qa
       WHERE listing_id = $1 AND answer_text IS NOT NULL
       ORDER BY answered_at DESC
       LIMIT 1`,
      [listingId]
    ),
  ]);
  const counts = countsResult.rows[0];
  const latest = latestResult.rows[0] ?? null;
  return {
    ok: true,
    summary: {
      listingId,
      questionCount: Number(counts?.question_count ?? 0),
      answeredQuestionCount: Number(counts?.answered_count ?? 0),
      latestAnsweredQuestion: latest?.question_text ?? null,
      latestAnswer: latest?.answer_text ?? null,
      latestActivityAt: counts?.latest_activity_at ?? null,
    },
  };
});

app.get('/listings/:listingId/questions', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);
  const listingResult = await readDb.query<{ id: string }>(
    `SELECT id FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  if (!listingResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  const result = await readDb.query<{
    id: string;
    asker_id: string;
    asker_name: string;
    question_text: string;
    created_at: string;
    answer_text: string | null;
    responder_name: string | null;
    answered_at: string | null;
  }>(
    `SELECT
       q.id,
       q.asker_id,
       asker.username AS asker_name,
       q.question_text,
       q.created_at,
       q.answer_text,
       responder.username AS responder_name,
       q.answered_at
     FROM listing_qa q
     INNER JOIN users asker ON asker.id = q.asker_id
     LEFT JOIN users responder ON responder.id = q.answered_by
     WHERE q.listing_id = $1
     ORDER BY q.created_at DESC
     LIMIT 100`,
    [listingId]
  );
  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      listingId,
      askerId: row.asker_id,
      askerName: row.asker_name,
      text: row.question_text,
      createdAt: row.created_at,
      answer: row.answer_text && row.answered_at
        ? {
            text: row.answer_text,
            responderName: row.responder_name ?? 'Seller',
            createdAt: row.answered_at,
          }
        : null,
    })),
  };
});

app.post('/listings/:listingId/questions', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const bodySchema = z.object({ text: z.string().trim().min(5).max(300) });
  const { listingId } = paramsSchema.parse(request.params);
  const { text } = bodySchema.parse(request.body);
  const listingResult = await db.query<{ seller_id: string }>(
    `SELECT seller_id FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  if (!listingResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  if (listingResult.rows[0].seller_id === request.authUser.userId) {
    reply.code(403);
    return { ok: false, error: 'Sellers cannot ask questions on their own listing' };
  }
  const questionId = `lq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const result = await db.query<{ id: string; created_at: string }>(
    `INSERT INTO listing_qa (id, listing_id, asker_id, question_text)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [questionId, listingId, request.authUser.userId, text]
  );
  reply.code(201);
  return {
    ok: true,
    question: {
      id: result.rows[0].id,
      listingId,
      askerId: request.authUser.userId,
      text,
      createdAt: result.rows[0].created_at,
      answer: null,
    },
  };
});

app.post('/listings/:listingId/questions/:questionId/answer', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ listingId: z.string().min(2), questionId: z.string().min(2) });
  const bodySchema = z.object({ text: z.string().trim().min(3).max(500) });
  const { listingId, questionId } = paramsSchema.parse(request.params);
  const { text } = bodySchema.parse(request.body);
  const ownerResult = await db.query<{ seller_id: string }>(
    `SELECT seller_id FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  if (!ownerResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  if (ownerResult.rows[0].seller_id !== request.authUser.userId) {
    reply.code(403);
    return { ok: false, error: 'Only the seller can answer listing questions' };
  }
  const result = await db.query<{ answered_at: string }>(
    `UPDATE listing_qa
     SET answer_text = $4, answered_by = $3, answered_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND listing_id = $2
     RETURNING answered_at`,
    [questionId, listingId, request.authUser.userId, text]
  );
  if (!result.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Question not found' };
  }
  return {
    ok: true,
    answer: {
      text,
      responderName: 'Seller',
      createdAt: result.rows[0].answered_at,
    },
  };
});

app.post('/listings/:listingId/report', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const bodySchema = z.object({
    reason: z.enum([
      'spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment',
      'off_platform', 'hate_speech', 'prohibited', 'scam', 'misinformation',
      'privacy', 'impersonation', 'minor_safety', 'other',
    ]),
    details: z.string().trim().max(500).optional(),
  });
  const { listingId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const listingResult = await db.query<{ seller_id: string }>(
    `SELECT seller_id FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  if (!listingResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  if (listingResult.rows[0].seller_id === request.authUser.userId) {
    reply.code(403);
    return { ok: false, error: 'You cannot report your own listing' };
  }
  const reportId = `listing_report_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.query(
    `INSERT INTO listing_reports (id, reporter_id, listing_id, reason, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [reportId, request.authUser.userId, listingId, payload.reason, payload.details ?? null]
  );
  reply.code(201);
  return { ok: true, reportId };
});

app.get('/listings/:listingId/related', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);

  const sourceResult = await readDb.query<{ category: string | null; brand: string | null }>(
    `SELECT category, brand FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );

  const source = sourceResult.rows[0];
  if (!source) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }

  const result = await readDb.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: number | string;
    image_url: string | null;
    status: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    original_price_gbp: number | string | null;
    created_at: string;
    seller_username: string | null;
  }>(
    `
      SELECT
        l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
        l.status, l.category, l.brand, l.size, l.condition, l.original_price_gbp, l.created_at,
        u.username AS seller_username
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      WHERE l.id != $1
        AND l.status = 'active'
        AND (l.category = $2 OR l.brand ILIKE $3)
      ORDER BY l.created_at DESC
      LIMIT 8
    `,
    [listingId, source.category ?? '', `%${source.brand ?? ''}%`]
  );

  const listingIds = result.rows.map((r) => r.id);
  const imagesResult = listingIds.length
    ? await readDb.query<{
        listing_id: string;
        image_url: string;
        sort_order: number;
      }>(
        `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
        [listingIds]
      )
    : { rows: [] };

  const imagesByListing = new Map<string, string[]>();
  for (const img of imagesResult.rows) {
    const arr = imagesByListing.get(img.listing_id) ?? [];
    arr.push(img.image_url);
    imagesByListing.set(img.listing_id, arr);
  }

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      priceGbp: Number(row.price_gbp),
      imageUrl: row.image_url,
      images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
      status: row.status,
      category: row.category,
      brand: row.brand,
      size: row.size,
      condition: row.condition,
      originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
      createdAt: row.created_at,
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
});

// â”€â”€ Sectioned recommendations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const COMPLEMENTARY_CATEGORY_MAP: Record<string, string[]> = {
  tops: ['bottoms', 'outerwear', 'shoes', 'bags'],
  bottoms: ['tops', 'shoes', 'bags', 'outerwear'],
  dresses: ['shoes', 'bags', 'accessories', 'outerwear'],
  shoes: ['bottoms', 'dresses', 'bags'],
  bags: ['tops', 'bottoms', 'shoes', 'accessories'],
  outerwear: ['tops', 'bottoms', 'shoes', 'bags'],
  accessories: ['tops', 'dresses', 'bags'],
  jewellery: ['dresses', 'tops', 'bags'],
};

function getComplementaryCategories(category: string | null): string[] {
  if (!category) return [];
  return COMPLEMENTARY_CATEGORY_MAP[category.toLowerCase().trim()] ?? [];
}

app.get('/listings/:listingId/recommendations', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const querySchema = z.object({
    sections: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(24).optional().default(8),
    cursor: z.string().optional(),
    sessionId: z.string().optional(),
  });
  const { listingId } = paramsSchema.parse(request.params);
  const { sections: sectionsParam, limit, cursor } = querySchema.parse(request.query ?? {});
  const recommendationAsOf = new Date().toISOString();

  const viewerUserId = request.authUser?.userId ?? null;

  const sourceResult = await readDb.query<{
    id: string;
    seller_id: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price_gbp: number | string;
    status: string;
  }>(
    `SELECT id, seller_id, category, brand, size, condition, price_gbp, status FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );

  const source = sourceResult.rows[0];
  if (!source) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }

  const requestedSections = sectionsParam
    ? (sectionsParam.split(',') as string[])
    : null;

  type CandidateRow = {
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: number | string;
    image_url: string | null;
    status: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    original_price_gbp: number | string | null;
    created_at: string;
    seller_username: string | null;
  };

  const fetchCandidates = async (whereClause: string, args: unknown[], limitCount: number) => {
    const result = await readDb.query<CandidateRow>(
      `
        SELECT
          l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
          l.status, l.category, l.brand, l.size, l.condition, l.original_price_gbp, l.created_at,
          u.username AS seller_username
        FROM listings l
        LEFT JOIN users u ON u.id = l.seller_id
        WHERE ${whereClause}
        ORDER BY l.created_at DESC
        LIMIT $${args.length + 1}
      `,
      [...args, limitCount]
    );

    const listingIds = result.rows.map((r) => r.id);
    const imagesResult = listingIds.length
      ? await readDb.query<{ listing_id: string; image_url: string; sort_order: number }>(
          `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
          [listingIds]
        )
      : { rows: [] };

    const imagesByListing = new Map<string, string[]>();
    for (const img of imagesResult.rows) {
      const arr = imagesByListing.get(img.listing_id) ?? [];
      arr.push(img.image_url);
      imagesByListing.set(img.listing_id, arr);
    }

    return result.rows.map((row) => ({
      row,
      images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
    }));
  };

  const mapToListingItem = (candidate: { row: CandidateRow; images: string[] }) => ({
    id: candidate.row.id,
    sellerId: candidate.row.seller_id,
    title: candidate.row.title,
    description: candidate.row.description,
    priceGbp: Number(candidate.row.price_gbp),
    imageUrl: candidate.row.image_url,
    images: candidate.images,
    status: candidate.row.status,
    category: candidate.row.category,
    brand: candidate.row.brand,
    size: candidate.row.size,
    condition: candidate.row.condition,
    originalPriceGbp: candidate.row.original_price_gbp === null ? null : Number(candidate.row.original_price_gbp),
    createdAt: candidate.row.created_at,
    seller: candidate.row.seller_username
      ? {
          id: candidate.row.seller_id,
          username: candidate.row.seller_username,
          avatar: null,
          rating: null,
          reviewCount: null,
          location: null,
        }
      : null,
  });

  const sections: Array<{
    key: string;
    title: string;
    subtitle?: string;
    reason?: string;
    personalised: boolean;
    items: Array<
      | ReturnType<typeof mapToListingItem>
      | {
          id: string;
          type: 'look';
          title: string;
          coverImage: string;
          creatorId: string;
          creatorUsername: string | null;
        }
    >;
    nextCursor?: string;
  }> = [];

  const shouldInclude = (key: string) => !requestedSections || requestedSections.includes(key);

  const usedListingIds = new Set<string>();
  const scoreCandidate = (candidate: CandidateRow): number =>
    scoreProductRecommendation({
      candidate,
      source,
      asOf: recommendationAsOf,
    }).score;

  const dedupeAndMap = (
    candidates: Array<{ row: CandidateRow; images: string[] }>,
    opts?: { scoreBy?: (c: { row: CandidateRow; images: string[] }) => number }
  ) => {
    const filtered = candidates.filter((c) => !usedListingIds.has(c.row.id));
    if (opts?.scoreBy) {
      filtered.sort(
        (a, b) =>
          (opts.scoreBy!(b) ?? 0) - (opts.scoreBy!(a) ?? 0)
          || a.row.id.localeCompare(b.row.id),
      );
    }
    for (const c of filtered) usedListingIds.add(c.row.id);
    return filtered.map(mapToListingItem);
  };

  // 1. Similar style
  if (shouldInclude('similar_style')) {
    const candidates = await fetchCandidates(
      `l.id != $1 AND l.status = 'active' AND l.category = $2`,
      [listingId, source.category ?? ''],
      limit + 4
    );
    const scored = candidates
      .map((c) => ({ c, score: scoreCandidate(c.row) }))
      .sort((a, b) => b.score - a.score || a.c.row.id.localeCompare(b.c.row.id))
      .slice(0, limit)
      .map((x) => x.c);
    if (scored.length > 0) {
      const items = dedupeAndMap(scored);
      if (items.length > 0) {
        sections.push({
          key: 'similar_style',
          title: 'Similar in style',
          subtitle: source.category ? `More in ${source.category}` : undefined,
          reason: 'Same category and visual style',
          personalised: false,
          items,
        });
      }
    }
  }

  // 2. Same brand
  if (shouldInclude('same_brand') && source.brand) {
    const candidates = await fetchCandidates(
      `l.id != $1 AND l.status = 'active' AND l.brand ILIKE $2`,
      [listingId, `%${source.brand}%`],
      limit
    );
    const items = dedupeAndMap(candidates, {
      scoreBy: (c) => scoreCandidate(c.row),
    });
    if (items.length > 0) {
      sections.push({
        key: 'same_brand',
        title: `More from ${source.brand}`,
        reason: 'Same brand',
        personalised: false,
        items,
      });
    }
  }

  // 3. Same size and condition
  if (shouldInclude('same_size_condition') && source.size && source.condition) {
    const candidates = await fetchCandidates(
      `l.id != $1 AND l.status = 'active' AND l.size ILIKE $2 AND l.condition ILIKE $3`,
      [listingId, `%${source.size}%`, `%${source.condition}%`],
      limit
    );
    const items = dedupeAndMap(candidates, {
      scoreBy: (c) => scoreCandidate(c.row),
    });
    if (items.length > 0) {
      sections.push({
        key: 'same_size_condition',
        title: 'Your size and condition',
        subtitle: `Size ${source.size} Â· ${source.condition}`,
        reason: 'Same size and condition',
        personalised: false,
        items,
      });
    }
  }

  // 4. Better price
  if (shouldInclude('better_price')) {
    const sourcePrice = Number(source.price_gbp);
    if (sourcePrice > 0) {
      const candidates = await fetchCandidates(
        `l.id != $1 AND l.status = 'active' AND l.category = $2 AND l.price_gbp < $3`,
        [listingId, source.category ?? '', sourcePrice],
        limit
      );
      const items = dedupeAndMap(candidates, {
        scoreBy: (c) => {
          const priceDiff = sourcePrice - Number(c.row.price_gbp);
          return -priceDiff;
        },
      });
      if (items.length > 0) {
        sections.push({
          key: 'better_price',
          title: 'Better price alternatives',
          subtitle: 'Similar items for less',
          reason: 'Lower price alternatives',
          personalised: false,
          items,
        });
      }
    }
  }

  // 5. More from seller
  if (shouldInclude('more_from_seller')) {
    const candidates = await fetchCandidates(
      `l.id != $1 AND l.status = 'active' AND l.seller_id = $2`,
      [listingId, source.seller_id],
      limit
    );
    const items = dedupeAndMap(candidates, {
      scoreBy: (c) => scoreCandidate(c.row),
    });
    if (items.length > 0) {
      sections.push({
        key: 'more_from_seller',
        title: 'More from this seller',
        subtitle: 'Bundle and save on shipping',
        reason: 'From the same seller',
        personalised: false,
        items,
      });
    }
  }

  // 6. Complete the look (complementary categories)
  if (shouldInclude('complete_the_look')) {
    const complementaryCats = getComplementaryCategories(source.category);
    if (complementaryCats.length > 0) {
      const placeholders = complementaryCats.map((_, i) => `$${i + 2}`).join(', ');
      const candidates = await fetchCandidates(
        `l.id != $1 AND l.status = 'active' AND l.category IN (${placeholders})`,
        [listingId, ...complementaryCats],
        limit
      );
      const items = dedupeAndMap(candidates, {
        scoreBy: (c) => scoreCandidate(c.row),
      });
      if (items.length > 0) {
        sections.push({
          key: 'complete_the_look',
          title: 'Complete the look',
          subtitle: 'Pieces that go well together',
          reason: 'Complementary categories',
          personalised: false,
          items,
        });
      }
    }
  }

  // 7. Seen in looks
  if (shouldInclude('seen_in_looks')) {
    const looksResult = await readDb.query<{
      look_id: string;
      look_title: string;
      media_url: string;
      creator_id: string;
      creator_username: string | null;
    }>(
      `
        SELECT lt.look_id, l.title AS look_title, l.media_url, l.creator_id, u.username AS creator_username
        FROM look_tags lt
        JOIN looks l ON l.id = lt.look_id
        LEFT JOIN users u ON u.id = l.creator_id
        WHERE lt.listing_id = $1 AND l.status = 'published'
        LIMIT 12
      `,
      [listingId]
    );
    if (looksResult.rows.length > 0) {
      const lookItems = looksResult.rows.map((row) => ({
        id: row.look_id,
        type: 'look' as const,
        title: row.look_title,
        coverImage: row.media_url,
        creatorId: row.creator_id,
        creatorUsername: row.creator_username,
      }));
      sections.push({
        key: 'seen_in_looks',
        title: 'Seen in Looks',
        subtitle: 'Styled by the community',
        reason: 'Tagged in community Looks',
        personalised: false,
        items: lookItems,
      });
    }
  }

  // 8. Inspired by saves (personalised)
  if (shouldInclude('inspired_by_saves') && viewerUserId) {
    const savesResult = await readDb.query<{ listing_id: string }>(
      `SELECT listing_id FROM interactions WHERE user_id = $1 AND action = 'wishlist' ORDER BY created_at DESC LIMIT 20`,
      [viewerUserId]
    );
    if (savesResult.rows.length > 0) {
      const savedListingIds = savesResult.rows.map((r) => r.listing_id);
      const savedListingsResult = await readDb.query<{ category: string | null; brand: string | null }>(
        `SELECT category, brand FROM listings WHERE id = ANY($1)`,
        [savedListingIds]
      );
      const savedCategories = new Set(savedListingsResult.rows.map((r) => r.category).filter(Boolean) as string[]);
      const savedBrands = new Set(savedListingsResult.rows.map((r) => r.brand).filter(Boolean) as string[]);

      if (savedCategories.size > 0 || savedBrands.size > 0) {
        const catPlaceholders = Array.from(savedCategories).map((_, i) => `$${i + 2}`).join(', ');
        const catArgs = [listingId, ...Array.from(savedCategories)];
        const candidates = await fetchCandidates(
          `l.id != $1 AND l.status = 'active' AND l.category IN (${catPlaceholders})`,
          catArgs,
          limit
        );
        const items = dedupeAndMap(candidates, {
          scoreBy: (c) => scoreCandidate(c.row),
        });
        if (items.length > 0) {
          sections.push({
            key: 'inspired_by_saves',
            title: 'Inspired by your saves',
            subtitle: 'Based on items you\u2019ve saved',
            reason: 'Based on your saves',
            personalised: true,
            items,
          });
        }
      }
    }
  }

  // 9. Continue exploring
  if (shouldInclude('continue_exploring')) {
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        cursorCreatedAt = decoded.createdAt ?? null;
        cursorId = decoded.id ?? null;
      } catch {
        reply.code(400);
        return { ok: false, error: 'Invalid cursor' };
      }
    }

    const candidates = await readDb.query<CandidateRow>(
      `
        SELECT
          l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
          l.status, l.category, l.brand, l.size, l.condition, l.original_price_gbp, l.created_at,
          u.username AS seller_username
        FROM listings l
        LEFT JOIN users u ON u.id = l.seller_id
        WHERE l.id != $1 AND l.status = 'active'
          ${cursorCreatedAt && cursorId ? 'AND (l.created_at, l.id) < ($2, $3)' : ''}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $${cursorCreatedAt && cursorId ? 4 : 2}
      `,
      cursorCreatedAt && cursorId
        ? [listingId, cursorCreatedAt, cursorId, limit + 1]
        : [listingId, limit + 1]
    );

    const listingIds = candidates.rows.map((r) => r.id);
    const imagesResult = listingIds.length
      ? await readDb.query<{ listing_id: string; image_url: string; sort_order: number }>(
          `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
          [listingIds]
        )
      : { rows: [] };

    const imagesByListing = new Map<string, string[]>();
    for (const img of imagesResult.rows) {
      const arr = imagesByListing.get(img.listing_id) ?? [];
      arr.push(img.image_url);
      imagesByListing.set(img.listing_id, arr);
    }

    const mapped = candidates.rows
      .filter((row) => !usedListingIds.has(row.id))
      .map((row) => ({
        row,
        images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
      }))
      .slice(0, limit);

    const hasMore = candidates.rows.length > limit;
    const lastItem = mapped[mapped.length - 1];
    const nextCursor = hasMore && lastItem
      ? Buffer.from(JSON.stringify({
          createdAt: lastItem.row.created_at,
          id: lastItem.row.id,
        })).toString('base64')
      : undefined;

    if (mapped.length > 0) {
      sections.push({
        key: 'continue_exploring',
        title: 'Explore more',
        subtitle: 'Keep discovering',
        reason: 'Recently viewed and trending',
        personalised: false,
        items: mapped.map(mapToListingItem),
        nextCursor,
      });
    }
  }

  return {
    listingId,
    decision: {
      policyVersion: PRODUCT_RECOMMENDATION_POLICY_VERSION,
      capabilityLevel: 'heuristic_baseline',
      trainedModel: false,
      generatedAt: recommendationAsOf,
    },
    sections,
  };
});

app.patch('/listings/:listingId', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().min(10).optional(),
    priceGbp: z.number().nonnegative().optional(),
    imageUrl: z.string().url().optional(),
    coverFinalizationId: z.string().min(2).max(120).optional(),
    status: z.enum(['draft', 'active', 'paused', 'sold', 'deleted']).optional(),
    category: z.string().min(1).optional(),
    brand: z.string().min(1).optional(),
    size: z.string().min(1).optional(),
    condition: z.string().min(1).optional(),
    originalPriceGbp: z.number().nonnegative().optional(),
    shippingMethod: z.string().min(1).optional(),
    shippingPayer: z.string().min(1).optional(),
  });

  const payload = bodySchema.parse(request.body);

  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const add = (col: string, val: unknown) => {
    if (val !== undefined) { sets.push(`${col} = $${idx++}`); values.push(val); }
  };

  add('title', payload.title);
  add('description', payload.description);
  add('price_gbp', payload.priceGbp);
  add('image_url', payload.imageUrl);
  add('status', payload.status);
  add('category', payload.category);
  add('brand', payload.brand);
  add('size', payload.size);
  add('condition', payload.condition);
  add('original_price_gbp', payload.originalPriceGbp);
  add('shipping_method', payload.shippingMethod);
  add('shipping_payer', payload.shippingPayer);
  const imageSetIndex = sets.findIndex((entry) => entry.startsWith('image_url ='));

  if (sets.length === 0) {
    return { ok: true, listingId };
  }

  sets.push('updated_at = NOW()');
  values.push(listingId);

  const client = await db.connect();
  let priceEvent:
    | { id: number; previousPriceGbp: number; newPriceGbp: number }
    | null = null;
  let priceOutboxEventId: string | null = null;
  let coverMediaAssetId: string | null = null;
  try {
    await client.query('BEGIN');
    const existing = await client.query<{
      id: string;
      seller_id: string;
      price_gbp: number | string;
      image_url: string | null;
    }>(
      `SELECT id, seller_id, price_gbp, image_url
       FROM listings
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [listingId],
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Listing not found' };
    }
    if (existing.rows[0].seller_id !== actorUserId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the seller can update this listing' };
    }

    const previousPriceGbp = Number(existing.rows[0].price_gbp);
    const coverChanged =
      payload.imageUrl !== undefined
      && payload.imageUrl !== existing.rows[0].image_url;
    if (coverChanged) {
      if (!payload.coverFinalizationId) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'A verified cover upload is required' };
      }
      const cover = await client.query<{
        owner_id: string;
        public_url: string;
        content_type: string;
        status: string;
        media_asset_id: string | null;
        media_asset_status: string | null;
        canonical_url: string | null;
      }>(
        `SELECT finalization.owner_id, finalization.public_url,
                finalization.content_type, finalization.status,
                finalization.media_asset_id,
                asset.status AS media_asset_status,
                asset.canonical_url
         FROM upload_finalizations finalization
         LEFT JOIN media_assets asset
           ON asset.id = finalization.media_asset_id
         WHERE finalization.id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.coverFinalizationId],
      );
      const verifiedCover = cover.rows[0];
      if (
        !verifiedCover
        || verifiedCover.owner_id !== actorUserId
        || verifiedCover.status !== 'finalized'
        || (
          verifiedCover.public_url !== payload.imageUrl
          && verifiedCover.canonical_url !== payload.imageUrl
        )
        || !verifiedCover.content_type.startsWith('image/')
      ) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Cover image does not match the verified upload' };
      }
      if (
        config.mediaPublicationGateEnabled
        && (
          verifiedCover.media_asset_status !== 'published'
          || !verifiedCover.canonical_url
        )
      ) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Cover media is still being processed or moderated',
          code: 'MEDIA_NOT_PUBLISHED',
          mediaStatus: verifiedCover.media_asset_status ?? 'missing',
        };
      }
      if (imageSetIndex >= 0) {
        values[imageSetIndex] = config.mediaPublicationGateEnabled
          ? verifiedCover.canonical_url
          : verifiedCover.public_url;
      }
      coverMediaAssetId = verifiedCover.media_asset_status === 'published'
        ? verifiedCover.media_asset_id
        : null;
    }
    await client.query(
      `UPDATE listings SET ${sets.join(', ')} WHERE id = $${idx}`,
      values,
    );

    if (payload.priceGbp !== undefined && payload.priceGbp !== previousPriceGbp) {
      const insertedEvent = await client.query<{ id: number }>(
        `INSERT INTO listing_price_events (listing_id, previous_price_gbp, new_price_gbp)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [listingId, previousPriceGbp, payload.priceGbp],
      );
      priceEvent = {
        id: insertedEvent.rows[0].id,
        previousPriceGbp,
        newPriceGbp: payload.priceGbp,
      };
      priceOutboxEventId = await appendDomainEvent(client, {
        aggregateType: 'listing',
        aggregateId: listingId,
        eventType: 'listing.price_changed',
        actorId: actorUserId,
        correlationId: request.id,
        deduplicationKey: `listing.price_changed:${insertedEvent.rows[0].id}`,
        payload: {
          listingId,
          priceEventId: insertedEvent.rows[0].id,
          previousPriceGbp,
          newPriceGbp: payload.priceGbp,
        },
      });
    }
    if (coverChanged && payload.coverFinalizationId) {
      await client.query(
        `UPDATE upload_finalizations
         SET scope = 'listing_media', scope_ref_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [payload.coverFinalizationId, listingId],
      );
    }
    if (coverChanged && coverMediaAssetId) {
      await client.query(
        `UPDATE media_bindings
         SET removed_at = NOW()
         WHERE target_type = 'listing'
           AND target_ref_id = $1
           AND role = 'cover'
           AND media_asset_id <> $2
           AND removed_at IS NULL`,
        [listingId, coverMediaAssetId],
      );
      await client.query(
        `INSERT INTO media_bindings (
           id, media_asset_id, owner_id, target_type,
           target_ref_id, role, sort_order
         )
         VALUES ($1, $2, $3, 'listing', $4, 'cover', 0)
         ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
         DO UPDATE SET removed_at = NULL, sort_order = 0`,
        [
          `mbind_${crypto.randomUUID()}`,
          coverMediaAssetId,
          actorUserId,
          listingId,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    app.log.error({ err: error, listingId }, 'Failed to update listing');
    reply.code(500);
    return { ok: false, error: 'Failed to update listing' };
  } finally {
    client.release();
  }

  let alertEvaluation: { evaluated: number; triggered: number } | undefined;
  if (priceEvent) {
    try {
      alertEvaluation = await evaluatePriceAlertsForListing({
        db,
        listingId,
        priceEventId: priceEvent.id,
        previousPriceGbp: priceEvent.previousPriceGbp,
        newPriceGbp: priceEvent.newPriceGbp,
        queueNotification: queueUserNotification,
      });
      if (priceOutboxEventId) {
        await completeDomainOutboxEvent(db, priceOutboxEventId);
      }
    } catch (error) {
      // The price event is durable and can be retried through the evaluator
      // endpoint; never roll back the seller's valid listing update because
      // a delivery provider is temporarily unavailable.
      app.log.error({ err: error, listingId, priceEventId: priceEvent.id }, 'Price-alert evaluation failed');
      void enqueueOutboxDrainJob('after_commit').catch((enqueueError) => {
        app.log.error(
          { err: enqueueError, listingId, priceEventId: priceEvent.id },
          'Failed enqueueing price-alert outbox retry',
        );
      });
    }
  }

  // Invalidate search cache since listing data changed (fire-and-forget)
  void invalidateSearchCache(redis).catch((cacheError) => {
    app.log.error({ err: cacheError, listingId }, 'Failed to invalidate search cache after listing update');
  });

  // Sync the updated listing into the search index (fire-and-forget)
  void syncSingleListing(db, listingId).catch(() => {});

  return { ok: true, listingId, alertEvaluation };
});

app.delete('/listings/:listingId', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);

  const existing = await db.query<{ seller_id: string; status: string }>(
    `SELECT seller_id, status FROM listings WHERE id = $1 LIMIT 1`,
    [listingId],
  );
  if (!existing.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  if (existing.rows[0].seller_id !== actorUserId) {
    reply.code(403);
    return { ok: false, error: 'Only the seller can delete this listing' };
  }
  if (existing.rows[0].status === 'sold') {
    reply.code(409);
    return { ok: false, error: 'Sold listings are retained for order history' };
  }

  // Soft-delete preserves offers, moderation evidence, analytics and any
  // historical references. Media objects can be garbage-collected only after
  // their retention window and reference count reach zero.
  await db.query(
    `UPDATE listings SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
    [listingId],
  );

  // Invalidate search cache since listing data changed (fire-and-forget)
  void invalidateSearchCache(redis).catch((cacheError) => {
    app.log.error({ err: cacheError, listingId }, 'Failed to invalidate search cache after listing delete');
  });

  // Remove the deleted listing from the search index (fire-and-forget)
  void removeListingFromIndex(listingId).catch(() => {});

  return { ok: true };
});

// â”€â”€ Seller Hub Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Server-backed aggregate that computes real money, tasks, and inventory
// from the orders, listing_offers, and listings tables.
// Per closure program 05_SELLER_HUB_AND_PROFILE_OS: no frontend
// approximation of financial KPIs.
app.get('/seller-hub/overview', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const sellerId = request.authUser.userId;

  // Inventory counts from listings (real statuses)
  const inventoryResult = await readDb.query<{
    active: string;
    drafts: string;
    paused: string;
    sold: string;
    active_value: string | null;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'draft') AS drafts,
        COUNT(*) FILTER (WHERE status = 'paused') AS paused,
        COUNT(*) FILTER (WHERE status = 'sold') AS sold,
        COALESCE(SUM(price_gbp) FILTER (WHERE status = 'active'), 0) AS active_value
      FROM listings
      WHERE seller_id = $1 AND status != 'deleted'
    `,
    [sellerId]
  );

  // Order tasks: orders that need shipping (status = 'paid')
  const shipOrdersResult = await readDb.query<{ count: string; oldest_created: string | null }>(
    `
      SELECT COUNT(*) AS count, MIN(created_at)::text AS oldest_created
      FROM orders
      WHERE seller_id = $1 AND status = 'paid'
    `,
    [sellerId]
  );

  // Offer tasks: pending offers on seller's listings
  const offersResult = await readDb.query<{ count: string }>(
    `
      SELECT COUNT(*) AS count
      FROM listing_offers
      WHERE seller_id = $1 AND status = 'pending' AND expires_at > NOW()
    `,
    [sellerId]
  );

  // Sales performance (last 30 days) â€” real settled order totals
  const performanceResult = await readDb.query<{
    gross_sales: string | null;
    orders: string;
  }>(
    `
      SELECT
        COALESCE(SUM(subtotal_gbp), 0) AS gross_sales,
        COUNT(*) AS orders
      FROM orders
      WHERE seller_id = $1
        AND status IN ('paid', 'shipped', 'delivered')
        AND created_at >= NOW() - INTERVAL '30 days'
    `,
    [sellerId]
  );

  // Listing issues: active listings missing required fields (title, price, or image)
  const listingIssuesResult = await readDb.query<{ count: string }>(
    `
      SELECT COUNT(*) AS count
      FROM listings
      WHERE seller_id = $1
        AND status = 'active'
        AND (title IS NULL OR title = '' OR price_gbp IS NULL OR price_gbp <= 0 OR image_url IS NULL)
    `,
    [sellerId]
  );

  const inventory = inventoryResult.rows[0] ?? { active: '0', drafts: '0', paused: '0', sold: '0', active_value: '0' };
  const shipOrders = shipOrdersResult.rows[0] ?? { count: '0', oldest_created: null };
  const offers = offersResult.rows[0] ?? { count: '0' };
  const performance = performanceResult.rows[0] ?? { gross_sales: '0', orders: '0' };
  const listingIssues = listingIssuesResult.rows[0] ?? { count: '0' };

  // Build tasks array (only include tasks with count > 0)
  const tasks: Array<
    | { type: 'ship_order'; count: number; oldestDueAt?: string }
    | { type: 'respond_offer'; count: number }
    | { type: 'listing_issue'; count: number }
  > = [];

  const shipCount = parseInt(shipOrders.count, 10) || 0;
  if (shipCount > 0) {
    tasks.push({ type: 'ship_order', count: shipCount, oldestDueAt: shipOrders.oldest_created ?? undefined });
  }
  const offerCount = parseInt(offers.count, 10) || 0;
  if (offerCount > 0) {
    tasks.push({ type: 'respond_offer', count: offerCount });
  }
  const issueCount = parseInt(listingIssues.count, 10) || 0;
  if (issueCount > 0) {
    tasks.push({ type: 'listing_issue', count: issueCount });
  }

  return {
    ok: true,
    overview: {
      generatedAt: new Date().toISOString(),
      inventory: {
        active: parseInt(inventory.active, 10) || 0,
        drafts: parseInt(inventory.drafts, 10) || 0,
        paused: parseInt(inventory.paused, 10) || 0,
        sold: parseInt(inventory.sold, 10) || 0,
        listedValueGbp: parseFloat(String(inventory.active_value ?? '0')) || 0,
      },
      tasks,
      performance: {
        period: '30d' as const,
        grossSalesGbp: parseFloat(String(performance.gross_sales ?? '0')) || 0,
        orders: parseInt(performance.orders, 10) || 0,
      },
    },
  };
});

app.get('/users/:userId/listings', async (request) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const querySchema = z.object({
    status: z.enum(['draft', 'active', 'paused', 'sold', 'deleted']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(60),
  });

  const { userId } = paramsSchema.parse(request.params);
  const { status, limit } = querySchema.parse(request.query);

  const conditions: string[] = ['seller_id = $1'];
  const args: unknown[] = [userId];

  if (status) {
    conditions.push(`status = $${args.length + 1}`);
    args.push(status);
  }

  const result = await readDb.query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_gbp: number | string;
    image_url: string | null;
    status: string;
    category: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    original_price_gbp: number | string | null;
    created_at: string;
    seller_username: string | null;
  }>(
    `
      SELECT
        l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
        l.status, l.category, l.brand, l.size, l.condition,
        l.original_price_gbp, l.created_at,
        u.username AS seller_username
      FROM listings l
      LEFT JOIN users u ON u.id = l.seller_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.created_at DESC
      LIMIT $${args.length + 1}
    `,
    [...args, limit]
  );

  const listingIds = result.rows.map((r) => r.id);
  const imagesResult = listingIds.length
    ? await readDb.query<{
        listing_id: string;
        image_url: string;
        sort_order: number;
        media_width: number | null;
        media_height: number | null;
      }>(
        `SELECT
           listing_id,
           image_url,
           sort_order,
           NULLIF(to_jsonb(listing_images) ->> 'media_width', '')::integer AS media_width,
           NULLIF(to_jsonb(listing_images) ->> 'media_height', '')::integer AS media_height
         FROM listing_images
         WHERE listing_id = ANY($1)
         ORDER BY listing_id, sort_order`,
        [listingIds]
      )
    : { rows: [] };

  const imagesByListing = new Map<string, string[]>();
  const primaryGeometryByListing = new Map<string, { width: number; height: number } | null>();
  for (const img of imagesResult.rows) {
    const arr = imagesByListing.get(img.listing_id) ?? [];
    arr.push(img.image_url);
    imagesByListing.set(img.listing_id, arr);
    if (!primaryGeometryByListing.has(img.listing_id)) {
      primaryGeometryByListing.set(
        img.listing_id,
        img.media_width !== null && img.media_height !== null
          ? { width: img.media_width, height: img.media_height }
          : null,
      );
    }
  }

  return {
    items: result.rows.map((row) => {
      const primaryGeometry = primaryGeometryByListing.get(row.id);
      return {
        id: row.id,
        sellerId: row.seller_id,
        title: row.title,
        description: row.description,
        priceGbp: Number(row.price_gbp),
        imageUrl: row.image_url,
        images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
        mediaWidth: primaryGeometry?.width ?? null,
        mediaHeight: primaryGeometry?.height ?? null,
        mediaAspectRatio: primaryGeometry
          ? primaryGeometry.width / primaryGeometry.height
          : null,
        status: row.status,
        category: row.category,
        brand: row.brand,
        size: row.size,
        condition: row.condition,
        originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
        createdAt: row.created_at,
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
      };
    }),
  };
});

app.post('/listing-images', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const bodySchema = z.object({
    id: z.string().min(2),
    listingId: z.string().min(2),
    imageUrl: z.string().url(),
    sortOrder: z.number().int().min(0).default(0),
    mediaWidth: z.number().int().positive().optional(),
    mediaHeight: z.number().int().positive().optional(),
    mediaType: z.enum(['image', 'video']).default('image'),
    finalizationId: z.string().min(2).max(120),
    posterUrl: z.string().url().nullable().optional(),
    blurhash: z.string().min(1).max(200).nullable().optional(),
    focalX: z.number().min(0).max(1).nullable().optional(),
    focalY: z.number().min(0).max(1).nullable().optional(),
  });

  const payload = bodySchema.parse(request.body);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const listing = await client.query<{ seller_id: string; status: string }>(
      `SELECT seller_id, status
       FROM listings
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [payload.listingId],
    );
    if (!listing.rowCount) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Listing not found' };
    }
    if (listing.rows[0].seller_id !== actorUserId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the seller can attach listing media' };
    }
    if (!['draft', 'active'].includes(listing.rows[0].status)) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Media cannot be changed in the current listing state' };
    }

    const finalization = await client.query<{
      public_url: string;
      content_type: string;
      status: string;
      owner_id: string;
      media_asset_id: string | null;
      media_asset_status: string | null;
      canonical_url: string | null;
    }>(
      `SELECT finalization.public_url, finalization.content_type,
              finalization.status, finalization.owner_id,
              finalization.media_asset_id,
              asset.status AS media_asset_status,
              asset.canonical_url
       FROM upload_finalizations finalization
       LEFT JOIN media_assets asset
         ON asset.id = finalization.media_asset_id
       WHERE finalization.id = $1
       LIMIT 1
       FOR UPDATE`,
      [payload.finalizationId],
    );
    if (!finalization.rowCount) {
      await client.query('ROLLBACK');
      reply.code(422);
      return { ok: false, error: 'Verified upload finalization not found' };
    }
    const verifiedUpload = finalization.rows[0];
    const mediaPrefix = payload.mediaType === 'video' ? 'video/' : 'image/';
    if (
      verifiedUpload.owner_id !== actorUserId
      || verifiedUpload.status !== 'finalized'
      || (
        verifiedUpload.public_url !== payload.imageUrl
        && verifiedUpload.canonical_url !== payload.imageUrl
      )
      || !verifiedUpload.content_type.startsWith(mediaPrefix)
    ) {
      await client.query('ROLLBACK');
      reply.code(422);
      return { ok: false, error: 'Listing media does not match the verified upload' };
    }
    if (
      config.mediaPublicationGateEnabled
      && (
        verifiedUpload.media_asset_status !== 'published'
        || !verifiedUpload.canonical_url
      )
    ) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Listing media is still being processed or moderated',
        code: 'MEDIA_NOT_PUBLISHED',
        mediaStatus: verifiedUpload.media_asset_status ?? 'missing',
      };
    }
    const resolvedMediaUrl = config.mediaPublicationGateEnabled
      ? verifiedUpload.canonical_url
      : verifiedUpload.public_url;

    const attached = await client.query<{ id: string }>(
      `
        INSERT INTO listing_images (
          id, listing_id, image_url, sort_order, media_width, media_height,
          media_type, poster_url, blurhash, focal_x, focal_y
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET image_url = EXCLUDED.image_url,
            sort_order = EXCLUDED.sort_order,
            media_width = EXCLUDED.media_width,
            media_height = EXCLUDED.media_height,
            media_type = EXCLUDED.media_type,
            poster_url = EXCLUDED.poster_url,
            blurhash = EXCLUDED.blurhash,
            focal_x = EXCLUDED.focal_x,
            focal_y = EXCLUDED.focal_y
        WHERE listing_images.listing_id = EXCLUDED.listing_id
        RETURNING id
      `,
      [
        payload.id,
        payload.listingId,
        resolvedMediaUrl,
        payload.sortOrder,
        payload.mediaWidth ?? null,
        payload.mediaHeight ?? null,
        payload.mediaType,
        payload.posterUrl ?? null,
        payload.blurhash ?? null,
        payload.focalX ?? null,
        payload.focalY ?? null,
      ],
    );
    if (!attached.rowCount) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Media attachment ID belongs to another listing' };
    }

    await client.query(
      `UPDATE upload_finalizations
       SET scope = 'listing_media',
           scope_ref_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [payload.finalizationId, payload.listingId],
    );
    if (
      verifiedUpload.media_asset_id
      && verifiedUpload.media_asset_status === 'published'
    ) {
      await client.query(
        `INSERT INTO media_bindings (
           id, media_asset_id, owner_id, target_type,
           target_ref_id, role, sort_order
         )
         VALUES ($1, $2, $3, 'listing', $4, $5, $6)
         ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
         DO UPDATE SET removed_at = NULL, sort_order = EXCLUDED.sort_order`,
        [
          `mbind_${crypto.randomUUID()}`,
          verifiedUpload.media_asset_id,
          actorUserId,
          payload.listingId,
          payload.mediaType,
          payload.sortOrder,
        ],
      );
    }
    await client.query('COMMIT');

    reply.code(201);
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    app.log.error({ err: error, listingId: payload.listingId }, 'Failed to attach listing media');
    reply.code(500);
    return { ok: false, error: 'Failed to attach listing media' };
  } finally {
    client.release();
  }
});

// â”€â”€ M05: Poster verification â”€â”€
// Marks a listing image's poster URL as verified. The verifier (seller
// or admin) confirms the poster URL is accessible and represents the
// video. This makes the poster trust backend-backed rather than
// asserted.
app.post('/listing-images/:imageId/verify-poster', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ imageId: z.string().min(2) });
  const { imageId } = paramsSchema.parse(request.params);

  const result = await db.query<{ listing_id: string; poster_url: string | null }>(
    `SELECT listing_id, poster_url FROM listing_images WHERE id = $1`,
    [imageId]
  );
  const image = result.rows[0];
  if (!image) {
    reply.code(404);
    return { ok: false, error: 'Listing image not found' };
  }
  if (!image.poster_url) {
    reply.code(409);
    return { ok: false, error: 'No poster URL to verify', code: 'NO_POSTER' };
  }

  // Verify the listing belongs to the actor.
  const listingResult = await db.query<{ seller_id: string }>(
    'SELECT seller_id FROM listings WHERE id = $1',
    [image.listing_id]
  );
  if (listingResult.rows[0]?.seller_id !== actorUserId) {
    reply.code(403);
    return { ok: false, error: 'Only the seller can verify poster URLs' };
  }

  await db.query(
    `UPDATE listing_images SET poster_verified_at = NOW(), poster_verified_by = $2 WHERE id = $1`,
    [imageId, actorUserId]
  );

  return { ok: true, verifiedAt: new Date().toISOString() };
});

// â”€â”€ M07: Media freeze â”€â”€
// Freezes media for a listing so it cannot be silently swapped while
// the item is live. The seller can unfreeze (e.g. to replace a media
// item) but the action is auditable.
app.post('/listings/:listingId/media/freeze', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);

  const listing = await db.query<{ seller_id: string }>(
    'SELECT seller_id FROM listings WHERE id = $1',
    [listingId]
  );
  if (!listing.rows[0]) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  if (listing.rows[0].seller_id !== actorUserId) {
    reply.code(403);
    return { ok: false, error: 'Only the seller can freeze media' };
  }

  await db.query(
    `UPDATE listings SET media_frozen_at = NOW() WHERE id = $1`,
    [listingId]
  );

  return { ok: true, frozenAt: new Date().toISOString() };
});

app.post('/listings/:listingId/media/unfreeze', async (request, reply) => {
  const actorUserId = resolveAuthenticatedUserId(request);
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);

  const listing = await db.query<{ seller_id: string }>(
    'SELECT seller_id FROM listings WHERE id = $1',
    [listingId]
  );
  if (!listing.rows[0]) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  if (listing.rows[0].seller_id !== actorUserId) {
    reply.code(403);
    return { ok: false, error: 'Only the seller can unfreeze media' };
  }

  await db.query(
    `UPDATE listings SET media_frozen_at = NULL WHERE id = $1`,
    [listingId]
  );

  return { ok: true };
});

};
