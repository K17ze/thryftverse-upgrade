import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import crypto from 'node:crypto';
import {
  extractImageFeatures,
  extractRemoteImageFeatures,
  computeSimilarity,
  mapWithConcurrency,
  type ImageFeatures,
} from '../lib/visualSimilarity.js';
import { safeFetchMediaBuffer } from '../lib/safeRemoteMediaFetch.js';
import { loadListingMedia } from '../lib/media/listingMediaProjection.js';
import type { RetrievalMeta, RetrievalFallbackReason } from '../lib/retrievalMeta.js';
import logger from '../lib/logger.js';

type VisualSearchRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
};

const visualSearchBodySchema = z.object({
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  query: z.string().trim().max(120).optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  condition: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  /**
   * F08: Retrieval-scoped facet selections. Unlike a post-filter, facets are
   * applied inside the candidate SQL query so the candidate set itself
   * reflects the selection — matching rows beyond the recency-bounded
   * superset can surface, and an honest "no results" is returned when a
   * facet genuinely has no matches.
   *
   * Facet matching is honest text matching: a value matches when it appears
   * (case-insensitive, substring) in the listing title, description, brand,
   * or category. There is no dedicated colour/style column on `listings`,
   * and no image analysis is performed for facets.
   */
  facets: z
    .object({
      color: z.string().trim().min(1).max(60).optional(),
      style: z.string().trim().min(1).max(60).optional(),
    })
    .optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'similarity']).optional().default('similarity'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(48),
});

/** Maximum base64 payload size (5 MB after encoding overhead). */
const MAX_BASE64_BYTES = 5 * 1024 * 1024;
/** How many candidate listings to score before ranking. */
const CANDIDATE_CAP = 60;
/** Concurrent image downloads during scoring — reduced from 8 to bound egress. */
const SCORING_CONCURRENCY = 4;

/**
 * F08: Canonical facet vocabularies for visual search. These mirror the
 * `COLOR_FACETS` / `STYLE_FACETS` lists in
 * `frontend/src/screens/VisualSearchScreen.tsx` — they are a request/response
 * contract, kept in sync deliberately so the response can report how many
 * candidates matched each facet value within the current filter scope.
 *
 * Facet values are matched as case-insensitive substrings against the
 * listing's title, description, brand and category (`FACET_SEARCHABLE_EXPR`).
 * This is honest text matching — the listings table has no colour/style
 * column and no image-derived facet data exists.
 */
const COLOR_FACET_VALUES = [
  'Black', 'White', 'Blue', 'Red', 'Green', 'Brown', 'Grey', 'Pink', 'Beige', 'Navy',
] as const;
const STYLE_FACET_VALUES = [
  'Vintage', 'Minimal', 'Streetwear', 'Y2K', 'Formal', 'Casual', 'Sportswear', 'Luxury',
] as const;

/**
 * The searchable text expression a facet value is matched against.
 * `concat_ws` skips NULL columns so a missing brand/category never produces
 * a NULL match result.
 */
const FACET_SEARCHABLE_EXPR = `concat_ws(' ', l.title, l.description, l.brand, l.category)`;

export interface VisualSearchFacetBucket {
  value: string;
  count: number;
}

export interface VisualSearchFacetMetadata {
  colors: VisualSearchFacetBucket[];
  styles: VisualSearchFacetBucket[];
}

/**
 * Count how many active listings match each facet value within a filter
 * scope. `scopeConditions`/`scopeArgs` must already be parameterised with
 * placeholders `$1..$n`; the per-value ILIKE patterns are appended starting
 * at `$n+1`. A single aggregate query with conditional `FILTER` counts
 * keeps this to one round-trip per facet dimension.
 */
async function countFacetValues(
  readDb: Pool,
  values: readonly string[],
  scopeConditions: string[],
  scopeArgs: unknown[],
): Promise<Record<string, number>> {
  if (values.length === 0) return {};
  const selectFragments = values.map(
    (_v, i) =>
      `COUNT(*) FILTER (WHERE ${FACET_SEARCHABLE_EXPR} ILIKE $${scopeArgs.length + i + 1})::int AS "f${i}"`,
  );
  const res = await readDb.query<Record<string, number | string>>(
    `
      SELECT ${selectFragments.join(', ')}
      FROM listings l
      WHERE ${scopeConditions.join(' AND ')}
    `,
    [...scopeArgs, ...values.map((v) => `%${v}%`)],
  );
  const row = res.rows[0] ?? {};
  const counts: Record<string, number> = {};
  values.forEach((v, i) => {
    counts[v] = Number(row[`f${i}`] ?? 0);
  });
  return counts;
}

