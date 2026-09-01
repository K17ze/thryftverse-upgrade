import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  PROGRAM_CRITERIA,
  recomputeSellerMetrics,
  type SellerMetrics,
} from '../lib/sellerPerformance.js';

type SellerRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
};

const sellerIdParamsSchema = z.object({ sellerId: z.string().min(2) });

// ── Seller standards appeal: request body schema ────────────────────────────
// Gate 12 — sellers can inspect and appeal affected operational defects before
// material public/ranking consequences. An appeal creates a review record; it
// does NOT change the seller's tier.
const appealBodySchema = z.object({
  defectMetric: z.string().min(1).max(100),
  grounds: z.enum([
    'factual_error',
    'carrier_delay',
    'system_error',
    'mitigating_circumstance',
  ]),
  details: z.string().min(1).max(2000),
  evidenceUrls: z.array(z.string().url()).max(3).optional(),
});

/**
 * Register seller-profile routes on the Fastify instance:
 *   GET  /sellers/:sellerId                            — public seller profile
 *   POST /sellers/:sellerId/follow                     — toggle follow state
 *   GET  /sellers/:sellerId/reviews                    — review summary + list
 *   GET  /sellers/:sellerId/analytics                  — seller performance dashboard
 *   GET  /sellers/:sellerId/analytics/top-performers   — top performing listings
 *   GET  /sellers/:sellerId/standards                  — inspect operational metrics & tier defects (gate 12)
 *   POST /sellers/:sellerId/standards/appeal           — appeal an operational defect (gate 12)
 */
