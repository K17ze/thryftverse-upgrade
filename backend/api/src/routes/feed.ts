import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type FeedRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
};

// ──────────────────────────────────────────────────────────────────────────
// Heterogeneous discovery contract (§4.6)
//
// A single decision owner for the discovery surface. Unlike /feed/home which
// merges listings/posters/looks chronologically with no composition owner,
// /feed/discover ranks mixed content types through a deterministic,
// inspectable composition pass. The contract is type-discriminated so the
// client can size cells before media loads and render type-specific UIs.
// ──────────────────────────────────────────────────────────────────────────

/** Type-specific summary payloads the client needs to render a unit. */
export type ListingSummary = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  imageUrl: string | null;
  images: string[];
  status: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  originalPriceGbp: number | null;
  createdAt: string;
};

export type LookSummary = {
  id: string;
  creatorId: string;
  title: string;
  mediaUrl: string;
  createdAt: string;
};

export type PosterSummary = {
  id: string;
  creatorId: string;
  mediaUrl: string;
  caption: string;
  createdAt: string;
};

export type MoodboardSummary = {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  coverImageUrl: string;
  theme: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveryUnitType = 'listing' | 'look' | 'poster' | 'moodboard';

export type DiscoveryUnit = {
  type: DiscoveryUnitType;
  id: string;
  rank: number;
  /** Intrinsic width / height — lets the client reserve cell space before media loads. */
  mediaAspectRatio: number;
  decision: {
    /** Which candidate source produced this unit. */
    source: string;
    /** Composition score in [0, 1] — deterministic, not an ML confidence. */
    score: number;
    /** Inspectable reason codes explaining why the unit placed where it did. */
    reasonCodes: string[];
  };
  data: ListingSummary | LookSummary | PosterSummary | MoodboardSummary;
};

export type DiscoverResponse = {
  items: DiscoveryUnit[];
  nextCursor: string | null;
};

const followingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const homeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const trendingQuerySchema = z.object({
  window: z.enum(['24h', '7d', '30d']).default('24h'),
  category: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const discoverQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(20),
  cursor: z.string().optional(),
});

/**
 * Register feed routes on the Fastify instance:
 *   GET /feed/looks      — published looks feed (public)
 *   GET /feed/home       — mixed listings/posters/looks home feed (public)
 *   GET /feed/trending   — trending listings by engagement velocity (public)
 *   GET /feed/following  — social activity feed from followed users (auth)
 *   GET /feed/discover   — heterogeneous discovery feed with constrained composition (public)
 */
export const registerFeedRoutes = ({ app, db, readDb }: FeedRouteDependencies): void => {
  app.get('/feed/looks', async (request, reply) => {
    try {
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
    } catch (err) {
      request.log.error({ err }, 'GET /feed/looks failed');
      reply.code(500);
      return { ok: false, error: 'Failed to fetch looks feed' };
    }
  });

  app.get('/feed/home', async (request, reply) => {
    try {
    const { limit, cursor } = homeQuerySchema.parse(request.query ?? {});

    const viewerUserId = request.authUser?.userId ?? null;
    const cursorCondition = cursor ? `AND created_at < $1` : '';
    const cursorParams = cursor ? [cursor, limit] : [limit];
    const limitSlot = `$${cursorParams.length}`;

    let blockedSellerIds: Set<string> | null = null;
    if (viewerUserId) {
      const blockedResult = await readDb.query<{ blocked_id: string }>(
        `SELECT blocked_id FROM user_blocks WHERE blocker_id = $1`,
        [viewerUserId]
      );
      blockedSellerIds = new Set(blockedResult.rows.map((r) => r.blocked_id));
    }

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
          ${cursorCondition}
        ORDER BY created_at DESC
        LIMIT ${limitSlot}
      `,
      cursorParams
    );

    if (blockedSellerIds && blockedSellerIds.size > 0) {
      listingsResult.rows = listingsResult.rows.filter(
        (row) => !blockedSellerIds!.has(row.seller_id)
      );
    }

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
          ${cursorCondition}
        ORDER BY created_at DESC
        LIMIT ${limitSlot}
      `,
      cursorParams
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
          ${cursorCondition}
        ORDER BY created_at DESC
        LIMIT ${limitSlot}
      `,
      cursorParams
    );

    type HomeFeedItemType = 'listing' | 'poster' | 'look';
    type RankedHomeFeedEntry = {
      type: HomeFeedItemType;
      createdAt: string;
      data: Record<string, unknown>;
    };

    const entries: RankedHomeFeedEntry[] = [
      ...listingsResult.rows.map((row) => ({
        type: 'listing' as const,
        createdAt: row.created_at,
        data: {
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
        },
      })),
      ...postersResult.rows.map((row) => ({
        type: 'poster' as const,
        createdAt: row.created_at,
        data: {
          id: row.id,
          creatorId: row.creator_id,
          mediaUrl: row.media_url,
          caption: row.caption,
          createdAt: row.created_at,
        },
      })),
      ...looksResult.rows.map((row) => ({
        type: 'look' as const,
        createdAt: row.created_at,
        data: {
          id: row.id,
          creatorId: row.creator_id,
          title: row.title,
          mediaUrl: row.media_url,
          createdAt: row.created_at,
        },
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const sliced = entries.slice(0, limit);
    const nextCursor = entries.length > limit
      ? sliced[sliced.length - 1]?.createdAt ?? null
      : null;

    const items = sliced.map((entry, idx) => ({
      id: `${entry.type}:${entry.data.id}`,
      type: entry.type,
      rank: idx + 1,
      data: entry.data,
    }));

    return { items, nextCursor };
    } catch (err) {
      request.log.error({ err }, 'GET /feed/home failed');
      reply.code(500);
      return { ok: false, error: 'Failed to fetch home feed' };
    }
  });

  // GET /feed/trending — trending listings based on engagement velocity.
  // Public endpoint. Supports window (24h/7d/30d), category filter, and limit.
  app.get('/feed/trending', async (request) => {
    const { window: timeWindow, category, limit } = trendingQuerySchema.parse(request.query);

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

  // GET /feed/following — social activity feed from followed users.
  // Auth required. Returns recent listings and looks from followed sellers.
  app.get('/feed/following', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const { limit, cursor } = followingQuerySchema.parse(request.query);

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

  // ────────────────────────────────────────────────────────────────────────
  // GET /feed/discover — heterogeneous discovery feed with constrained
  // composition (§4.6).
  //
  // This is the single decision owner for the discovery surface. It retrieves
  // candidates from four content types (listings, looks, posters, moodboards),
  // scores them on a deterministic freshness+quality curve, then applies
  // inspectable composition constraints:
  //   • Max 3 consecutive same-type units
  //   • Max 30% same-seller listings within a page
  //   • Freshness floor: at least 1 item from the last 24h in the first 10
  //
  // The cursor encodes (createdAt, type, id) so pagination is stable across
  // heterogeneous types. Public endpoint — no auth required.
  // ────────────────────────────────────────────────────────────────────────
  app.get('/feed/discover', async (request) => {
    const { limit, cursor } = discoverQuerySchema.parse(request.query ?? {});

    // Decode cursor: base64-encoded "createdAt|type|id"
    let cursorCreatedAt: string | null = null;
    let cursorType: string | null = null;
    let cursorId: string | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const parts = decoded.split('|');
        if (parts.length === 3) {
          [cursorCreatedAt, cursorType, cursorId] = parts;
        }
      } catch {
        // Invalid cursor — treat as first page
      }
    }

    // Overfetch factor: we need headroom for composition constraints to work.
    const overfetch = Math.max(limit * 3, 60);

    // ── Candidate retrieval ──────────────────────────────────────────────
    // Each source is queried independently with its own cursor condition so
    // we can paginate across types without skewing one source over another.

    const listingCursorCondition = cursorCreatedAt ? `AND l.created_at < $1` : '';
    const listingParams: Array<string | number> = cursorCreatedAt
      ? [cursorCreatedAt, overfetch]
      : [overfetch];
    const listingLimitSlot = `$${listingParams.length}`;

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
        SELECT l.id, l.seller_id, l.title, l.description, l.price_gbp,
               l.image_url, l.status, l.category, l.brand, l.size,
               l.condition, l.original_price_gbp, l.created_at
        FROM listings l
        WHERE l.status = 'active'
          ${listingCursorCondition}
        ORDER BY l.created_at DESC
        LIMIT ${listingLimitSlot}
      `,
      listingParams
    );

    // Fetch listing images (for aspect ratio + image array)
    const listingIds = listingsResult.rows.map((r) => r.id);
    const listingImagesResult = listingIds.length
      ? await readDb.query<{
          listing_id: string;
          image_url: string;
          sort_order: number;
          media_width: number | null;
          media_height: number | null;
        }>(
          `SELECT listing_id, image_url, sort_order, media_width, media_height
           FROM listing_images
           WHERE listing_id = ANY($1)
           ORDER BY sort_order`,
          [listingIds]
        )
      : { rows: [] };

    const imagesByListing = new Map<
      string,
      { urls: string[]; firstWidth: number | null; firstHeight: number | null }
    >();
    for (const img of listingImagesResult.rows) {
      const entry = imagesByListing.get(img.listing_id) ?? {
        urls: [] as string[],
        firstWidth: null as number | null,
        firstHeight: null as number | null,
      };
      if (entry.urls.length === 0) {
        entry.firstWidth = img.media_width;
        entry.firstHeight = img.media_height;
      }
      entry.urls.push(img.image_url);
      imagesByListing.set(img.listing_id, entry);
    }

    const genericCursorCondition = cursorCreatedAt ? `AND created_at < $1` : '';

    const looksParams: Array<string | number> = cursorCreatedAt
      ? [cursorCreatedAt, overfetch]
      : [overfetch];
    const looksLimitSlot = `$${looksParams.length}`;

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
          ${genericCursorCondition}
        ORDER BY created_at DESC
        LIMIT ${looksLimitSlot}
      `,
      looksParams
    );

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
          ${genericCursorCondition}
        ORDER BY created_at DESC
        LIMIT ${looksLimitSlot}
      `,
      looksParams
    );

    const moodboardsResult = await readDb.query<{
      id: string;
      creator_id: string;
      title: string;
      description: string;
      cover_image_url: string;
      theme: string;
      created_at: string;
      updated_at: string;
      item_count: string;
    }>(
      `
        SELECT m.id, m.creator_id, m.title, m.description,
               m.cover_image_url, m.theme, m.created_at, m.updated_at,
               COALESCE(mi_count.c, 0)::text AS item_count
        FROM moodboards m
        LEFT JOIN (
          SELECT moodboard_id, COUNT(*) AS c
          FROM moodboard_items
          GROUP BY moodboard_id
        ) mi_count ON mi_count.moodboard_id = m.id
        WHERE m.visibility = 'public'
          ${genericCursorCondition.replace('created_at', 'm.created_at')}
        ORDER BY m.created_at DESC
        LIMIT ${looksLimitSlot}
      `,
      looksParams
    );

    // ── Build candidate pool ─────────────────────────────────────────────
    type Candidate = {
      type: DiscoveryUnitType;
      id: string;
      createdAt: string;
      sellerId: string | null;
      mediaAspectRatio: number;
      score: number;
      reasonCodes: string[];
      data: ListingSummary | LookSummary | PosterSummary | MoodboardSummary;
    };

    const now = Date.now();
    const candidates: Candidate[] = [];

    for (const row of listingsResult.rows) {
      const imgEntry = imagesByListing.get(row.id);
      const images = imgEntry?.urls ?? (row.image_url ? [row.image_url] : []);
      const aspectRatio =
        imgEntry?.firstWidth && imgEntry?.firstHeight
          ? imgEntry.firstWidth / imgEntry.firstHeight
          : 1.0;

      const ageHours = Math.max(
        0,
        (now - new Date(row.created_at).getTime()) / (60 * 60 * 1000)
      );
      const freshness = Math.exp(-ageHours / 168); // 1-week half-life
      const hasImages = images.length > 0 ? 0.15 : 0;
      const hasBrand = row.brand ? 0.05 : 0;
      const hasCategory = row.category ? 0.05 : 0;
      const score = Math.min(1, 0.6 * freshness + hasImages + hasBrand + hasCategory);

      candidates.push({
        type: 'listing',
        id: row.id,
        createdAt: row.created_at,
        sellerId: row.seller_id,
        mediaAspectRatio: aspectRatio,
        score,
        reasonCodes: ['recent_listing', freshness > 0.5 ? 'fresh' : 'evergreen'],
        data: {
          id: row.id,
          sellerId: row.seller_id,
          title: row.title,
          description: row.description,
          priceGbp: Number(row.price_gbp),
          imageUrl: row.image_url,
          images,
          status: row.status,
          category: row.category,
          brand: row.brand,
          size: row.size,
          condition: row.condition,
          originalPriceGbp:
            row.original_price_gbp === null ? null : Number(row.original_price_gbp),
          createdAt: row.created_at,
        },
      });
    }

    for (const row of looksResult.rows) {
      const ageHours = Math.max(
        0,
        (now - new Date(row.created_at).getTime()) / (60 * 60 * 1000)
      );
      const freshness = Math.exp(-ageHours / 168);
      const score = Math.min(1, 0.7 * freshness + 0.1);

      candidates.push({
        type: 'look',
        id: row.id,
        createdAt: row.created_at,
        sellerId: row.creator_id,
        mediaAspectRatio: 1.0,
        score,
        reasonCodes: ['published_look', freshness > 0.5 ? 'fresh' : 'evergreen'],
        data: {
          id: row.id,
          creatorId: row.creator_id,
          title: row.title,
          mediaUrl: row.media_url,
          createdAt: row.created_at,
        },
      });
    }

    for (const row of postersResult.rows) {
      const ageHours = Math.max(
        0,
        (now - new Date(row.created_at).getTime()) / (60 * 60 * 1000)
      );
      const freshness = Math.exp(-ageHours / 48); // posters decay faster (2-day half-life)
      const score = Math.min(1, 0.7 * freshness + 0.1);

      candidates.push({
        type: 'poster',
        id: row.id,
        createdAt: row.created_at,
        sellerId: row.creator_id,
        mediaAspectRatio: 1.0,
        score,
        reasonCodes: ['published_poster', freshness > 0.5 ? 'fresh' : 'decaying'],
        data: {
          id: row.id,
          creatorId: row.creator_id,
          mediaUrl: row.media_url,
          caption: row.caption,
          createdAt: row.created_at,
        },
      });
    }

    for (const row of moodboardsResult.rows) {
      const ageHours = Math.max(
        0,
        (now - new Date(row.created_at).getTime()) / (60 * 60 * 1000)
      );
      const freshness = Math.exp(-ageHours / 336); // moodboards decay slower (2-week half-life)
      const itemCount = Number(row.item_count);
      const richness = Math.min(0.2, itemCount * 0.04);
      const score = Math.min(1, 0.5 * freshness + richness + 0.1);

      candidates.push({
        type: 'moodboard',
        id: row.id,
        createdAt: row.created_at,
        sellerId: row.creator_id,
        mediaAspectRatio: 1.0,
        score,
        reasonCodes: ['public_moodboard', itemCount > 3 ? 'curated' : 'minimal'],
        data: {
          id: row.id,
          creatorId: row.creator_id,
          title: row.title,
          description: row.description,
          coverImageUrl: row.cover_image_url,
          theme: row.theme,
          itemCount,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    }

    // ── Constrained composition ──────────────────────────────────────────
    // Sort by score descending, then by createdAt descending as a tiebreaker.
    // We then greedily pick from this ranked list while enforcing constraints.
    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const MAX_CONSECUTIVE_SAME_TYPE = 3;
    const MAX_SELLER_RATIO = 0.3;
    const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;
    const FRESHNESS_FLOOR_FIRST_N = 10;

    const placed: Candidate[] = [];
    const remaining = [...candidates];
    const sellerCounts = new Map<string, number>();
    let consecutiveType: DiscoveryUnitType | null = null;
    let consecutiveCount = 0;
    let freshPlacedInFirstN = 0;

    while (placed.length < limit && remaining.length > 0) {
      let pickedIndex = -1;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // Constraint 1: max consecutive same-type
        if (
          candidate.type === consecutiveType &&
          consecutiveCount >= MAX_CONSECUTIVE_SAME_TYPE
        ) {
          continue;
        }

        // Constraint 2: max 30% same-seller listings in the page
        if (candidate.sellerId) {
          const currentSellerCount = sellerCounts.get(candidate.sellerId) ?? 0;
          const projectedListingCount = placed.length + 1;
          if (currentSellerCount / projectedListingCount >= MAX_SELLER_RATIO) {
            continue;
          }
        }

        // Constraint 3: freshness floor — if we're in the first N and no fresh
        // item has been placed yet, prefer a fresh candidate.
        if (
          placed.length < FRESHNESS_FLOOR_FIRST_N &&
          freshPlacedInFirstN === 0
        ) {
          const isFresh =
            now - new Date(candidate.createdAt).getTime() < FRESHNESS_WINDOW_MS;
          if (!isFresh) {
            // Skip non-fresh candidates only if there's still a fresh one available
            const hasFreshRemaining = remaining.some(
              (c) => now - new Date(c.createdAt).getTime() < FRESHNESS_WINDOW_MS
            );
            if (hasFreshRemaining) {
              continue;
            }
          }
        }

        pickedIndex = i;
        break;
      }

      // If no candidate satisfied all constraints, relax: pick the highest-scored
      // remaining candidate to avoid starving the feed.
      if (pickedIndex === -1) {
        pickedIndex = 0;
      }

      const picked = remaining[pickedIndex];
      remaining.splice(pickedIndex, 1);

      // Track consecutive type
      if (picked.type === consecutiveType) {
        consecutiveCount++;
      } else {
        consecutiveType = picked.type;
        consecutiveCount = 1;
      }

      // Track seller concentration
      if (picked.sellerId) {
        sellerCounts.set(picked.sellerId, (sellerCounts.get(picked.sellerId) ?? 0) + 1);
      }

      // Track freshness floor
      if (
        placed.length < FRESHNESS_FLOOR_FIRST_N &&
        now - new Date(picked.createdAt).getTime() < FRESHNESS_WINDOW_MS
      ) {
        freshPlacedInFirstN++;
      }

      // Augment reason codes with composition context
      const reasonCodes = [...picked.reasonCodes];
      if (consecutiveCount === MAX_CONSECUTIVE_SAME_TYPE) {
        reasonCodes.push('type_diversity_boundary');
      }
      if (picked.sellerId) {
        const sellerPct = (sellerCounts.get(picked.sellerId) ?? 0) / (placed.length + 1);
        if (sellerPct >= MAX_SELLER_RATIO * 0.8) {
          reasonCodes.push('seller_concentration_near_cap');
        }
      }
      if (placed.length < FRESHNESS_FLOOR_FIRST_N && freshPlacedInFirstN === 1) {
        reasonCodes.push('freshness_floor_satisfied');
      }

      placed.push({
        ...picked,
        reasonCodes,
      });
    }

    // ── Build response ───────────────────────────────────────────────────
    const items: DiscoveryUnit[] = placed.map((candidate, idx) => ({
      type: candidate.type,
      id: candidate.id,
      rank: idx + 1,
      mediaAspectRatio: candidate.mediaAspectRatio,
      decision: {
        source: `${candidate.type}_recent_keyset`,
        score: Number(candidate.score.toFixed(6)),
        reasonCodes: candidate.reasonCodes,
      },
      data: candidate.data,
    }));

    // Cursor: encode the last item's (createdAt, type, id)
    const lastPlaced = placed[placed.length - 1];
    const nextCursor =
      placed.length >= limit && lastPlaced
        ? Buffer.from(
            `${lastPlaced.createdAt}|${lastPlaced.type}|${lastPlaced.id}`,
            'utf-8'
          ).toString('base64')
        : null;

    return { items, nextCursor };
  });
};