/**
 * In-flight concurrency guard for visual search.
 *
 * Visual search is resource-intensive (image download + decode + per-candidate
 * scoring), so in addition to the per-route rate limit (10 req/min via
 * `@fastify/rate-limit`) we cap concurrent executions per user/IP. This is a
 * simple in-memory counter — sufficient for a single-process deployment and
 * intentionally not over-engineered. The counter is decremented in a
 * `finally` block so crashed handlers never leak slots.
 */
const VISUAL_SEARCH_MAX_CONCURRENT = 3;
const visualSearchInFlight = new Map<string, number>();

function resolveConcurrencyKey(request: FastifyRequest): string {
  // Prefer the authenticated user id when available so a logged-in user's
  // limit is stable across IP changes; fall back to the client IP otherwise.
  const userId = (request as FastifyRequest & { authUser?: { userId?: string } }).authUser?.userId;
  return userId ? `user:${userId}` : `ip:${request.ip}`;
}

function tryAcquireVisualSearchSlot(key: string): boolean {
  const current = visualSearchInFlight.get(key) ?? 0;
  if (current >= VISUAL_SEARCH_MAX_CONCURRENT) return false;
  visualSearchInFlight.set(key, current + 1);
  return true;
}

function releaseVisualSearchSlot(key: string): void {
  const current = visualSearchInFlight.get(key);
  if (current === undefined) return;
  if (current <= 1) {
    visualSearchInFlight.delete(key);
  } else {
    visualSearchInFlight.set(key, current - 1);
  }
}

/**
 * Decode the query image from the request payload into a Buffer.
 * Accepts raw base64 (with or without a data-URI prefix) or a remote URL.
 * Returns null when no image was supplied or validation fails.
 *
 * Security: remote URLs are fetched via `safeFetchMediaBuffer` which enforces
 * HTTPS, DNS/IP validation (SSRF prevention), redirect controls, byte caps,
 * and content-type/magic-bytes validation. Base64 payloads are capped at
 * MAX_BASE64_BYTES to prevent memory exhaustion.
 */
async function decodeQueryImage(
  payload: z.infer<typeof visualSearchBodySchema>,
): Promise<Buffer | null> {
  if (payload.imageBase64 && payload.imageBase64.trim().length > 0) {
    if (payload.imageBase64.length > MAX_BASE64_BYTES) {
      return null;
    }
    const stripped = payload.imageBase64.replace(/^data:[^;]+;base64,/, '');
    try {
      return Buffer.from(stripped, 'base64');
    } catch {
      return null;
    }
  }
  if (payload.imageUrl && payload.imageUrl.trim().length > 0) {
    const result = await safeFetchMediaBuffer(payload.imageUrl, {
      maxBytes: MAX_BASE64_BYTES,
    });
    return result?.buffer ?? null;
  }
  return null;
}

/**
 * Register the visual-search route on the Fastify instance:
 *   POST /visual-search — image-based product search
 *
 * Visual Search — honest heuristic implementation.
 *
 * When an image is supplied, the backend extracts a real colour-and-layout
 * feature vector from it (via sharp) and scores candidate listings by visual
 * similarity against their primary image. Results are ranked by similarity
 * and labelled with `similarityMethod: 'heuristic_color_features'` so the
 * frontend can describe the method truthfully. This is NOT an AI/ML model —
 * it is a deterministic colour-and-layout heuristic.
 *
 * When no image is supplied (or it cannot be decoded), the route falls back
 * to a filtered SQL query and labels results `similarityMethod: 'filter_only'`
 * with `visualMatching: false`.
 */
export const registerVisualSearchRoutes = ({ app, db, readDb }: VisualSearchRouteDependencies): void => {
  app.post(
    '/visual-search',
    {
      // Visual search is substantially more expensive than regular search
      // (remote image download + decode + per-candidate feature scoring), so
      // it gets a stricter per-route rate limit than the global default.
      // See `@fastify/rate-limit` registration in index.ts for the baseline.
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // ── Concurrency guard (3 in-flight per user/IP) ───────────────────
      // Acquired before any heavy work and released in `finally` so a
      // crashed handler never leaks a slot.
      const concurrencyKey = resolveConcurrencyKey(request);
      if (!tryAcquireVisualSearchSlot(concurrencyKey)) {
        reply.code(429);
        return {
          ok: false,
          error: 'Too many concurrent visual search requests',
          retryAfterSeconds: 5,
        };
      }

      try {
        return await handleVisualSearch(request, reply, { db, readDb });
      } finally {
        releaseVisualSearchSlot(concurrencyKey);
      }
    },
  );
};

