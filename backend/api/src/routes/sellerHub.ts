import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import {
  executeListingCommand,
  type ListingCommand,
} from '../lib/listingCommandService.js';

type SellerHubRouteDependencies = {
  app: FastifyInstance;
  readDb: Pool;
  db: Pool;
};

// ── Table availability checks ──
// The seller hub aggregate spans multiple domains (listings, orders, offers,
// ledger, wallet, payout, trust). Not all tables may exist on every deployment.
// Each source reports its own freshness so the UI can label partial data
// truthfully rather than silently merging stale and fresh sources.
async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  try {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public')`,
      [tableName],
    );
    return Boolean(result.rows[0]?.exists);
  } catch {
    return false;
  }
}

// ── Types ──

interface SellerTask {
  id: string;
  type: 'ship_order' | 'respond_offer' | 'listing_issue' | 'catalogue_awaiting' | 'payout_hold';
  priority: 'critical' | 'high' | 'normal' | 'low';
  count: number;
  dueAt: string | null;
  consequence: { kind: 'money' | 'buyer' | 'trust' | 'listing'; amountGbp?: number } | null;
  actionRoute: string;
  actionLabel: string;
}

interface FreshnessEntry {
  asOf: string;
  state: 'fresh' | 'stale' | 'unavailable';
}

interface SellerOverviewV2 {
  schemaVersion: 2;
  generatedAt: string;
  freshness: Record<string, FreshnessEntry>;
  tasks: SellerTask[];
  topTask: SellerTask | null;
  taskSummary: Record<string, number>;
  money: {
    currency: 'GBP';
    availableGbp: number;
    processingGbp: number;
    heldGbp: number;
    nextPayoutAt: string | null;
  } | null;
  inventory: {
    active: number;
    drafts: number;
    paused: number;
    sold: number;
    listedValueGbp: number;
  };
  businessPulse: {
    period: '30d';
    grossSalesGbp: number;
    refundsGbp: number;
    feesGbp: number;
    netSalesGbp: number;
    orders: number;
    completeness: 'complete' | 'partial';
    /** Net sales change vs the previous 30-day period (percentage points). Null when previous period had zero sales. */
    netSalesPrevPeriodPct: number | null;
    /** Order count change vs the previous 30-day period (percentage points). Null when previous period had zero orders. */
    ordersPrevPeriodPct: number | null;
  } | null;
}

// ── Batch command types ──

interface BatchCommandItem {
  listingId: string;
}

interface BatchCommandResult {
  listingId: string;
  state: 'applied' | 'rejected' | 'conflict';
  newStatus?: string;
  reason?: string;
  currentStatus?: string;
}

interface BatchCommandResponse {
  ok: boolean;
  batchId: string;
  idempotencyKey: string;
  state: 'complete' | 'partial';
  results: BatchCommandResult[];
  appliedCount: number;
  rejectedCount: number;
  conflictCount: number;
}

