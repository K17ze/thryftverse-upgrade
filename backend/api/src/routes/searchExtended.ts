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
import {
  loadListingMedia,
  listingImageUrls,
  type ListingMediaItem,
} from '../lib/media/listingMediaProjection.js';
import { reachExcludedSql, reachRankMultiplierExpr } from '../lib/sellerReach.js';
import {
  blendPromotedIntoResults,
  fetchPromotedListingsForQuery,
  recordPromotionImpressions,
  PROMOTED_DISCLOSURE,
  type PromotedListingPlacement,
} from '../lib/promotionServing.js';

type SearchExtendedRouteDependencies = {
  app: FastifyInstance;
  /** Primary pool — promoted-slot settlement and impression writes. */
  db: Pool;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
  redis: Redis;
};

// pg_trgm fallback tuning (migration 298). The `%` operator respects
// pg_trgm.similarity_threshold (default 0.3); the explicit similarity()
// predicates widen the net slightly below that so near-miss titles and
// brands still surface. Trigrams are only meaningful at 3+ characters —
// below that similarity() returns garbage, so short queries stay on the
// substring-only fallback.
const TRGM_MIN_QUERY_LENGTH = 3;
const TRGM_TITLE_THRESHOLD = 0.2;
const TRGM_BRAND_THRESHOLD = 0.25;

const searchListingsQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  /** Multi-value filters: comma-separated lists matching the Filter
   *  sheet's multi-select contract (brands[], sizes[]). */
  brands: z.string().min(1).optional(),
  sizes: z.string().min(1).optional(),
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
  brands: string[] | undefined,
  sizes: string[] | undefined,
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
  if (brands && brands.length > 0) {
    filterConditions.push(`l.brand = ANY($${filterIdx++})`);
    filterArgs.push(brands);
  }
  if (sizes && sizes.length > 0) {
    filterConditions.push(`l.size = ANY($${filterIdx++})`);
    filterArgs.push(sizes);
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
      // Postgres resolves bare output aliases in ORDER BY, but not inside
      // expressions — `rank_score::numeric` would look for a real column
      // named rank_score and 42703. Order on the rank expression directly.
      // Reach demotion: a 'limited' seller's listings keep 30% of their
      // ranked distribution (sellerReach.ts); 'suspended' rows are excluded
      // by the WHERE clause entirely.
      // f_unaccent on the query side matches the folded search_vector and
      // trigram expression indexes from migration 327 — "cafe" must reach
      // the "café" lexeme (R26). ASCII queries fold to themselves.
      orderBy = `ts_rank_cd(l.search_vector, websearch_to_tsquery('simple', f_unaccent($1))) * ${reachRankMultiplierExpr('u')} DESC, l.created_at DESC, l.id DESC`;
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
        ts_rank_cd(l.search_vector, websearch_to_tsquery('simple', f_unaccent($1)))::text AS rank_score,
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
          l.search_vector @@ websearch_to_tsquery('simple', f_unaccent($1))
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(COALESCE(l.brand, '')))) > 0
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(COALESCE(l.category, '')))) > 0
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(COALESCE(l.size, '')))) > 0
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(COALESCE(l.condition, '')))) > 0
        )
        ${reachExcludedSql('u')}
        ${filterClause}
      ORDER BY ${orderBy}
      LIMIT $${filterIdx} OFFSET $${filterIdx + 1}
    `,
    [q, ...filterArgs, limit, offset]
  );

  if (result.rowCount && result.rowCount > 0) {
    const mediaByListing = await loadListingMedia(
      dbPool,
      result.rows.map((row) => row.id),
    );
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
        imageUrl: listingImageUrls(mediaByListing.get(row.id), row.image_url)[0] ?? row.image_url,
        images: listingImageUrls(mediaByListing.get(row.id), row.image_url),
        media: mediaByListing.get(row.id) ?? [],
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

  // Fallback when full-text search returns nothing: literal substring
  // matching plus — for queries of 3+ characters — pg_trgm trigram
  // similarity on title/brand so typos ("nikee" → "Nike") still surface
  // results. Substring clauses stay: they are strictly stronger than
  // trigrams for exact infix hits and cover the columns trigrams don't
  // (description, category, size, condition).
  const useTrgmFallback = q.trim().length >= TRGM_MIN_QUERY_LENGTH;
  const trgmClause = useTrgmFallback
    ? `
          OR f_unaccent(l.title) % f_unaccent($1)
          OR similarity(f_unaccent(l.title), f_unaccent($1)) > ${TRGM_TITLE_THRESHOLD}
          OR f_unaccent(COALESCE(l.brand, '')) % f_unaccent($1)
          OR similarity(f_unaccent(COALESCE(l.brand, '')), f_unaccent($1)) > ${TRGM_BRAND_THRESHOLD}`
    : '';

  // For relevance sort, rank trigram hits by their best title/brand
  // similarity — the ts_rank_cd expression is 0 for every row in this
  // query since none matched the tsvector. Non-relevance sorts keep the
  // caller's ordering unchanged.
  const fallbackOrderBy =
    sort === 'relevance' && useTrgmFallback
      ? `GREATEST(similarity(f_unaccent(l.title), f_unaccent($1)), similarity(f_unaccent(COALESCE(l.brand, '')), f_unaccent($1))) * ${reachRankMultiplierExpr('u')} DESC, l.created_at DESC, l.id DESC`
      : orderBy;

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
          POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(l.title))) > 0
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(l.description))) > 0
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(COALESCE(l.brand, '')))) > 0
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(COALESCE(l.category, '')))) > 0
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(COALESCE(l.size, '')))) > 0
          OR POSITION(f_unaccent(lower($1)) IN f_unaccent(lower(COALESCE(l.condition, '')))) > 0${trgmClause}
        )
        ${reachExcludedSql('u')}
        ${filterClause}
      ORDER BY ${fallbackOrderBy}
      LIMIT $${filterIdx} OFFSET $${filterIdx + 1}
    `,
    [q, ...filterArgs, limit, offset]
  );

  const fallbackMediaByListing = await loadListingMedia(
    dbPool,
    fallback.rows.map((row) => row.id),
  );
  // Honest disclosure: 'fts_no_matches_trgm' only when the trigram
  // similarity clauses were actually part of the fallback query —
  // sub-3-character queries ran substring matching alone.
  const fallbackReason: RetrievalFallbackReason = useTrgmFallback
    ? 'fts_no_matches_trgm'
    : 'fts_no_matches_ilike_fallback';
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
      imageUrl: listingImageUrls(fallbackMediaByListing.get(row.id), row.image_url)[0] ?? row.image_url,
      images: listingImageUrls(fallbackMediaByListing.get(row.id), row.image_url),
      media: fallbackMediaByListing.get(row.id) ?? [],
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
// ── Promoted ("Sponsored") slots ──────────────────────────────────────────
// Flat-fee paid placements (migration 301). Blended at response time —
// AFTER the cache read — so lazy daily-fee settlement runs per request and
// served-impression facts are recorded for every response that actually
// carried the unit (cache-hit responses still serve + record). Organic
// order is untouched; each paid unit is stamped promoted+disclosure.
// Strictly additive: any failure is logged and organic results return
// unchanged.