/**
 * Inner handler for POST /visual-search, extracted so the route wrapper can
 * enforce the concurrency guard around it via try/finally.
 */
async function handleVisualSearch(
  request: FastifyRequest,
  reply: FastifyReply,
  { db, readDb }: Omit<VisualSearchRouteDependencies, 'app'>,
) {
    const requestStartTime = Date.now();
    const payload = visualSearchBodySchema.parse(request.body ?? {});

    // Telemetry: record the request without storing the raw image URL.
    // A SHA-256 hash of the URL is stored instead so analytics can deduplicate
    // repeated queries without retaining a potentially sensitive URL that
    // could point to a user's personal photo. The expires_at column gives
    // the row a bounded lifetime for privacy compliance.
    if (payload.imageUrl) {
      try {
        const urlHash = crypto.createHash('sha256').update(payload.imageUrl).digest('hex');
        await db.query(
          `INSERT INTO visual_search_requests (id, image_url, created_at, expires_at)
           VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 days')
           ON CONFLICT DO NOTHING`,
          [`vs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, urlHash]
        );
      } catch {
        // Telemetry is best-effort; never fail the request on it.
      }
    }

    // ── Build the filtered candidate set ────────────────────────────────
    // Base (non-facet) conditions are tracked separately so facet counts can
    // be scoped correctly: the count for each facet dimension is computed
    // under every other active filter EXCEPT that dimension itself — the
    // standard faceted-search convention that lets users see how many items
    // would match a different value in the same dimension.
    const baseConditions: string[] = ["l.status = 'active'"];
    const baseArgs: unknown[] = [];

    if (payload.category) {
      baseConditions.push(`l.category = $${baseArgs.length + 1}`);
      baseArgs.push(payload.category);
    }
    if (payload.brand) {
      baseConditions.push(`l.brand ILIKE $${baseArgs.length + 1}`);
      baseArgs.push(`%${payload.brand}%`);
    }
    if (payload.size) {
      baseConditions.push(`l.size ILIKE $${baseArgs.length + 1}`);
      baseArgs.push(`%${payload.size}%`);
    }
    if (payload.condition) {
      baseConditions.push(`l.condition ILIKE $${baseArgs.length + 1}`);
      baseArgs.push(`%${payload.condition}%`);
    }
    if (payload.minPrice !== undefined) {
      baseConditions.push(`l.price_gbp >= $${baseArgs.length + 1}`);
      baseArgs.push(payload.minPrice);
    }
    if (payload.maxPrice !== undefined) {
      baseConditions.push(`l.price_gbp <= $${baseArgs.length + 1}`);
      baseArgs.push(payload.maxPrice);
    }
    if (payload.query) {
      baseConditions.push(
        `(l.title ILIKE $${baseArgs.length + 1} OR l.description ILIKE $${baseArgs.length + 1} OR l.brand ILIKE $${baseArgs.length + 1})`,
      );
      baseArgs.push(`%${payload.query}%`);
    }

    // F08: Facet selections are retrieval parameters, not post-filters.
    // They join the candidate WHERE clause so the SQL candidate set itself
    // is narrowed before the candidate cap and similarity ranking run.
    const colorFacet = payload.facets?.color?.trim() || undefined;
    const styleFacet = payload.facets?.style?.trim() || undefined;

    const conditions = [...baseConditions];
    const args = [...baseArgs];
    if (colorFacet) {
      conditions.push(`${FACET_SEARCHABLE_EXPR} ILIKE $${args.length + 1}`);
      args.push(`%${colorFacet}%`);
    }
    if (styleFacet) {
      conditions.push(`${FACET_SEARCHABLE_EXPR} ILIKE $${args.length + 1}`);
      args.push(`%${styleFacet}%`);
    }

    // Candidate cap: fetch a bounded superset so similarity ranking has room
    // to reorder before trimming to the requested limit.
    const candidateCap = Math.min(CANDIDATE_CAP, Math.max(payload.limit * 3, 60));

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
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $${args.length + 1}
      `,
      [...args, candidateCap],
    );

    const candidateRows = result.rows;

    // F08: Facet metadata — kicked off after the candidate fetch so the
    // aggregate queries overlap the expensive image decode/scoring below.
    // - colour counts are scoped under every filter except the colour facet
    // - style counts are scoped under every filter except the style facet
    // - matchCount is the total under the full scope (all facets applied)
    const colorScopeConditions = [...baseConditions];
    const colorScopeArgs = [...baseArgs];
    if (styleFacet) {
      colorScopeConditions.push(`${FACET_SEARCHABLE_EXPR} ILIKE $${colorScopeArgs.length + 1}`);
      colorScopeArgs.push(`%${styleFacet}%`);
    }
    const styleScopeConditions = [...baseConditions];
    const styleScopeArgs = [...baseArgs];
    if (colorFacet) {
      styleScopeConditions.push(`${FACET_SEARCHABLE_EXPR} ILIKE $${styleScopeArgs.length + 1}`);
      styleScopeArgs.push(`%${colorFacet}%`);
    }

    const facetMetaPromise = (async (): Promise<{
      facets: VisualSearchFacetMetadata;
      matchCount: number;
    } | null> => {
      try {
        const [colorCounts, styleCounts, matchRes] = await Promise.all([
          countFacetValues(readDb, COLOR_FACET_VALUES, colorScopeConditions, colorScopeArgs),
          countFacetValues(readDb, STYLE_FACET_VALUES, styleScopeConditions, styleScopeArgs),
          readDb.query<{ total: number | string }>(
            `SELECT COUNT(*)::int AS total FROM listings l WHERE ${conditions.join(' AND ')}`,
            args,
          ),
        ]);
        return {
          facets: {
            colors: COLOR_FACET_VALUES.map((v) => ({ value: v, count: colorCounts[v] ?? 0 })),
            styles: STYLE_FACET_VALUES.map((v) => ({ value: v, count: styleCounts[v] ?? 0 })),
          },
          matchCount: Number(matchRes.rows[0]?.total ?? 0),
        };
      } catch (err) {
        // Facet metadata is additive — a counting failure must never fail
        // the search itself. The response simply omits `facets`.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'visual_search.facet_count_failed',
        );
        return null;
      }
    })();

    // Resolve the primary image URL for each candidate (first listing_images
    // row, falling back to the legacy l.image_url column). The projected
    // media items are also reused below to serve `images`/`media` on the
    // response rows — a single media lookup covers both uses.
    const candidateIds = candidateRows.map((r) => r.id);
    const candidateMediaByListing = await loadListingMedia(readDb, candidateIds);

    const primaryImageByListing = new Map<string, string>();
    for (const [listingRowId, mediaItems] of candidateMediaByListing) {
      const primary = mediaItems[0];
      if (primary) {
        primaryImageByListing.set(listingRowId, primary.uri);
      }
    }
    for (const row of candidateRows) {
      if (!primaryImageByListing.has(row.id) && row.image_url) {
        primaryImageByListing.set(row.id, row.image_url);
      }
    }

    // ── Attempt real visual similarity scoring ───────────────────────────
    const queryBuffer = await decodeQueryImage(payload);
    let queryFeatures: ImageFeatures | null = null;
    if (queryBuffer) {
      try {
        queryFeatures = await extractImageFeatures(queryBuffer);
      } catch {
        queryFeatures = null;
      }
    }

    const hasImageScoring = queryFeatures !== null;

    const imageSuppliedEarly = Boolean(payload.imageBase64?.trim() || payload.imageUrl?.trim());
    if (!hasImageScoring && imageSuppliedEarly) {
      logger.warn(
        {
          reason: 'image_decode_failed',
          hasBase64: Boolean(payload.imageBase64),
          hasImageUrl: Boolean(payload.imageUrl),
        },
        'visual_search.image_decode_failed',
      );
    }

    type ScoredRow = (typeof candidateRows)[number] & {
      similarityScore: number | null;
    };

    let scoredRows: ScoredRow[];

    if (hasImageScoring && queryFeatures) {
      const features = queryFeatures;
      // Only score candidates that have a usable primary image.
      const scoreableIndices: number[] = [];
      for (let i = 0; i < candidateRows.length; i++) {
        const url = primaryImageByListing.get(candidateRows[i].id);
        if (url) scoreableIndices.push(i);
      }

      const candidateFeatures = await mapWithConcurrency(
        scoreableIndices,
        SCORING_CONCURRENCY,
        async (idx) => {
          const url = primaryImageByListing.get(candidateRows[idx].id)!;
          return { idx, features: await extractRemoteImageFeatures(url) };
        },
      );

      scoredRows = candidateRows.map((row) => ({ ...row, similarityScore: null as number | null }));
      for (const entry of candidateFeatures) {
        if (entry.features) {
          scoredRows[entry.idx].similarityScore = computeSimilarity(features, entry.features);
        }
      }

      // Rank: scored candidates first (by similarity desc), unscored after.
      scoredRows.sort((a, b) => {
        const aScore = a.similarityScore ?? -1;
        const bScore = b.similarityScore ?? -1;
        if (bScore !== aScore) return bScore - aScore;
        // Tie-break by recency.
        return b.created_at.localeCompare(a.created_at);
      });
    } else {
      // No usable query image — fall back to filter-only ordering.
      const orderBy =
        payload.sort === 'price_asc'
          ? 'price_gbp ASC, id ASC'
          : payload.sort === 'price_desc'
            ? 'price_gbp DESC, id DESC'
            : 'created_at DESC, id DESC';
      // Re-query with the requested sort when no image scoring is possible.
      const fallback = await readDb.query<
        (typeof candidateRows)[number]
      >(
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
        [...args, payload.limit],
      );
      scoredRows = fallback.rows.map((row) => ({ ...row, similarityScore: null }));
    }

    // Trim to the requested limit. Media rows were already loaded for the
    // full candidate set above — reuse that map instead of re-querying.
    const trimmed = scoredRows.slice(0, payload.limit);

    const imagesByListing = new Map<string, string[]>();
    for (const [listingRowId, mediaItems] of candidateMediaByListing) {
      imagesByListing.set(listingRowId, mediaItems.map((m) => m.uri));
    }

    const similarityMethod = hasImageScoring ? 'heuristic_color_features' : 'filter_only';
    const visualMatching = hasImageScoring;

    // Honest retrieval metadata. Visual search never uses a vector embedder;
    // the method is either the deterministic colour-and-layout heuristic or
    // a filter-only fallback. The fallbackReason discloses why image
    // scoring did not run so clients never imply visual matching happened.
    const imageSupplied = Boolean(payload.imageBase64?.trim() || payload.imageUrl?.trim());
    const visualFallbackReason: RetrievalFallbackReason | undefined = hasImageScoring
      ? undefined
      : imageSupplied
        ? 'image_decode_failed'
        : 'no_image_supplied';
    const retrievalMeta: RetrievalMeta = {
      method: similarityMethod,
      fallbackReason: visualFallbackReason,
      embedderConfigured: false,
    };

    // F08: Await the facet-count aggregates kicked off alongside the
    // candidate fetch. `facets`/`matchCount` are omitted only if counting
    // failed — the search result itself is never blocked on them.
    const facetMeta = await facetMetaPromise;

    logger.info(
      {
        method: similarityMethod,
        visualMatching,
        candidateCount: candidateRows.length,
        resultCount: trimmed.length,
        matchCount: facetMeta?.matchCount ?? null,
        colorFacet: colorFacet ?? null,
        styleFacet: styleFacet ?? null,
        hasImage: imageSupplied,
        fallbackReason: visualFallbackReason ?? null,
        latencyMs: Date.now() - requestStartTime,
        // Never log the raw image URL or base64 — only the hash if present
        imageUrlHash: payload.imageUrl
          ? crypto.createHash('sha256').update(payload.imageUrl).digest('hex').slice(0, 12)
          : null,
      },
      'visual_search.request_completed',
    );

    reply.code(200);
    return {
      ok: true,
      runtimeAvailable: true,
      // Truthful flag: true only when real visual feature scoring ran.
      visualMatching,
      similarityMethod,
      retrievalMeta,
      note: hasImageScoring
        ? 'Results ranked by colour & layout similarity (heuristic, not AI).'
        : 'No usable image supplied — results are matched by category, brand, and description.',
      // F08: Facet metadata. `facets` reports how many candidates matched
      // each facet value within the opposite-facet scope; `matchCount` is
      // the total number of listings matching the full filter scope before
      // the candidate cap / limit trim — so the UI can report honest counts.
      ...(facetMeta
        ? { facets: facetMeta.facets, matchCount: facetMeta.matchCount }
        : {}),
      items: trimmed.map((row) => ({
        id: row.id,
        sellerId: row.seller_id,
        title: row.title,
        description: row.description,
        priceGbp: Number(row.price_gbp),
        imageUrl: row.image_url,
        images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
        media: candidateMediaByListing.get(row.id) ?? [],
        status: row.status,
        category: row.category,
        brand: row.brand,
        size: row.size,
        condition: row.condition,
        originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
        createdAt: row.created_at,
        similarityScore: row.similarityScore,
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