export const registerSellerHubRoutes = ({ app, readDb, db }: SellerHubRouteDependencies) => {
  // ════════════════════════════════════════════════════════════════════════
  // GET /seller-hub/overview — canonical seller OS aggregate (v2)
  //
  // Per closure program 05_SELLER_HUB_AND_PROFILE_OS and Report 17:
  // no frontend approximation of financial KPIs, no 100-listing cap,
  // no false "all caught up" when order/offer sources are unchecked.
  //
  // This endpoint computes real money, tasks, and inventory from the
  // orders, listing_offers, listings, ledger_entries, payout_reserve_holds,
  // and seller_trust tables. Each source reports its own freshness so
  // the UI can label partial data truthfully.
  // ════════════════════════════════════════════════════════════════════════
  app.get('/seller-hub/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const sellerId = request.authUser.userId;
    const generatedAt = new Date().toISOString();
    const freshness: Record<string, FreshnessEntry> = {};

    // ── Check table availability for freshness tracking ──
    const [
      ordersAvailable,
      offersAvailable,
      ledgerAvailable,
      payoutAvailable,
      trustAvailable,
      reserveHoldsAvailable,
    ] = await Promise.all([
      tableExists(readDb, 'orders'),
      tableExists(readDb, 'listing_offers'),
      tableExists(readDb, 'ledger_entries'),
      tableExists(readDb, 'payout_accounts'),
      tableExists(readDb, 'seller_trust'),
      tableExists(readDb, 'payout_reserve_holds'),
    ]);

    // ── Inventory counts (real, uncapped) ──
    // Per Report 17 P0: the old screen capped at 100 listings and derived
    // counts on-device. This aggregate counts ALL listings server-side.
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
      [sellerId],
    );
    const inventory = inventoryResult.rows[0] ?? { active: '0', drafts: '0', paused: '0', sold: '0', active_value: '0' };
    freshness.listings = { asOf: generatedAt, state: 'fresh' };

    // ── Seller trust (for ship_within_days) ──
    let shipWithinDays: number | null = null;
    if (trustAvailable) {
      try {
        const trustResult = await readDb.query<{ ship_within_days: number | null }>(
          `SELECT ship_within_days FROM seller_trust WHERE user_id = $1 LIMIT 1`,
          [sellerId],
        );
        shipWithinDays = trustResult.rows[0]?.ship_within_days ?? null;
        freshness.trust = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.trust = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.trust = { asOf: generatedAt, state: 'unavailable' };
    }

    // ── Build cross-domain tasks ──
    const tasks: SellerTask[] = [];

    // Task 1: Ship orders (paid, not yet shipped)
    // Per Report 17 P0: uses paid_at + ship_within_days as the real dispatch
    // deadline, NOT order creation timestamp. This is the contractual
    // handling-time deadline that actually costs trust if missed.
    if (ordersAvailable) {
      try {
        const shipOrdersResult = await readDb.query<{
          count: string;
          oldest_paid: string | null;
          overdue_count: string;
        }>(
          `
          SELECT
            COUNT(*) AS count,
            MIN(paid_at)::text AS oldest_paid,
            COUNT(*) FILTER (
              WHERE paid_at IS NOT NULL
                AND paid_at + COALESCE(
                  (SELECT ship_within_days FROM seller_trust WHERE user_id = $1 LIMIT 1),
                  3
                ) * INTERVAL '1 day' < NOW()
            ) AS overdue_count
          FROM orders
          WHERE seller_id = $1 AND status = 'paid'
        `,
          [sellerId],
        );
        const shipCount = parseInt(shipOrdersResult.rows[0]?.count ?? '0', 10) || 0;
        const overdueCount = parseInt(shipOrdersResult.rows[0]?.overdue_count ?? '0', 10) || 0;
        const oldestPaid = shipOrdersResult.rows[0]?.oldest_paid ?? null;

        if (shipCount > 0) {
          // Compute the real dispatch deadline: oldest paid_at + handling time
          let dueAt: string | null = null;
          if (oldestPaid) {
            const handlingDays = shipWithinDays ?? 3;
            const paidDate = new Date(oldestPaid);
            paidDate.setDate(paidDate.getDate() + handlingDays);
            dueAt = paidDate.toISOString();
          }

          tasks.push({
            id: `ship_order_${sellerId}`,
            type: 'ship_order',
            priority: overdueCount > 0 ? 'critical' : 'high',
            count: shipCount,
            dueAt,
            consequence: { kind: 'trust', amountGbp: undefined },
            actionRoute: 'MyOrders',
            actionLabel: 'Ship orders',
          });
        }
        freshness.orders = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.orders = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.orders = { asOf: generatedAt, state: 'unavailable' };
    }

    // Task 2: Respond to offers (pending, not expired)
    if (offersAvailable) {
      try {
        const offersResult = await readDb.query<{
          count: string;
          nearest_expiry: string | null;
          total_offer_value: string | null;
        }>(
          `
          SELECT
            COUNT(*) AS count,
            MIN(expires_at)::text AS nearest_expiry,
            COALESCE(SUM(offer_price_gbp), 0)::text AS total_offer_value
          FROM listing_offers
          WHERE seller_id = $1 AND status = 'pending' AND expires_at > NOW()
        `,
          [sellerId],
        );
        const offerCount = parseInt(offersResult.rows[0]?.count ?? '0', 10) || 0;
        const nearestExpiry = offersResult.rows[0]?.nearest_expiry ?? null;
        const totalOfferValue = parseFloat(offersResult.rows[0]?.total_offer_value ?? '0') || 0;

        if (offerCount > 0) {
          tasks.push({
            id: `respond_offer_${sellerId}`,
            type: 'respond_offer',
            priority: 'high',
            count: offerCount,
            dueAt: nearestExpiry,
            consequence: { kind: 'money', amountGbp: totalOfferValue },
            actionRoute: 'Inbox',
            actionLabel: 'Review offers',
          });
        }
        freshness.offers = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.offers = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.offers = { asOf: generatedAt, state: 'unavailable' };
    }

    // Task 3: Listing issues (active listings missing required fields)
    try {
      const listingIssuesResult = await readDb.query<{ count: string }>(
        `
        SELECT COUNT(*) AS count
        FROM listings
        WHERE seller_id = $1
          AND status = 'active'
          AND (title IS NULL OR title = '' OR price_gbp IS NULL OR price_gbp <= 0 OR image_url IS NULL)
      `,
        [sellerId],
      );
      const issueCount = parseInt(listingIssuesResult.rows[0]?.count ?? '0', 10) || 0;
      if (issueCount > 0) {
        tasks.push({
          id: `listing_issue_${sellerId}`,
          type: 'listing_issue',
          priority: 'normal',
          count: issueCount,
          dueAt: null,
          consequence: { kind: 'listing' },
          actionRoute: 'InventoryManagement',
          actionLabel: 'Fix listings',
        });
      }
    } catch {
      // Non-fatal — listings freshness already set
    }

    // Task 4: Payout reserve holds (money held, eligible for release)
    if (reserveHoldsAvailable) {
      try {
        const holdsResult = await readDb.query<{
          count: string;
          held_total: string | null;
          oldest_eligible: string | null;
        }>(
          `
          SELECT
            COUNT(*) AS count,
            COALESCE(SUM(held_amount_gbp), 0)::text AS held_total,
            MIN(release_eligible_at)::text AS oldest_eligible
          FROM payout_reserve_holds
          WHERE user_id = $1 AND released_at IS NULL AND release_eligible_at <= NOW()
        `,
          [sellerId],
        );
        const holdCount = parseInt(holdsResult.rows[0]?.count ?? '0', 10) || 0;
        const heldTotal = parseFloat(holdsResult.rows[0]?.held_total ?? '0') || 0;
        if (holdCount > 0) {
          tasks.push({
            id: `payout_hold_${sellerId}`,
            type: 'payout_hold',
            priority: 'low',
            count: holdCount,
            dueAt: null,
            consequence: { kind: 'money', amountGbp: heldTotal },
            actionRoute: 'Wallet',
            actionLabel: 'View holds',
          });
        }
        freshness.payout_holds = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.payout_holds = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.payout_holds = { asOf: generatedAt, state: 'unavailable' };
    }

    // ── Sort tasks by priority ──
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
    tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // ── Task summary ──
    const taskSummary: Record<string, number> = {};
    for (const task of tasks) {
      taskSummary[task.type] = task.count;
    }

    // ── Money posture (from ledger/wallet) ──
    // Per Report 17: money needs state, reason and action — not one "earnings"
    // number. This queries the same ledger_entries / payout_reserve_holds
    // tables as the wallet balances endpoint, so the Hub and Wallet screen
    // always agree.
    let money: SellerOverviewV2['money'] = null;
    if (ledgerAvailable) {
      try {
        // Available: seller_payable credits minus debits
        const availableResult = await readDb.query<{ available_gbp: string }>(
          `
          SELECT COALESCE(SUM(
            CASE WHEN direction = 'credit' THEN amount_gbp ELSE -amount_gbp END
          ), 0)::text AS available_gbp
          FROM ledger_entries
          WHERE account_id = (
            SELECT id FROM ledger_accounts
            WHERE owner_type = 'user' AND owner_id = $1 AND account_code = 'seller_payable'
            LIMIT 1
          )
        `,
          [sellerId],
        );
        const availableGbp = Number(availableResult.rows[0]?.available_gbp ?? '0');

        // Processing: orders paid/shipped/delivered but escrow not yet released
        const pendingResult = await readDb.query<{ pending_gbp: string }>(
          `
          SELECT COALESCE(SUM(o.subtotal_gbp), 0)::text AS pending_gbp
          FROM orders o
          WHERE o.seller_id = $1
            AND o.status IN ('paid', 'shipped', 'delivered')
            AND o.escrow_released_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM ledger_entries le
              WHERE le.source_id = o.id
                AND le.line_type = 'seller_payable_release'
                AND le.direction = 'credit'
            )
        `,
          [sellerId],
        );
        const processingGbp = Number(pendingResult.rows[0]?.pending_gbp ?? '0');

        // Held: reserve holds not yet released
        let heldGbp = 0;
        if (reserveHoldsAvailable) {
          const reserveResult = await readDb.query<{ held_gbp: string }>(
            `
            SELECT COALESCE(SUM(held_amount_gbp), 0)::text AS held_gbp
            FROM payout_reserve_holds
            WHERE user_id = $1 AND released_at IS NULL
          `,
            [sellerId],
          );
          heldGbp = Number(reserveResult.rows[0]?.held_gbp ?? '0');
        }

        // Next payout: from payout_accounts schedule
        let nextPayoutAt: string | null = null;
        if (payoutAvailable) {
          const payoutResult = await readDb.query<{ next_scheduled_payout_at: string | null }>(
            `SELECT next_scheduled_payout_at FROM payout_accounts WHERE user_id = $1 LIMIT 1`,
            [sellerId],
          );
          nextPayoutAt = payoutResult.rows[0]?.next_scheduled_payout_at ?? null;
        }

        money = {
          currency: 'GBP',
          availableGbp: Math.max(0, Math.round(availableGbp * 100) / 100),
          processingGbp: Math.round(processingGbp * 100) / 100,
          heldGbp: Math.round(heldGbp * 100) / 100,
          nextPayoutAt,
        };
        freshness.money = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.money = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.money = { asOf: generatedAt, state: 'unavailable' };
    }

    // ── Business pulse (30-day, from settled order facts) ──
    // Per Report 17 P0: "revenue" must come from settled order/ledger facts,
    // NOT from listings.price_gbp (asking price). This queries orders.subtotal_gbp
    // for paid/shipped/delivered orders in the last 30 days, and derives
    // refunds and fees from ledger_entries.
    let businessPulse: SellerOverviewV2['businessPulse'] = null;
    if (ordersAvailable) {
      try {
        const [pulseResult, prevPulseResult] = await Promise.all([
          readDb.query<{
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
              AND paid_at >= NOW() - INTERVAL '30 days'
          `,
            [sellerId],
          ),
          // Previous 30-day period for period-over-period comparison
          readDb.query<{
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
              AND paid_at >= NOW() - INTERVAL '60 days'
              AND paid_at < NOW() - INTERVAL '30 days'
          `,
            [sellerId],
          ),
        ]);
        const grossSalesGbp = parseFloat(String(pulseResult.rows[0]?.gross_sales ?? '0')) || 0;
        const orders = parseInt(pulseResult.rows[0]?.orders ?? '0', 10) || 0;
        const prevGrossSalesGbp = parseFloat(String(prevPulseResult.rows[0]?.gross_sales ?? '0')) || 0;
        const prevOrders = parseInt(prevPulseResult.rows[0]?.orders ?? '0', 10) || 0;

        // Refunds and fees from ledger (if available), current + previous period
        let refundsGbp = 0;
        let feesGbp = 0;
        let prevRefundsGbp = 0;
        let prevFeesGbp = 0;
        let completeness: 'complete' | 'partial' = 'complete';
        if (ledgerAvailable) {
          try {
            const [refundsResult, feesResult, prevRefundsResult, prevFeesResult] = await Promise.all([
              readDb.query<{ refunds: string | null }>(
                `
                SELECT COALESCE(SUM(amount_gbp), 0)::text AS refunds
                FROM ledger_entries
                WHERE account_id = (
                  SELECT id FROM ledger_accounts
                  WHERE owner_type = 'user' AND owner_id = $1 AND account_code = 'seller_payable'
                  LIMIT 1
                )
                AND source_type = 'refund'
                AND direction = 'debit'
                AND created_at >= NOW() - INTERVAL '30 days'
              `,
                [sellerId],
              ),
              readDb.query<{ fees: string | null }>(
                `
                SELECT COALESCE(SUM(amount_gbp), 0)::text AS fees
                FROM ledger_entries
                WHERE account_id = (
                  SELECT id FROM ledger_accounts
                  WHERE owner_type = 'user' AND owner_id = $1 AND account_code = 'seller_payable'
                  LIMIT 1
                )
                AND source_type = 'order_payment'
                AND direction = 'debit'
                AND line_type = 'platform_fee'
                AND created_at >= NOW() - INTERVAL '30 days'
              `,
                [sellerId],
              ),
              // Previous-period refunds
              readDb.query<{ refunds: string | null }>(
                `
                SELECT COALESCE(SUM(amount_gbp), 0)::text AS refunds
                FROM ledger_entries
                WHERE account_id = (
                  SELECT id FROM ledger_accounts
                  WHERE owner_type = 'user' AND owner_id = $1 AND account_code = 'seller_payable'
                  LIMIT 1
                )
                AND source_type = 'refund'
                AND direction = 'debit'
                AND created_at >= NOW() - INTERVAL '60 days'
                AND created_at < NOW() - INTERVAL '30 days'
              `,
                [sellerId],
              ),
              // Previous-period fees
              readDb.query<{ fees: string | null }>(
                `
                SELECT COALESCE(SUM(amount_gbp), 0)::text AS fees
                FROM ledger_entries
                WHERE account_id = (
                  SELECT id FROM ledger_accounts
                  WHERE owner_type = 'user' AND owner_id = $1 AND account_code = 'seller_payable'
                  LIMIT 1
                )
                AND source_type = 'order_payment'
                AND direction = 'debit'
                AND line_type = 'platform_fee'
                AND created_at >= NOW() - INTERVAL '60 days'
                AND created_at < NOW() - INTERVAL '30 days'
              `,
                [sellerId],
              ),
            ]);
            refundsGbp = parseFloat(String(refundsResult.rows[0]?.refunds ?? '0')) || 0;
            feesGbp = parseFloat(String(feesResult.rows[0]?.fees ?? '0')) || 0;
            prevRefundsGbp = parseFloat(String(prevRefundsResult.rows[0]?.refunds ?? '0')) || 0;
            prevFeesGbp = parseFloat(String(prevFeesResult.rows[0]?.fees ?? '0')) || 0;
          } catch {
            completeness = 'partial';
          }
        } else {
          completeness = 'partial';
        }

        const netSalesGbp = grossSalesGbp - refundsGbp - feesGbp;
        const prevNetSalesGbp = prevGrossSalesGbp - prevRefundsGbp - prevFeesGbp;

        // Period-over-period percentage change.
        // - Null when previous period was zero (avoids division-by-zero).
        // - Null when previous period was negative (refunds > revenue) — the
        //   percentage sign is semantically meaningless for negative bases.
        // - Clamped to ±999% to prevent multi-thousand-percent displays from
        //   tiny previous-period denominators.
        const clampPct = (pct: number): number =>
          Math.min(Math.max(Math.round(pct * 10) / 10, -999), 999);

        const netSalesPrevPeriodPct =
          prevNetSalesGbp > 0
            ? clampPct(((netSalesGbp - prevNetSalesGbp) / prevNetSalesGbp) * 100)
            : null;
        const ordersPrevPeriodPct =
          prevOrders > 0
            ? clampPct(((orders - prevOrders) / prevOrders) * 100)
            : null;

        businessPulse = {
          period: '30d',
          grossSalesGbp: Math.round(grossSalesGbp * 100) / 100,
          refundsGbp: Math.round(refundsGbp * 100) / 100,
          feesGbp: Math.round(feesGbp * 100) / 100,
          netSalesGbp: Math.round(netSalesGbp * 100) / 100,
          orders,
          completeness,
          netSalesPrevPeriodPct,
          ordersPrevPeriodPct,
        };
        freshness.business_pulse = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.business_pulse = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.business_pulse = { asOf: generatedAt, state: 'unavailable' };
    }

    const overview: SellerOverviewV2 = {
      schemaVersion: 2,
      generatedAt,
      freshness,
      tasks,
      topTask: tasks[0] ?? null,
      taskSummary,
      money,
      inventory: {
        active: parseInt(inventory.active, 10) || 0,
        drafts: parseInt(inventory.drafts, 10) || 0,
        paused: parseInt(inventory.paused, 10) || 0,
        sold: parseInt(inventory.sold, 10) || 0,
        listedValueGbp: parseFloat(String(inventory.active_value ?? '0')) || 0,
      },
      businessPulse,
    };

    return { ok: true, overview };
  });

  // ════════════════════════════════════════════════════════════════════════
  // GET /seller-hub/inventory/totals — uncapped status counts for inventory
  //
  // Per P0: status totals (active, sold, paused, draft) must come from a
  // server-side aggregate, not from counting a client-side subset capped at
  // 200. This lightweight endpoint returns only the counts so inventory
  // screens can show truthful totals without loading every listing row.
  // ════════════════════════════════════════════════════════════════════════
  app.get('/seller-hub/inventory/totals', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const sellerId = request.authUser.userId;

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
      [sellerId],
    );
    const row = inventoryResult.rows[0] ?? { active: '0', drafts: '0', paused: '0', sold: '0', active_value: '0' };

    return {
      ok: true,
      totals: {
        active: parseInt(row.active, 10) || 0,
        drafts: parseInt(row.drafts, 10) || 0,
        paused: parseInt(row.paused, 10) || 0,
        sold: parseInt(row.sold, 10) || 0,
        listedValueGbp: parseFloat(String(row.active_value ?? '0')) || 0,
      },
    };
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /seller-hub/batch-command — durable batch operations with per-item
  // receipts
  //
  // Per Report 17 P0: replaces Promise.all of individual PATCH/DELETE calls
  // that can partially commit on the server while the client rolls the entire
  // batch back visually. This endpoint executes each item independently and
  // returns a per-item receipt so the UI can render truthful partial results.
  //
  // Partial failure is a first-class truthful result. The UI never restores
  // a committed row because a sibling failed.
  // ════════════════════════════════════════════════════════════════════════
  app.post('/seller-hub/batch-command', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const sellerId = request.authUser.userId;

    const body = request.body as any;
    if (!body || typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length < 4) {
      reply.code(400);
      return { ok: false, error: 'idempotencyKey is required (min 4 chars)' };
    }
    if (!['pause', 'resume', 'delete'].includes(body.command)) {
      reply.code(400);
      return { ok: false, error: 'command must be pause, resume, or delete' };
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      reply.code(400);
      return { ok: false, error: 'items must be a non-empty array of { listingId }' };
    }
    if (body.items.length > 200) {
      reply.code(400);
      return { ok: false, error: 'Maximum 200 items per batch' };
    }

    const command: 'pause' | 'resume' | 'delete' = body.command;
    const items: BatchCommandItem[] = body.items;
    const idempotencyKey: string = body.idempotencyKey;
    const requestHash: string =
      typeof body.requestHash === 'string' && body.requestHash.length > 0
        ? body.requestHash
        : createHash('sha256')
            .update(JSON.stringify({ command, items }))
            .digest('hex');

    // ── Idempotency replay ────────────────────────────────────────────
    // If a batch job with this idempotency key already exists, return its
    // durable receipt. This makes the endpoint safe to retry after a
    // network timeout: the client re-sends the same key and gets back the
    // exact same per-item outcomes.
    const existingJob = await db.query<{
      id: string;
      request_hash: string;
      status: string;
      applied_count: number;
      rejected_count: number;
      conflict_count: number;
      total_items: number;
    }>(
      `SELECT id, request_hash, status, applied_count, rejected_count,
              conflict_count, total_items
         FROM listing_batch_jobs
        WHERE idempotency_key = $1
        LIMIT 1`,
      [idempotencyKey],
    );

    if (existingJob.rowCount && existingJob.rows.length > 0) {
      const job = existingJob.rows[0];
      if (job.request_hash !== requestHash) {
        reply.code(409);
        return {
          ok: false,
          error: 'idempotencyKey was already used with a different request body',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        };
      }
      // Replay the persisted per-item results.
      const persistedItems = await db.query<{
        listing_id: string;
        status: string;
        reason: string | null;
        current_status: string | null;
      }>(
        `SELECT listing_id, status, reason, current_status
           FROM listing_batch_items
          WHERE batch_job_id = $1
          ORDER BY created_at`,
        [job.id],
      );
      const results: BatchCommandResult[] = persistedItems.rows.map((row) => ({
        listingId: row.listing_id,
        state: row.status as BatchCommandResult['state'],
        reason: row.reason ?? undefined,
        currentStatus: row.current_status ?? undefined,
      }));
      const hasFailures = results.some((r) => r.state !== 'applied');
      const response: BatchCommandResponse = {
        ok: true,
        batchId: job.id,
        idempotencyKey,
        state: hasFailures ? 'partial' : 'complete',
        results,
        appliedCount: job.applied_count,
        rejectedCount: job.rejected_count,
        conflictCount: job.conflict_count,
      };
      return response;
    }

    // ── Create the durable batch job row ──────────────────────────────
    const batchId = randomUUID();
    await db.query(
      `INSERT INTO listing_batch_jobs
         (id, idempotency_key, request_hash, seller_id, command, status, total_items)
       VALUES ($1, $2, $3, $4, $5, 'processing', $6)`,
      [batchId, idempotencyKey, requestHash, sellerId, command, items.length],
    );

    const results: BatchCommandResult[] = [];
    let appliedCount = 0;
    let rejectedCount = 0;
    let conflictCount = 0;

    // Execute each item independently through the canonical listing command
    // service. A failure on one item does NOT affect the others — this is
    // the core correctness fix. The canonical service handles the row lock,
    // transition validation, search index side effects, offer cancellation,
    // and audit recording.
    for (const item of items) {
      // Ownership is verified BEFORE executing the command to prevent
      // a seller from mutating another seller's listing. The canonical
      // service is generic (no sellerId parameter), so we enforce the
      // authorization boundary here, prior to any mutation.
      const ownerCheck = await db.query<{ seller_id: string }>(
        `SELECT seller_id FROM listings WHERE id = $1 LIMIT 1`,
        [item.listingId],
      );
      if (!ownerCheck.rows[0]) {
        results.push({
          listingId: item.listingId,
          state: 'rejected',
          newStatus: undefined,
          reason: 'not_found',
          currentStatus: undefined,
        });
        rejectedCount += 1;
        await db.query(
          `INSERT INTO listing_batch_items
             (job_id, listing_id, state, reason, current_status, new_status)
           VALUES ($1, $2, 'rejected', 'not_found', NULL, NULL)`,
          [batchId, item.listingId],
        );
        continue;
      }
      if (ownerCheck.rows[0].seller_id !== sellerId) {
        results.push({
          listingId: item.listingId,
          state: 'rejected',
          newStatus: undefined,
          reason: 'forbidden',
          currentStatus: undefined,
        });
        rejectedCount += 1;
        await db.query(
          `INSERT INTO listing_batch_items
             (job_id, listing_id, state, reason, current_status, new_status)
           VALUES ($1, $2, 'rejected', 'forbidden', NULL, NULL)`,
          [batchId, item.listingId],
        );
        continue;
      }

      const listingCommand: ListingCommand = {
        type: command,
        listingId: item.listingId,
        actorId: sellerId,
      } as ListingCommand;

      const result = await executeListingCommand(db, listingCommand);

      let state: BatchCommandResult['state'];
      let reason: string | undefined;
      let currentStatus: string | undefined;
      let newStatus: string | undefined;

      if (result.status === 'applied') {
        state = 'applied';
        newStatus = result.newStatus;
        appliedCount += 1;
      } else if (result.status === 'rejected') {
        state = 'rejected';
        reason = result.reason;
        currentStatus = result.currentStatus;
        rejectedCount += 1;
      } else {
        state = 'conflict';
        reason = result.reason;
        currentStatus = result.currentStatus;
        conflictCount += 1;
      }

      results.push({
        listingId: item.listingId,
        state,
        newStatus,
        reason,
        currentStatus,
      });

      // Persist the per-item outcome so a replay returns the same receipt.
      await db.query(
        `INSERT INTO listing_batch_items
           (batch_job_id, listing_id, status, reason, current_status)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          batchId,
          item.listingId,
          state,
          reason ?? null,
          currentStatus ?? newStatus ?? null,
        ],
      );
    }

    // ── Finalize the batch job ────────────────────────────────────────
    await db.query(
      `UPDATE listing_batch_jobs
          SET status = 'completed',
              applied_count = $2,
              rejected_count = $3,
              conflict_count = $4,
              completed_at = NOW()
        WHERE id = $1`,
      [batchId, appliedCount, rejectedCount, conflictCount],
    );

    const hasFailures = results.some((r) => r.state !== 'applied');
    const response: BatchCommandResponse = {
      ok: true,
      batchId,
      idempotencyKey,
      state: hasFailures ? 'partial' : 'complete',
      results,
      appliedCount,
      rejectedCount,
      conflictCount,
    };

    return response;
  });
};
