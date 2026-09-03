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
      conditions.push(
        `(l.title ILIKE $${args.length + 1} OR l.description ILIKE $${args.length + 1} OR l.brand ILIKE $${args.length + 1})`,
      );
      args.push(`%${payload.query}%`);
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

    // Resolve the primary image URL for each candidate (first listing_images
    // row, falling back to the legacy l.image_url column).
    const candidateIds = candidateRows.map((r) => r.id);
    const imagesResult = candidateIds.length
      ? await readDb.query<{ listing_id: string; image_url: string; sort_order: number }>(
          `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
          [candidateIds],
        )
      : { rows: [] };

    const primaryImageByListing = new Map<string, string>();
    for (const img of imagesResult.rows) {
      if (!primaryImageByListing.has(img.listing_id)) {
        primaryImageByListing.set(img.listing_id, img.image_url);
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

    // Trim to the requested limit.
    const trimmed = scoredRows.slice(0, payload.limit);
    const trimmedIds = trimmed.map((r) => r.id);

    const imagesResult2 = trimmedIds.length
      ? await readDb.query<{ listing_id: string; image_url: string; sort_order: number }>(
          `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
          [trimmedIds],
        )
      : { rows: [] };

    const imagesByListing = new Map<string, string[]>();
    for (const img of imagesResult2.rows) {
      const arr = imagesByListing.get(img.listing_id) ?? [];
      arr.push(img.image_url);
      imagesByListing.set(img.listing_id, arr);
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

    logger.info(
      {
        method: similarityMethod,
        visualMatching,
        candidateCount: candidateRows.length,
        resultCount: trimmed.length,
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
      items: trimmed.map((row) => ({
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