export const registerSellerRoutes = ({ app, db, readDb }: SellerRouteDependencies): void => {
  app.get('/sellers/:sellerId', async (request, reply) => {
    const { sellerId } = sellerIdParamsSchema.parse(request.params);
    const viewerUserId = request.authUser?.userId ?? null;

    // Fetch user row with holiday_mode and away_message for authoritative away state.
    const userResult = await readDb.query<{
      id: string;
      username: string;
      display_name: string | null;
      avatar: string | null;
      location: string | null;
      created_at: string;
      holiday_mode: boolean;
      away_message: string | null;
    }>(
      `SELECT id, username, display_name, avatar, location, created_at,
              holiday_mode, away_message
       FROM users WHERE id = $1 LIMIT 1`,
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

    // ── Trust evidence (fail-closed) ─────────────────────────────────
    // Only active, non-expired evidence rows produce badges/verification.
    // No evidence → no badge. This is the authoritative source for all
    // public trust claims — the client never derives eligibility.
    const evidenceResult = await readDb.query<{ code: string; tier: string | null }>(
      `SELECT code, tier FROM seller_trust_evidence
       WHERE seller_id = $1 AND state = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [sellerId]
    );
    const evidenceCodes = new Set<string>();
    let verificationTier: 'email' | 'id' | 'seller' | null = null;
    for (const row of evidenceResult.rows) {
      evidenceCodes.add(row.code);
      if (row.code === 'identity_checked') verificationTier = 'id';
      if (row.code === 'trader_verified' || row.code === 'top_rated') {
        verificationTier = 'seller';
      }
    }

    // Map evidence codes to badge types for the frontend.
    // Only evidence-backed badges are emitted — no client-side derivation.
    const badges: string[] = [];
    if (evidenceCodes.has('top_rated')) badges.push('topSeller');
    if (evidenceCodes.has('fast_dispatch')) badges.push('fastShipper');
    if (evidenceCodes.has('responsive_seller')) badges.push('responsive');

    // ── Seller trust projection (response rate, dispatch time) ───────
    // From seller_trust table (migration 166), recomputed from authoritative
    // order/carrier facts. Null when no data exists — never fabricated.
    const trustResult = await readDb.query<{
      response_rate: string | number | null;
      ship_within_days: number | null;
      total_sales: string | number | null;
      positive_rating_pct: string | number | null;
    }>(
      `SELECT response_rate, ship_within_days, total_sales, positive_rating_pct
       FROM seller_trust WHERE user_id = $1 LIMIT 1`,
      [sellerId]
    );
    const trustRow = trustResult.rows[0] ?? {};

    // Derive human-readable labels from authoritative data.
    // Null when no data — the frontend renders nothing for null labels.
    const dispatchTimeLabel = trustRow.ship_within_days != null
      ? trustRow.ship_within_days <= 1
        ? 'Dispatches same day'
        : `Dispatches in ${trustRow.ship_within_days} days`
      : null;

    // Response time label — derived from response_rate percentage.
    // This is a simplified mapping; a full implementation would compute
    // actual response time from message events.
    const responseRate = trustRow.response_rate != null ? Number(trustRow.response_rate) : null;
    const responseTimeLabel = responseRate != null && responseRate >= 90
      ? 'in 1h'
      : responseRate != null && responseRate >= 50
      ? 'in 3h'
      : null;

    const avgRating = reviewStats.rows[0]?.avg_rating ? Number(reviewStats.rows[0].avg_rating) : null;
    const reviewCount = reviewStats.rows[0]?.review_count ? Number(reviewStats.rows[0].review_count) : 0;
    const completedSales = salesResult.rows[0]?.completed_sales ? Number(salesResult.rows[0].completed_sales) : 0;
    const activeListingCount = activeListingsResult.rows[0]?.active_count ? Number(activeListingsResult.rows[0].active_count) : 0;

    return {
      ok: true,
      seller: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar,
        location: user.location,
        rating: avgRating,
        reviewCount,
        completedSales,
        activeListingCount,
        memberSince: user.created_at,
        isFollowing,
        // Verification tier — evidence-backed, fail-closed.
        // 'email' is never used here (email verification is not a trust claim).
        verificationTier,
        verified: verificationTier === 'seller',
        // Operational trust signals from seller_trust (authoritative).
        responseRate: trustRow.response_rate != null ? Number(trustRow.response_rate) : null,
        responseTimeLabel,
        dispatchTimeLabel,
        // Evidence-backed badges — no client-side derivation.
        badges,
        // Authoritative away state.
        holidayMode: user.holiday_mode === true,
        awayMessage: user.away_message ?? null,
      },
    };
  });

  // ── Idempotent follow (POST) — creates follow only if absent ────────
  // Replaces the unsafe toggle mutation. A lost response followed by retry
  // no longer reverses the user's intent.
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

    // Check block state — cannot follow if blocked by target
    const blockedByTarget = await readDb.query<{ id: string }>(
      `SELECT id FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 LIMIT 1`,
      [sellerId, userId]
    );
    if ((blockedByTarget.rowCount ?? 0) > 0) {
      reply.code(403);
      return { ok: false, error: 'Cannot follow this user', code: 'BLOCKED_BY_TARGET' };
    }

    const followId = `follow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(
      `INSERT INTO user_follows (id, follower_id, following_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (follower_id, following_id) DO NOTHING`,
      [followId, userId, sellerId]
    );

    return { ok: true, isFollowing: true };
  });

  // ── Idempotent unfollow (DELETE) — removes follow only if present ───
  app.delete('/sellers/:sellerId/follow', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const { sellerId } = sellerIdParamsSchema.parse(request.params);
    const userId = request.authUser.userId;

    await db.query(
      `DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
      [userId, sellerId]
    );

    return { ok: true, isFollowing: false };
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

    // Summary: average, total, distribution + reproducibility metadata.
    // A LEFT JOIN to review_publication_state is included so that once the
    // table is populated we can filter to eligible (published, not removed,
    // not incentivized) reviews. Until then every review is eligible and the
    // join is a no-op (ps.state defaults to 'published' via COALESCE).
    const summaryRes = await readDb.query<{
      avg_rating: string | null;
      review_count: string;
      eligible_count: string;
      as_of: string | null;
      d1: string;
      d2: string;
      d3: string;
      d4: string;
      d5: string;
    }>(
      `SELECT
         AVG(r.rating)::numeric(3,2) AS avg_rating,
         COUNT(*)::text AS review_count,
         COUNT(*) FILTER (
           WHERE COALESCE(ps.state, 'published') = 'published'
              AND COALESCE(ps.removed, false) = false
              AND COALESCE(ps.incentivized, false) = false
         )::text AS eligible_count,
         MAX(r.created_at) AS as_of,
         COUNT(*) FILTER (WHERE r.rating = 1)::text AS d1,
         COUNT(*) FILTER (WHERE r.rating = 2)::text AS d2,
         COUNT(*) FILTER (WHERE r.rating = 3)::text AS d3,
         COUNT(*) FILTER (WHERE r.rating = 4)::text AS d4,
         COUNT(*) FILTER (WHERE r.rating = 5)::text AS d5
       FROM order_reviews r
       LEFT JOIN review_publication_state ps ON ps.review_id = r.id
       WHERE r.seller_id = $1`,
      [sellerId]
    );

    const summaryRow = summaryRes.rows[0];
    const ratingAverage = summaryRow?.avg_rating ? Number(summaryRow.avg_rating) : null;
    const reviewCount = Number(summaryRow?.review_count ?? '0');
    const eligibleCount = Number(summaryRow?.eligible_count ?? '0');
    const asOf = summaryRow?.as_of ? new Date(summaryRow.as_of).toISOString() : null;
    const distribution = [
      { rating: 5, count: Number(summaryRow?.d5 ?? '0') },
      { rating: 4, count: Number(summaryRow?.d4 ?? '0') },
      { rating: 3, count: Number(summaryRow?.d3 ?? '0') },
      { rating: 2, count: Number(summaryRow?.d2 ?? '0') },
      { rating: 1, count: Number(summaryRow?.d1 ?? '0') },
    ];

    // Paginated review list with reviewer identity + associated listing context.
    // Returns reviewer_id (for authorized public navigation), media URLs, and
    // seller response — all backed by real persistence (migration 165).
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
      reviewer_id: string;
      reviewer_username: string | null;
      reviewer_display_name: string | null;
      reviewer_avatar: string | null;
      listing_id: string | null;
      listing_title: string | null;
      listing_image_url: string | null;
      response_body: string | null;
      response_created_at: string | null;
    }>(
      `
        SELECT
          r.id, r.rating, r.comment, r.created_at,
          r.reviewer_id,
          u.username AS reviewer_username,
          u.display_name AS reviewer_display_name,
          u.avatar AS reviewer_avatar,
          l.id AS listing_id,
          l.title AS listing_title,
          l.image_url AS listing_image_url,
          resp.body AS response_body,
          resp.created_at AS response_created_at
        FROM order_reviews r
        LEFT JOIN users u ON u.id = r.reviewer_id
        LEFT JOIN orders o ON o.id = r.order_id
        LEFT JOIN listings l ON l.id = o.listing_id
        LEFT JOIN review_responses resp ON resp.review_id = r.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.created_at DESC
        LIMIT $${args.length + 1}
      `,
      [...args, fetchLimit]
    );

    const hasMore = reviewsRes.rows.length > limit;
    const rows = hasMore ? reviewsRes.rows.slice(0, limit) : reviewsRes.rows;
    const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null;

    // Batch-fetch media for all review IDs in this page.
    const reviewIds = rows.map((r) => r.id);
    let mediaMap = new Map<string, string[]>();
    if (reviewIds.length > 0) {
      const mediaRes = await readDb.query<{ review_id: string; media_url: string }>(
        `SELECT review_id, media_url FROM review_media
         WHERE review_id = ANY($1) AND moderation_state = 'published'
         ORDER BY review_id, position`,
        [reviewIds],
      );
      for (const m of mediaRes.rows) {
        const arr = mediaMap.get(m.review_id) ?? [];
        arr.push(m.media_url);
        mediaMap.set(m.review_id, arr);
      }
    }

    return {
      ok: true,
      summary: {
        ratingAverage,
        reviewCount,
        eligibleCount,
        distribution,
        asOf,
        snapshotVersion: 1,
        computationNote: 'live_aggregate',
      },
      items: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at,
        photoUrls: mediaMap.get(row.id) ?? [],
        sellerResponse: row.response_body
          ? {
              text: row.response_body,
              createdAt: row.response_created_at!,
            }
          : null,
        reviewer: {
          id: row.reviewer_id,
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

    // ── Parallel query block ──────────────────────────────────────────
    // All four queries are independent — run them concurrently to eliminate
    // the sequential waterfall (was 5–7 round-trips, now 1 round-trip batch).
    //
    // Engagement metrics come from the `interactions` table (migration 001 +
    // vocabulary expansion in 143), NOT from non-existent denormalized counter
    // columns. Views = action IN ('view', 'qualified_detail_view'); likes =
    // action = 'wishlist'; saves = action = 'save'. All are period-scoped
    // via interactions.created_at.
    const [engagementResult, ordersResult, reviewsResult, trustResult] =
      await Promise.all([
        // 1. Listing inventory count + period-scoped engagement from interactions
        readDb.query<{
          total_listings: string | number;
          active_listings: string | number;
          total_views: string | number;
          total_likes: string | number;
          total_saves: string | number;
        }>(
          `
            SELECT
              COUNT(DISTINCT l.id) AS total_listings,
              COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') AS active_listings,
              COUNT(i.id) FILTER (WHERE i.action IN ('view', 'qualified_detail_view')) AS total_views,
              COUNT(i.id) FILTER (WHERE i.action = 'wishlist') AS total_likes,
              COUNT(i.id) FILTER (WHERE i.action = 'save') AS total_saves
            FROM listings l
            LEFT JOIN interactions i ON i.listing_id = l.id
              AND i.created_at >= NOW() - ${interval}
            WHERE l.seller_id = $1
          `,
          [sellerId]
        ),
        // 2. Revenue and items sold from settled order facts (migration 076).
        //    paid_at is the authoritative sale timestamp.
        readDb.query<{
          items_sold: string | number;
          revenue_gbp_minor: string | number;
        }>(
          `
            SELECT
              COUNT(*) AS items_sold,
              COALESCE(SUM(subtotal_gbp) * 100, 0)::bigint AS revenue_gbp_minor
            FROM orders
            WHERE seller_id = $1
              AND status IN ('paid', 'shipped', 'delivered')
              AND paid_at IS NOT NULL
              AND paid_at >= NOW() - ${interval}
          `,
          [sellerId]
        ),
        // 3. Reviews for the period
        readDb.query<{
          avg_rating: string | number | null;
          review_count: string | number;
        }>(
          `
            SELECT AVG(r.rating) AS avg_rating, COUNT(r.id) AS review_count
            FROM order_reviews r
            WHERE r.seller_id = $1 AND r.created_at > NOW() - ${interval}
          `,
          [sellerId]
        ),
        // 4. Trust projection (response rate, dispatch time)
        readDb.query<{
          response_rate: string | number | null;
          ship_within_days: number | null;
          total_sales: string | number | null;
          positive_rating_pct: string | number | null;
        }>(
          `SELECT response_rate, ship_within_days, total_sales, positive_rating_pct
           FROM seller_trust WHERE user_id = $1 LIMIT 1`,
          [sellerId]
        ),
      ]);

    // 5. Ledger refunds/fees — dependent on a schema check, so runs after
    //    the parallel batch. When ledger tables are absent, completeness is
    //    'partial' and these remain null.
    let refundsGbpMinor: number | null = null;
    let feesGbpMinor: number | null = null;
    let completeness: 'complete' | 'partial' = 'partial';
    const ledgerCheck = await readDb.query<{ exists: boolean }>(
      `SELECT to_regclass('public.ledger_accounts') IS NOT NULL
        AND to_regclass('public.ledger_entries') IS NOT NULL AS exists`
    );
    if (ledgerCheck.rows[0]?.exists) {
      completeness = 'complete';
      const [refundsResult, feesResult] = await Promise.all([
        readDb.query<{ refunds: string | null }>(
          `
            SELECT COALESCE(SUM(amount_gbp) * 100, 0)::bigint AS refunds
            FROM ledger_entries
            WHERE account_id = (
              SELECT id FROM ledger_accounts
              WHERE owner_type = 'user' AND owner_id = $1 AND code = 'seller_payable'
              LIMIT 1
            )
            AND source_type = 'refund'
            AND direction = 'debit'
            AND created_at >= NOW() - ${interval}
          `,
          [sellerId]
        ),
        readDb.query<{ fees: string | null }>(
          `
            SELECT COALESCE(SUM(amount_gbp) * 100, 0)::bigint AS fees
            FROM ledger_entries
            WHERE account_id = (
              SELECT id FROM ledger_accounts
              WHERE owner_type = 'user' AND owner_id = $1 AND code = 'seller_payable'
              LIMIT 1
            )
            AND source_type = 'order_payment'
            AND direction = 'debit'
            AND line_type = 'platform_fee'
            AND created_at >= NOW() - ${interval}
          `,
          [sellerId]
        ),
      ]);
      refundsGbpMinor = Number(refundsResult.rows[0]?.refunds ?? 0);
      feesGbpMinor = Number(feesResult.rows[0]?.fees ?? 0);
    }

    const row = engagementResult.rows[0] ?? {};
    const orders = ordersResult.rows[0] ?? {};
    const reviews = reviewsResult.rows[0] ?? {};
    const trust = trustResult.rows[0] ?? {};

    const revenueGbpMinor = Number(orders.revenue_gbp_minor ?? 0);
    const netSalesGbpMinor =
      refundsGbpMinor !== null && feesGbpMinor !== null
        ? revenueGbpMinor - refundsGbpMinor - feesGbpMinor
        : null;

    return {
      ok: true,
      analytics: {
        totalListings: Number(row.total_listings ?? 0),
        activeListings: Number(row.active_listings ?? 0),
        totalViews: Number(row.total_views ?? 0),
        totalLikes: Number(row.total_likes ?? 0),
        totalSaves: Number(row.total_saves ?? 0),
        itemsSold: Number(orders.items_sold ?? 0),
        revenueGbpMinor,
        refundsGbpMinor,
        feesGbpMinor,
        netSalesGbpMinor,
        completeness,
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

    // ── Top performers from real interaction counts ──────────────────
    // Aggregates views (view + qualified_detail_view), likes (wishlist),
    // and saves (save) from the interactions table, joined to the seller's
    // listings. The engagement score weights saves > likes > views to
    // reflect intent strength. No non-existent denormalized columns.
    const result = await readDb.query<{
      id: string;
      title: string;
      price_gbp_minor: number | string;
      views_count: string | number;
      likes_count: string | number;
      saved_count: string | number;
      status: string;
      created_at: string;
    }>(
      `
        SELECT
          l.id, l.title, l.price_gbp_minor, l.status, l.created_at,
          COUNT(i.id) FILTER (WHERE i.action IN ('view', 'qualified_detail_view')) AS views_count,
          COUNT(i.id) FILTER (WHERE i.action = 'wishlist') AS likes_count,
          COUNT(i.id) FILTER (WHERE i.action = 'save') AS saved_count
        FROM listings l
        LEFT JOIN interactions i ON i.listing_id = l.id
        WHERE l.seller_id = $1
        GROUP BY l.id, l.title, l.price_gbp_minor, l.status, l.created_at
        ORDER BY (
          COUNT(i.id) FILTER (WHERE i.action IN ('view', 'qualified_detail_view'))
          + COUNT(i.id) FILTER (WHERE i.action = 'wishlist') * 3
          + COUNT(i.id) FILTER (WHERE i.action = 'save') * 5
        ) DESC
        LIMIT $2
      `,
      [sellerId, limit]
    );

    return {
      ok: true,
      items: result.rows.map((row) => {
        const views = Number(row.views_count ?? 0);
        const likes = Number(row.likes_count ?? 0);
        const saves = Number(row.saved_count ?? 0);
        return {
          id: row.id,
          title: row.title,
          priceGbpMinor: Number(row.price_gbp_minor),
          viewsCount: views,
          likesCount: likes,
          savedCount: saves,
          status: row.status,
          createdAt: row.created_at,
          engagementScore: views + likes * 3 + saves * 5,
        };
      }),
    };
  });

  /* ── Seller Standards (Gate 12) ──────────────────────────────────────────
   * Sellers can inspect their own operational metrics, see how they map to the
   * performance-program standards, and identify the specific defects that would
   * prevent qualification — before any material public/ranking consequence.
   * Metrics are recomputed from authoritative order/carrier facts on every
   * request (never fabricated, never stale cache). */

  // GET /sellers/:sellerId/standards — inspect operational metrics & defects
  app.get('/sellers/:sellerId/standards', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const { sellerId } = sellerIdParamsSchema.parse(request.params);

    if (request.authUser.userId !== sellerId) {
      reply.code(403);
      return { ok: false, error: 'You can only view your own standards' };
    }

    // Recompute from authoritative order/carrier facts — never fabricated.
    const metrics = await recomputeSellerMetrics(db, sellerId);

    // New seller — no committed orders in the 90-day window.
    if (!metrics) {
      return {
        ok: true,
        metrics: null,
        tier: 'standard',
        defects: [],
        appealsAvailable: false,
      };
    }

    // ── Evaluate against program thresholds (PROGRAM_CRITERIA) ──────────────
    const lifetimeOrdersMet =
      metrics.lifetimeOrdersShipped >= PROGRAM_CRITERIA.lifetimeOrdersRequired;
    const orders90dMet =
      metrics.ordersShipped90d >= PROGRAM_CRITERIA.orders90dRequired;
    const sales90dMet =
      metrics.salesVolume90d >= PROGRAM_CRITERIA.sales90dRequired;
    const ordersOrSalesMet = orders90dMet || sales90dMet;
    const shipTimeMet =
      metrics.averageShipTimeHours90d <= PROGRAM_CRITERIA.maxShipTimeHours;
    const cancellationMet =
      metrics.cancellationRate90d <= PROGRAM_CRITERIA.maxCancellationRate;
    const returnCaseMet =
      metrics.approvedReturnCaseRate90d <= PROGRAM_CRITERIA.maxReturnCaseRate;

    // Defects: each failing criterion with threshold, actual, and gap.
    // For "higher-is-better" metrics, gap = threshold - actual.
    // For "lower-is-better" metrics, gap = actual - threshold.
    const defects: Array<{
      metric: string;
      threshold: number;
      actual: number;
      gap: number;
    }> = [];

    if (!lifetimeOrdersMet) {
      defects.push({
        metric: 'ordersShipped',
        threshold: PROGRAM_CRITERIA.lifetimeOrdersRequired,
        actual: metrics.lifetimeOrdersShipped,
        gap: PROGRAM_CRITERIA.lifetimeOrdersRequired - metrics.lifetimeOrdersShipped,
      });
    }
    // 90-day activity is an OR gate (orders OR sales). Only surface defects
    // when the OR fails; if either passes, neither is a defect.
    if (!ordersOrSalesMet) {
      if (!orders90dMet) {
        defects.push({
          metric: 'ordersInWindow',
          threshold: PROGRAM_CRITERIA.orders90dRequired,
          actual: metrics.ordersShipped90d,
          gap: PROGRAM_CRITERIA.orders90dRequired - metrics.ordersShipped90d,
        });
      }
      if (!sales90dMet) {
        defects.push({
          metric: 'salesVolume',
          threshold: PROGRAM_CRITERIA.sales90dRequired,
          actual: metrics.salesVolume90d,
          gap: PROGRAM_CRITERIA.sales90dRequired - metrics.salesVolume90d,
        });
      }
    }
    if (!shipTimeMet) {
      const thresholdDays = PROGRAM_CRITERIA.maxShipTimeHours / 24;
      const actualDays = metrics.averageShipTimeHours90d / 24;
      defects.push({
        metric: 'averageShipTimeDays',
        threshold: thresholdDays,
        actual: actualDays,
        gap: actualDays - thresholdDays,
      });
    }
    if (!cancellationMet) {
      const thresholdPct = PROGRAM_CRITERIA.maxCancellationRate * 100;
      const actualPct = metrics.cancellationRate90d * 100;
      defects.push({
        metric: 'cancellationRate',
        threshold: thresholdPct,
        actual: actualPct,
        gap: actualPct - thresholdPct,
      });
    }
    if (!returnCaseMet) {
      const thresholdPct = PROGRAM_CRITERIA.maxReturnCaseRate * 100;
      const actualPct = metrics.approvedReturnCaseRate90d * 100;
      defects.push({
        metric: 'returnCaseRate',
        threshold: thresholdPct,
        actual: actualPct,
        gap: actualPct - thresholdPct,
      });
    }

    // ── Tier qualification ──────────────────────────────────────────────────
    const qualified =
      lifetimeOrdersMet && ordersOrSalesMet && shipTimeMet && cancellationMet && returnCaseMet;
    let tier: 'standard' | 'performer' | 'top_performer' = 'standard';
    if (qualified) {
      tier = 'performer';
      if (
        metrics.lifetimeOrdersShipped >= PROGRAM_CRITERIA.topPerformerLifetimeOrders &&
        metrics.averageShipTimeHours90d <= PROGRAM_CRITERIA.topPerformerMaxShipTimeHours &&
        metrics.cancellationRate90d <= PROGRAM_CRITERIA.topPerformerMaxCancellationRate
      ) {
        tier = 'top_performer';
      }
    }

    return {
      ok: true,
      metrics: {
        ordersShipped: metrics.lifetimeOrdersShipped,
        salesVolume: metrics.salesVolume90d,
        averageShipTimeDays: metrics.averageShipTimeHours90d / 24,
        cancellationRate: metrics.cancellationRate90d * 100,
        returnCaseRate: metrics.approvedReturnCaseRate90d * 100,
      },
      tier,
      defects,
      appealsAvailable: defects.length > 0,
    };
  });

  // POST /sellers/:sellerId/standards/appeal — appeal an operational defect
  app.post('/sellers/:sellerId/standards/appeal', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const { sellerId } = sellerIdParamsSchema.parse(request.params);

    if (request.authUser.userId !== sellerId) {
      reply.code(403);
      return { ok: false, error: 'You can only submit appeals for your own account' };
    }

    const parsed = appealBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid appeal payload', details: parsed.error.flatten() };
    }

    const { defectMetric, grounds, details, evidenceUrls } = parsed.data;

    // Ensure the appeals table exists (idempotent). Inline CREATE IF NOT EXISTS
    // per task scope — a dedicated migration can replace this later.
    await db.query(
      `CREATE TABLE IF NOT EXISTS seller_standards_appeals (
        id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        defect_metric TEXT NOT NULL,
        grounds TEXT NOT NULL CHECK (grounds IN ('factual_error', 'carrier_delay', 'system_error', 'mitigating_circumstance')),
        details TEXT NOT NULL,
        evidence_urls TEXT[],
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'upheld', 'overturned', 'withdrawn')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        decided_at TIMESTAMPTZ,
        decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        decision_rationale TEXT
      )`
    );

    const appealId = crypto.randomUUID();
    await db.query(
      `INSERT INTO seller_standards_appeals
         (id, seller_id, defect_metric, grounds, details, evidence_urls, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open')`,
      [
        appealId,
        sellerId,
        defectMetric,
        grounds,
        details,
        evidenceUrls && evidenceUrls.length > 0 ? evidenceUrls : null,
      ]
    );

    reply.code(201);
    return { ok: true, appealId };
  });
};
