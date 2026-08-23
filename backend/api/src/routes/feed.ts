import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type FeedRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
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

/**
 * Register feed routes on the Fastify instance:
 *   GET /feed/looks      — published looks feed (public)
 *   GET /feed/home       — mixed listings/posters/looks home feed (public)
 *   GET /feed/trending   — trending listings by engagement velocity (public)
 *   GET /feed/following  — social activity feed from followed users (auth)
 */
export const registerFeedRoutes = ({ app, db, readDb }: FeedRouteDependencies): void => {
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

  app.get('/feed/home', async (request) => {
    const { limit, cursor } = homeQuerySchema.parse(request.query ?? {});

    const cursorCondition = cursor ? `AND created_at < $1` : '';
    const cursorParams = cursor ? [cursor, limit] : [limit];
    const limitSlot = `$${cursorParams.length}`;

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
};