type SearchListingItem = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  imageUrl: string | null;
  images: string[];
  media: unknown[];
  rank: number;
  createdAt: string;
  brand: string | null;
  size: string | null;
  condition: string | null;
  category: string | null;
  seller: { id: string; username: string; avatar: null; rating: null; reviewCount: null; location: null } | null;
  promoted?: boolean;
  disclosure?: string;
  /** Present on promoted units only — the client posts it to /promotions/:id/click on tap-through. */
  promotionId?: string;
};

function toPromotedSearchItem(
  placement: PromotedListingPlacement,
  media: ListingMediaItem[],
): SearchListingItem {
  const row = placement.listing;
  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    description: row.description ?? '',
    priceGbp: Number(row.price_gbp),
    imageUrl: listingImageUrls(media, row.image_url)[0] ?? row.image_url,
    images: listingImageUrls(media, row.image_url),
    media,
    promoted: true,
    disclosure: PROMOTED_DISCLOSURE,
    promotionId: placement.promotionId,
    rank: 0,
    createdAt: row.created_at,
    brand: row.brand,
    size: row.size,
    condition: row.condition,
    category: row.category,
    seller: null,
  };
}

export const registerSearchExtendedRoutes = ({
  app,
  db,
  readDb,
  redis,
}: SearchExtendedRouteDependencies): void => {

  /**
   * Blends billed promoted placements into a finished organic page.
   * Runs at response time (not inside computeSearchResults) so cached
   * organic pages still settle the daily fee per request and record
   * served-impression facts honestly. Fail-open: promotion errors are
   * logged and the organic page is returned unchanged.
   */
  const applyPromotedSlots = async (
    request: FastifyRequest,
    items: SearchListingItem[],
    q: string,
    filters: {
      category?: string;
      condition?: string;
      size?: string;
      brands?: string[];
      sizes?: string[];
      priceMin?: number;
      priceMax?: number;
      sustainableOnly?: boolean;
    },
  ): Promise<SearchListingItem[]> => {
    try {
      const viewerId = request.authUser?.userId ?? null;
      const organicIds = new Set(items.map((i) => i.id));
      // The full explicit filter set is forwarded so a Sponsored unit can
      // never violate a filter the buyer set (priceMax, condition, …).
      const placements = (await fetchPromotedListingsForQuery(db, {
        query: q,
        filters: {
          category: filters.category ?? null,
          condition: filters.condition ?? null,
          size: filters.size ?? null,
          brands: filters.brands ?? null,
          sizes: filters.sizes ?? null,
          priceMin: filters.priceMin ?? null,
          priceMax: filters.priceMax ?? null,
          sustainableOnly: filters.sustainableOnly ?? null,
        },
        viewerId,
        limit: 4,
      })).filter((p) => !organicIds.has(p.listing.id));

      if (placements.length === 0) return items;

      const mediaByListing = await loadListingMedia(
        readDb,
        placements.map((p) => p.listing.id),
      );
      const promotedItems = placements.map((p) =>
        toPromotedSearchItem(p, mediaByListing.get(p.listing.id) ?? []),
      );
      const blended = blendPromotedIntoResults(items, promotedItems);

      void recordPromotionImpressions(
        db,
        placements.map((p) => ({ promotionId: p.promotionId, listingId: p.listing.id })),
        viewerId,
        'search',
      ).catch((impressionErr) =>
        request.log.warn({ err: impressionErr }, 'promotion impression logging failed'),
      );

      return blended;
    } catch (promotionErr) {
      request.log.warn({ err: promotionErr }, 'promoted slot blending failed for /search/listings');
      return items;
    }
  };

  app.get('/search/listings', async (request) => {
    const { q, limit, category, condition, size, brands, sizes, priceMin, priceMax, sustainableOnly, sort, page } =
      searchListingsQuerySchema.parse(request.query);
    const searchPolicyVersion = 'listing-search-postgres-v3.1';
    const startTime = Date.now();

    // Multi-value filters arrive as CSV strings; normalize to sorted
    // arrays (sorted for stable cache-key hashing).
    const brandList = brands ? brands.split(',').map((b) => b.trim()).filter(Boolean).sort() : undefined;
    const sizeList = sizes ? sizes.split(',').map((s) => s.trim()).filter(Boolean).sort() : undefined;

    // The same filter set the organic query applied — sponsored units are
    // held to it too (see applyPromotedSlots).
    const promotionFilters = {
      category,
      condition,
      size,
      brands: brandList,
      sizes: sizeList,
      priceMin,
      priceMax,
      sustainableOnly,
    };

    // Build cache params from the normalized query
    const cacheParams: SearchQueryParams = {
      q,
      filters: {
        category,
        condition,
        size,
        brands: brandList,
        sizes: sizeList,
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
        readDb, q, limit, category, condition, size, brandList, sizeList, priceMin, priceMax, sort, page,
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
        items: await applyPromotedSlots(request, cached.items as SearchListingItem[], q, promotionFilters),
        fromCache: true,
        responseTimeMs,
      };
    }

    // ── Cache miss: compute results from DB ──
    const computed = await computeSearchResults(
      readDb, q, limit, category, condition, size, brandList, sizeList, priceMin, priceMax, sort, page,
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
      items: await applyPromotedSlots(request, computed.items as SearchListingItem[], q, promotionFilters),
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

  // ── Trending searches endpoint ────────────────────────────────────────────────
  // Real trending queries from the frequency tracker (Redis sorted set
  // populated by trackQueryFrequency on every /search/listings call).
  // Returns only queries that crossed the hot threshold in the current
  // window — an empty list means there is no real trend data, and clients
  // must not fabricate trends in that case.

  app.get('/search/trending', async (request) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(20).default(6),
    });
    const { limit } = querySchema.parse(request.query);
    const { getHotQueryLabels } = await import('../lib/searchCache.js');
    const items = await getHotQueryLabels(redis, limit);
    return { ok: true, items };
  });
};
