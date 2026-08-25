import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

type SellerHubRouteDependencies = {
  app: FastifyInstance;
  readDb: Pool;
};

export const registerSellerHubRoutes = ({ app, readDb }: SellerHubRouteDependencies) => {
  // Server-backed aggregate that computes real money, tasks, and inventory
  // from the orders, listing_offers, and listings tables.
  // Per closure program 05_SELLER_HUB_AND_PROFILE_OS: no frontend
  // approximation of financial KPIs.
  app.get('/seller-hub/overview', async (request: FastifyRequest, reply: FastifyReply) => {
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

    // Sales performance (last 30 days) — real settled order totals
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
};
