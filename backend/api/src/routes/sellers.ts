import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type SellerRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
};

const sellerIdParamsSchema = z.object({ sellerId: z.string().min(2) });

/**
 * Register seller-profile routes on the Fastify instance:
 *   GET  /sellers/:sellerId                            — public seller profile
 *   POST /sellers/:sellerId/follow                     — toggle follow state
 *   GET  /sellers/:sellerId/reviews                    — review summary + list
 *   GET  /sellers/:sellerId/analytics                  — seller performance dashboard
 *   GET  /sellers/:sellerId/analytics/top-performers   — top performing listings
 */
export const registerSellerRoutes = ({ app, db, readDb }: SellerRouteDependencies): void => {
  app.get('/sellers/:sellerId', async (request, reply) => {
    const { sellerId } = sellerIdParamsSchema.parse(request.params);
    const viewerUserId = request.authUser?.userId ?? null;

    const userResult = await readDb.query<{
      id: string;
      username: string;
      avatar: string | null;
      location: string | null;
      created_at: string;
    }>(
      `SELECT id, username, avatar, location, created_at FROM users WHERE id = $1 LIMIT 1`,
      [sellerId]
    );

    const user = userResult.rows[0];
    if (!user) {
      reply.code(404);
      return { ok: false, error: 'Seller not found' };
    }

    const reviewStats = await readDb.query<{
      avg_rating: string | null;
      review_count: string;
    }>(
      `SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::text AS review_count FROM order_reviews WHERE seller_id = $1`,
      [sellerId]
    );

    const salesResult = await readDb.query<{ completed_sales: string }>(
      `SELECT COUNT(*)::text AS completed_sales FROM orders WHERE seller_id = $1 AND status = 'completed'`,
      [sellerId]
    );

    const activeListingsResult = await readDb.query<{ active_count: string }>(
      `SELECT COUNT(*)::text AS active_count FROM listings WHERE seller_id = $1 AND status = 'active'`,
      [sellerId]
    );

    let isFollowing = false;
    if (viewerUserId) {
      const followResult = await readDb.query<{ id: string }>(
        `SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2 LIMIT 1`,
        [viewerUserId, sellerId]
      );
      isFollowing = (followResult.rowCount ?? 0) > 0;
    }

    const avgRating = reviewStats.rows[0]?.avg_rating ? Number(reviewStats.rows[0].avg_rating) : null;
    const reviewCount = reviewStats.rows[0]?.review_count ? Number(reviewStats.rows[0].review_count) : 0;
    const completedSales = salesResult.rows[0]?.completed_sales ? Number(salesResult.rows[0].completed_sales) : 0;
    const activeListingCount = activeListingsResult.rows[0]?.active_count ? Number(activeListingsResult.rows[0].active_count) : 0;

    return {
      ok: true,
      seller: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        location: user.location,
        rating: avgRating,
        reviewCount,
        completedSales,
        activeListingCount,
        memberSince: user.created_at,
        isFollowing,
      },
    };
  });

  app.post('/sellers/:sellerId/follow', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const { sellerId } = sellerIdParamsSchema.parse(request.params);
    const userId = request.authUser.userId;

    if (userId === sellerId) {
      reply.code(400);
      return { ok: false, error: 'Cannot follow yourself' };
    }

    const existing = await readDb.query<{ id: string }>(
      `SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2 LIMIT 1`,
      [userId, sellerId]
    );

    if ((existing.rowCount ?? 0) > 0) {
      await db.query(
        `DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
        [userId, sellerId]
      );
      return { ok: true, isFollowing: false };
    }

    const followId = `follow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(
      `INSERT INTO user_follows (id, follower_id, following_id, created_at) VALUES ($1, $2, $3, NOW())`,
      [followId, userId, sellerId]
    );

    return { ok: true, isFollowing: true };
  });

  // ── Seller reviews: summary + paginated list ─────────────────────────

  app.get('/sellers/:sellerId/reviews', async (request, reply) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().optional(),
    });
    const { sellerId } = sellerIdParamsSchema.parse(request.params);
    const { limit, cursor } = querySchema.parse(request.query ?? {});

    const sellerExists = await readDb.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 LIMIT 1`,
      [sellerId]
    );
    if (!sellerExists.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Seller not found' };
    }

    // Summary: average, total, distribution
    const summaryRes = await readDb.query<{
      avg_rating: string | null;
      review_count: string;
      d1: string;
      d2: string;
      d3: string;
      d4: string;
      d5: string;
    }>(
      `SELECT
         AVG(rating)::numeric(3,2) AS avg_rating,
         COUNT(*)::text AS review_count,
         COUNT(*) FILTER (WHERE rating = 1)::text AS d1,
         COUNT(*) FILTER (WHERE rating = 2)::text AS d2,
         COUNT(*) FILTER (WHERE rating = 3)::text AS d3,
         COUNT(*) FILTER (WHERE rating = 4)::text AS d4,
         COUNT(*) FILTER (WHERE rating = 5)::text AS d5
       FROM order_reviews WHERE seller_id = $1`,
      [sellerId]
    );

    const summaryRow = summaryRes.rows[0];
    const ratingAverage = summaryRow?.avg_rating ? Number(summaryRow.avg_rating) : null;
    const reviewCount = Number(summaryRow?.review_count ?? '0');
    const distribution = [
      { rating: 5, count: Number(summaryRow?.d5 ?? '0') },
      { rating: 4, count: Number(summaryRow?.d4 ?? '0') },
      { rating: 3, count: Number(summaryRow?.d3 ?? '0') },
      { rating: 2, count: Number(summaryRow?.d2 ?? '0') },
      { rating: 1, count: Number(summaryRow?.d1 ?? '0') },
    ];

    // Paginated review list with reviewer identity + associated listing context
    const conditions: string[] = ['r.seller_id = $1'];
    const args: unknown[] = [sellerId];
    if (cursor) {
      conditions.push(`r.created_at < $${args.length + 1}`);
      args.push(cursor);
    }
    const fetchLimit = limit + 1;

    const reviewsRes = await readDb.query<{
      id: string;
      rating: number;
      comment: string | null;
      created_at: string;
      reviewer_username: string | null;
      reviewer_display_name: string | null;
      reviewer_avatar: string | null;
      listing_id: string | null;
      listing_title: string | null;
      listing_image_url: string | null;
    }>(
      `
        SELECT
          r.id, r.rating, r.comment, r.created_at,
          u.username AS reviewer_username,
          u.display_name AS reviewer_display_name,
          u.avatar AS reviewer_avatar,
          l.id AS listing_id,
          l.title AS listing_title,
          l.image_url AS listing_image_url
        FROM order_reviews r
        LEFT JOIN users u ON u.id = r.reviewer_id
        LEFT JOIN orders o ON o.id = r.order_id
        LEFT JOIN listings l ON l.id = o.listing_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.created_at DESC
        LIMIT $${args.length + 1}
      `,
      [...args, fetchLimit]
    );

    const hasMore = reviewsRes.rows.length > limit;
    const rows = hasMore ? reviewsRes.rows.slice(0, limit) : reviewsRes.rows;
    const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null;

    return {
      ok: true,
      summary: {
        ratingAverage,
        reviewCount,
        distribution,
      },
      items: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at,
        reviewer: {
          id: null as string | null,
          username: row.reviewer_username,
          displayName: row.reviewer_display_name,
          avatar: row.reviewer_avatar,
        },
        listing: row.listing_id
          ? {
              id: row.listing_id,
              title: row.listing_title,
              imageUrl: row.listing_image_url,
            }
          : null,
      })),
      nextCursor,
    };
  });

  /* ── Seller Analytics ── */

  // GET /sellers/:sellerId/analytics — seller performance dashboard data
  app.get('/sellers/:sellerId/analytics', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const { sellerId } = sellerIdParamsSchema.parse(request.params);

    if (request.authUser.userId !== sellerId) {
      reply.code(403);
      return { ok: false, error: 'You can only view your own analytics' };
    }

    const querySchema = z.object({
      period: z.enum(['7d', '30d', '90d']).default('30d'),
    });
    const { period } = querySchema.parse(request.query);

    const intervalMap: Record<string, string> = {
      '7d': "INTERVAL '7 days'",
      '30d': "INTERVAL '30 days'",
      '90d': "INTERVAL '90 days'",
    };
    const interval = intervalMap[period];

    const listingsResult = await db.query<{
      total_listings: string | number;
      total_views: string | number;
      total_likes: string | number;
      total_saves: string | number;
      items_sold: string | number;
      revenue_gbp_minor: string | number;
    }>(
      `
        SELECT
          COUNT(DISTINCT l.id) AS total_listings,
          COALESCE(SUM(l.views_count), 0) AS total_views,
          COALESCE(SUM(l.likes_count), 0) AS total_likes,
          COALESCE(SUM(l.saved_count), 0) AS total_saves,
          COUNT(CASE WHEN l.sold_at IS NOT NULL AND l.sold_at > NOW() - ${interval} THEN 1 END) AS items_sold,
          COALESCE(SUM(CASE WHEN l.sold_at IS NOT NULL AND l.sold_at > NOW() - ${interval} THEN l.price_gbp_minor ELSE 0 END), 0) AS revenue_gbp_minor
        FROM listings l
        WHERE l.seller_id = $1
      `,
      [sellerId]
    );

    const reviewsResult = await db.query<{
      avg_rating: string | number | null;
      review_count: string | number;
    }>(
      `
        SELECT AVG(r.rating) AS avg_rating, COUNT(r.id) AS review_count
        FROM order_reviews r
        WHERE r.reviewee_id = $1 AND r.created_at > NOW() - ${interval}
      `,
      [sellerId]
    );

    const trustResult = await db.query<{
      response_rate: string | number | null;
      ship_within_days: number | null;
      total_sales: string | number | null;
      positive_rating_pct: string | number | null;
    }>(
      `SELECT response_rate, ship_within_days, total_sales, positive_rating_pct
       FROM seller_trust WHERE user_id = $1 LIMIT 1`,
      [sellerId]
    );

    const row = listingsResult.rows[0] ?? {};
    const reviews = reviewsResult.rows[0] ?? {};
    const trust = trustResult.rows[0] ?? {};

    return {
      ok: true,
      analytics: {
        totalListings: Number(row.total_listings ?? 0),
        totalViews: Number(row.total_views ?? 0),
        totalLikes: Number(row.total_likes ?? 0),
        totalSaves: Number(row.total_saves ?? 0),
        itemsSold: Number(row.items_sold ?? 0),
        revenueGbpMinor: Number(row.revenue_gbp_minor ?? 0),
        avgRating: reviews.avg_rating ? Number(reviews.avg_rating) : null,
        reviewCount: Number(reviews.review_count ?? 0),
        responseRate: trust.response_rate ? Number(trust.response_rate) : null,
        shipWithinDays: trust.ship_within_days ?? null,
        totalSales: trust.total_sales ? Number(trust.total_sales) : null,
        positiveRatingPct: trust.positive_rating_pct ? Number(trust.positive_rating_pct) : null,
        period,
      },
    };
  });

  // GET /sellers/:sellerId/analytics/top-performers — top performing listings
  app.get('/sellers/:sellerId/analytics/top-performers', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const { sellerId } = sellerIdParamsSchema.parse(request.params);

    if (request.authUser.userId !== sellerId) {
      reply.code(403);
      return { ok: false, error: 'You can only view your own analytics' };
    }

    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(50).default(10),
    });
    const { limit } = querySchema.parse(request.query);

    const result = await db.query<{
      id: string;
      title: string;
      price_gbp_minor: number | string;
      views_count: number;
      likes_count: number;
      saved_count: number;
      status: string;
      created_at: string;
    }>(
      `
        SELECT id, title, price_gbp_minor, views_count, likes_count, saved_count, status, created_at
        FROM listings
        WHERE seller_id = $1
        ORDER BY (views_count + likes_count * 3 + saved_count * 5) DESC
        LIMIT $2
      `,
      [sellerId, limit]
    );

    return {
      ok: true,
      items: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        priceGbpMinor: Number(row.price_gbp_minor),
        viewsCount: row.views_count,
        likesCount: row.likes_count,
        savedCount: row.saved_count,
        status: row.status,
        createdAt: row.created_at,
        engagementScore: row.views_count + row.likes_count * 3 + row.saved_count * 5,
      })),
    };
  });
};
