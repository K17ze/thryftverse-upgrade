import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import {
  executeListingCommand,
  type ListingCommand,
} from '../lib/listingCommandService.js';
import {
  applyListingFieldPatch,
  listingEditPatchSchema,
} from '../lib/listingPatch.js';
import { isEffectivelyAway } from '../lib/sellerAway.js';

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
  type:
    | 'ship_order'
    | 'respond_offer'
    | 'listing_issue'
    | 'catalogue_awaiting'
    | 'verification_demand'
    | 'payout_hold';
  priority: 'critical' | 'high' | 'normal' | 'low';
  count: number;
  dueAt: string | null;
  consequence: { kind: 'money' | 'buyer' | 'trust' | 'listing'; amountGbp?: number } | null;
  actionRoute: string;
  /**
   * Optional deep-link params for the action route — emitted so a task tap
   * lands on the right scope (e.g. MyOrders seller/needs-action, the real
   * import batch) instead of the route's default surface.
   */
  actionParams?: Record<string, unknown>;
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
  /**
   * Seller trust posture, projected from the backend-owned seller_trust row
   * (response_rate, ship_within_days, total_sales, positive_rating_pct).
   * Null when the seller has no trust row yet — the UI renders nothing
   * (fail-closed: no badge without a backend row). Individual signals may
   * still be null; the UI hides per-signal chips it cannot evidence.
   */
  trust: {
    responseRatePct: number | null;
    avgDispatchDays: number | null;
    totalSales: number;
    positiveRatingPct: number | null;
    /**
     * When the projection was last recomputed (seller_trust.calculated_at).
     * Null when unknown. The UI qualifies signals older than 36h as stale.
     */
    calculatedAt: string | null;
  } | null;
  /**
   * Near-winners: active listings with real 30-day view volume and zero
   * 30-day sales. Empty array means none found (not an error); null means
   * the interactions source is unavailable. Highest views first, max 4.
   */
  opportunities: {
    listingId: string;
    title: string;
    imageUrl: string | null;
    priceGbp: number | null;
    views30d: number;
  }[] | null;
  /**
   * Seller's own away state (users.holiday_mode + holiday_mode_until +
   * away_message), evaluated through the shared isEffectivelyAway
   * definition — the same predicate commerce gates use. `active` is only
   * true while the pause is effective; a past return date already expired
   * it. Null when the source row could not be read.
   */
  away: {
    active: boolean;
    until: string | null;
    message: string | null;
  } | null;
}

// ── Batch command types ──

type BatchCommand = 'pause' | 'resume' | 'delete' | 'edit';

interface BatchCommandItem {
  listingId: string;
  /** 'edit' command only — a ListingEditPatch field subset. */
  patch?: unknown;
}

interface BatchCommandResult {
  listingId: string;
  state: 'applied' | 'rejected' | 'conflict';
  newStatus?: string;
  reason?: string;
  currentStatus?: string;
  /** 'edit' command only — the field keys actually written. */
  appliedFields?: string[];
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
      interactionsAvailable,
      importBatchesAvailable,
      verificationDemandsAvailable,
    ] = await Promise.all([
      tableExists(readDb, 'orders'),
      tableExists(readDb, 'listing_offers'),
      tableExists(readDb, 'ledger_entries'),
      tableExists(readDb, 'payout_accounts'),
      tableExists(readDb, 'seller_trust'),
      tableExists(readDb, 'payout_reserve_holds'),
      tableExists(readDb, 'interactions'),
      tableExists(readDb, 'catalog_import_batches'),
      tableExists(readDb, 'coown_verification_demands'),
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

    // ── Seller trust (for ship_within_days) + holiday-mode window ──
    // holiday_mode_until/since feed the dispatch-deadline shift below: an
    // order paid while the seller is away is due max(paid_at, return date)
    // + handling days. Orders paid BEFORE the seller went away keep their
    // original paid_at + handling deadline — going away does not excuse
    // orders already sold (lib/sellerAway.ts).
    let shipWithinDays: number | null = null;
    let holidayModeUntil: string | null = null;
    let holidayModeSince: string | null = null;
    let away: SellerOverviewV2['away'] = null;
    if (trustAvailable) {
      try {
        const trustResult = await readDb.query<{
          ship_within_days: number | null;
          holiday_mode: boolean | null;
          holiday_mode_until: string | null;
          holiday_mode_since: string | null;
          away_message: string | null;
        }>(
          `SELECT st.ship_within_days, u.holiday_mode_until, u.holiday_mode_since,
                  u.holiday_mode, u.away_message
           FROM users u
           LEFT JOIN seller_trust st ON st.user_id = u.id
           WHERE u.id = $1 LIMIT 1`,
          [sellerId],
        );
        shipWithinDays = trustResult.rows[0]?.ship_within_days ?? null;
        holidayModeUntil = trustResult.rows[0]?.holiday_mode_until ?? null;
        holidayModeSince = trustResult.rows[0]?.holiday_mode_since ?? null;
        // Same effective-away predicate the commerce gates use (lib/
        // sellerAway.ts) — a past return date already expired the pause, so
        // the hub never shows a stale away row. until/message are only
        // meaningful while away is active (mirrors fetchSellerAwayState).
        const awayActive = isEffectivelyAway(
          trustResult.rows[0]?.holiday_mode,
          holidayModeUntil,
        );
        away = {
          active: awayActive,
          until: awayActive ? holidayModeUntil : null,
          message: awayActive ? (trustResult.rows[0]?.away_message ?? null) : null,
        };
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
            MIN(o.paid_at)::text AS oldest_paid,
            COUNT(*) FILTER (
              WHERE o.paid_at IS NOT NULL
                AND
                -- Dispatch base: the return date only rebases an order that
                -- was paid inside the away window (since <= paid_at <=
                -- until). A NULL since (rows predating migration 293)
                -- counts as "away since before the payment". Orders paid
                -- before the seller left keep paid_at — the pause never
                -- excuses a deadline that was already running.
                CASE
                  WHEN u.holiday_mode_until IS NOT NULL
                       AND o.paid_at <= u.holiday_mode_until
                       AND (u.holiday_mode_since IS NULL
                            OR o.paid_at >= u.holiday_mode_since)
                  THEN u.holiday_mode_until
                  ELSE o.paid_at
                END
                + COALESCE(st.ship_within_days, 3) * INTERVAL '1 day' < NOW()
            ) AS overdue_count
          FROM orders o
          LEFT JOIN users u ON u.id = o.seller_id
          LEFT JOIN seller_trust st ON st.user_id = o.seller_id
          WHERE o.seller_id = $1 AND o.status = 'paid'
        `,
          [sellerId],
        );
        const shipCount = parseInt(shipOrdersResult.rows[0]?.count ?? '0', 10) || 0;
        const overdueCount = parseInt(shipOrdersResult.rows[0]?.overdue_count ?? '0', 10) || 0;
        const oldestPaid = shipOrdersResult.rows[0]?.oldest_paid ?? null;

        if (shipCount > 0) {
          // Compute the real dispatch deadline:
          //   return-date + handling when the oldest order was paid inside
          //   the away window; paid_at + handling otherwise. A seller away
          //   until R cannot ship before R — but an order paid before they
          //   left keeps its original deadline (going away does not excuse
          //   orders already sold). A NULL since (pre-migration anchor)
          //   counts as "away since before the payment".
          let dueAt: string | null = null;
          if (oldestPaid) {
            const handlingDays = shipWithinDays ?? 3;
            const paidDate = new Date(oldestPaid);
            const returnDate = holidayModeUntil ? new Date(holidayModeUntil) : null;
            const awaySince = holidayModeSince ? new Date(holidayModeSince) : null;
            const paidWhileAway = returnDate !== null
              && paidDate.getTime() <= returnDate.getTime()
              && (awaySince === null || paidDate.getTime() >= awaySince.getTime());
            const base = paidWhileAway && returnDate ? returnDate : paidDate;
            const due = new Date(base.getTime());
            due.setDate(due.getDate() + handlingDays);
            dueAt = due.toISOString();
          }

          tasks.push({
            id: `ship_order_${sellerId}`,
            type: 'ship_order',
            priority: overdueCount > 0 ? 'critical' : 'high',
            count: shipCount,
            dueAt,
            consequence: { kind: 'trust', amountGbp: undefined },
            actionRoute: 'MyOrders',
            // Deep-link into the seller-side "needs action" scope — the
            // default MyOrders surface mixes buying + selling on 'all'.
            actionParams: { tab: 'selling', classification: 'needs_action' },
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
            // The Offers surface (received segment) is where a seller can
            // actually accept/decline/counter — not the unfiltered Inbox.
            actionRoute: 'Offers',
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

    // Task 5: Catalogue import awaiting — a non-terminal import batch is
    // seller work (a paused pipeline, a batch needing review) that was
    // previously invisible on the hub. The task carries the OLDEST open
    // batch's real id so the tap lands on CatalogImportProgress directly.
    if (importBatchesAvailable) {
      try {
        const batchesResult = await readDb.query<{
          count: string;
          oldest_id: string | null;
          oldest_created: string | null;
          awaiting_seller_count: string;
        }>(
          `
          SELECT
            COUNT(*) AS count,
            (ARRAY_AGG(id ORDER BY created_at ASC))[1] AS oldest_id,
            MIN(created_at)::text AS oldest_created,
            COUNT(*) FILTER (WHERE status = 'awaiting_seller') AS awaiting_seller_count
          FROM catalog_import_batches
          WHERE user_id = $1 AND status NOT IN ('completed', 'cancelled')
        `,
          [sellerId],
        );
        const batchCount = parseInt(batchesResult.rows[0]?.count ?? '0', 10) || 0;
        const oldestBatchId = batchesResult.rows[0]?.oldest_id ?? null;
        const oldestCreated = batchesResult.rows[0]?.oldest_created ?? null;
        const awaitingSellerCount = parseInt(batchesResult.rows[0]?.awaiting_seller_count ?? '0', 10) || 0;

        if (batchCount > 0 && oldestBatchId) {
          // Priority by age: an open batch older than 7 days (or one the
          // saga explicitly parked on 'awaiting_seller') outranks routine
          // listing hygiene; a fresh in-flight batch stays quiet.
          const ageDays = oldestCreated
            ? (Date.now() - new Date(oldestCreated).getTime()) / (1000 * 60 * 60 * 24)
            : 0;
          tasks.push({
            id: `catalogue_awaiting_${oldestBatchId}`,
            type: 'catalogue_awaiting',
            priority: awaitingSellerCount > 0 || ageDays >= 7 ? 'high' : 'normal',
            count: batchCount,
            dueAt: null,
            consequence: { kind: 'listing' },
            actionRoute: 'CatalogImportProgress',
            actionParams: { batchId: oldestBatchId },
            actionLabel: 'Review import',
          });
        }
        freshness.catalog_imports = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.catalog_imports = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.catalog_imports = { asOf: generatedAt, state: 'unavailable' };
    }

    // Task 6: Verification demands — a pending coown_verification_demands
    // row is a legal-grade deadline: silence triggers recourse. Emit it as
    // a hub task so it surfaces outside notification routing. The liable
    // seller is the custodian on the asset's recourse agreement
    // (coown_recourse_agreements.seller_id — migration 101).
    if (verificationDemandsAvailable) {
      try {
        const demandsResult = await readDb.query<{
          count: string;
          nearest_deadline: string | null;
          overdue_count: string;
        }>(
          `
          SELECT
            COUNT(*) AS count,
            MIN(d.deadline)::text AS nearest_deadline,
            COUNT(*) FILTER (WHERE d.deadline < NOW()) AS overdue_count
          FROM coown_verification_demands d
          JOIN coown_recourse_agreements ra ON ra.asset_id = d.asset_id
          WHERE ra.seller_id = $1 AND d.status = 'pending'
        `,
          [sellerId],
        );
        const demandCount = parseInt(demandsResult.rows[0]?.count ?? '0', 10) || 0;
        const overdueDemands = parseInt(demandsResult.rows[0]?.overdue_count ?? '0', 10) || 0;
        // Normalise Postgres ::text output to ISO-8601 — the client's due
        // label parser only accepts a parseable date, and an invalid date
        // must degrade to no label rather than a thrown render.
        const nearestDeadlineRaw = demandsResult.rows[0]?.nearest_deadline ?? null;
        const nearestDeadlineDate = nearestDeadlineRaw ? new Date(nearestDeadlineRaw) : null;
        const nearestDeadline =
          nearestDeadlineDate && !Number.isNaN(nearestDeadlineDate.getTime())
            ? nearestDeadlineDate.toISOString()
            : null;

        if (demandCount > 0) {
          tasks.push({
            id: `verification_demand_${sellerId}`,
            type: 'verification_demand',
            priority: overdueDemands > 0 ? 'critical' : 'high',
            count: demandCount,
            dueAt: nearestDeadline,
            consequence: { kind: 'trust' },
            actionRoute: 'SellerVerification',
            actionLabel: 'Respond to verification',
          });
        }
        freshness.verification_demands = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.verification_demands = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.verification_demands = { asOf: generatedAt, state: 'unavailable' };
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
            AND o.status IN ('paid', 'shipped', 'delivered', 'completed')
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
              AND status IN ('paid', 'shipped', 'delivered', 'completed')
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
              AND status IN ('paid', 'shipped', 'delivered', 'completed')
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

    // ── Trust posture (backend-owned seller_trust projection) ──
    // Fail-closed: no row → trust is null and the UI renders no trust UI.
    // A row with null columns still returns the row; the UI hides only the
    // signals it cannot evidence. Freshness is real: it derives from the
    // row's calculated_at (daily recompute cadence + 12h tolerance), never
    // from request time — a stale projection is labelled stale, not fresh.
    let trust: SellerOverviewV2['trust'] = null;
    if (trustAvailable) {
      try {
        const trustResult = await readDb.query<{
          response_rate: string | null;
          ship_within_days: string | null;
          total_sales: string | null;
          positive_rating_pct: string | null;
          calculated_at: string | null;
        }>(
          `
          SELECT response_rate::text, ship_within_days::text,
                 total_sales::text, positive_rating_pct::text,
                 calculated_at::text
          FROM seller_trust
          WHERE user_id = $1
          LIMIT 1
        `,
          [sellerId],
        );
        const row = trustResult.rows[0];
        if (row) {
          const toNum = (v: string | null): number | null => {
            if (v == null) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          trust = {
            responseRatePct: toNum(row.response_rate),
            avgDispatchDays: toNum(row.ship_within_days),
            totalSales: Math.max(0, parseInt(row.total_sales ?? '0', 10) || 0),
            positiveRatingPct: toNum(row.positive_rating_pct),
            calculatedAt: row.calculated_at,
          };
          const ageMs = row.calculated_at ? Date.now() - new Date(row.calculated_at).getTime() : NaN;
          freshness.trust = {
            asOf: row.calculated_at ?? generatedAt,
            state: Number.isFinite(ageMs) && ageMs <= 36 * 60 * 60 * 1000 ? 'fresh' : 'stale',
          };
        } else {
          freshness.trust = { asOf: generatedAt, state: 'unavailable' };
        }
      } catch {
        freshness.trust = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.trust = { asOf: generatedAt, state: 'unavailable' };
    }

    // ── Near-winners (Etsy 2026 playbook: high views + zero sales) ──
    // Active listings with ≥10 qualified views in 30d and no settled sale
    // in 30d, highest views first. Empty array = none found (render nothing);
    // null = interactions source unavailable (render nothing, no lecture).
    let opportunities: SellerOverviewV2['opportunities'] = null;
    if (interactionsAvailable && ordersAvailable) {
      try {
        const oppResult = await readDb.query<{
          id: string;
          title: string;
          image_url: string | null;
          price_gbp: string | null;
          views: string;
        }>(
          `
          SELECT l.id, l.title, l.image_url, l.price_gbp::text,
                 COUNT(i.id) FILTER (
                   WHERE i.action IN ('view', 'qualified_detail_view')
                     AND i.created_at >= NOW() - INTERVAL '30 days'
                 ) AS views
          FROM listings l
          LEFT JOIN interactions i ON i.listing_id = l.id
          LEFT JOIN orders o ON o.listing_id = l.id
            AND o.status IN ('paid', 'shipped', 'delivered', 'completed')
            AND o.paid_at >= NOW() - INTERVAL '30 days'
          WHERE l.seller_id = $1 AND l.status = 'active'
          GROUP BY l.id
          HAVING COUNT(i.id) FILTER (
                   WHERE i.action IN ('view', 'qualified_detail_view')
                     AND i.created_at >= NOW() - INTERVAL '30 days'
                 ) >= 10
             AND COUNT(o.id) = 0
          ORDER BY views DESC
          LIMIT 4
        `,
          [sellerId],
        );
        opportunities = oppResult.rows.map((r) => ({
          listingId: r.id,
          title: r.title,
          imageUrl: r.image_url,
          priceGbp: r.price_gbp != null ? Number(r.price_gbp) : null,
          views30d: parseInt(r.views ?? '0', 10) || 0,
        }));
        freshness.opportunities = { asOf: generatedAt, state: 'fresh' };
      } catch {
        freshness.opportunities = { asOf: generatedAt, state: 'unavailable' };
      }
    } else {
      freshness.opportunities = { asOf: generatedAt, state: 'unavailable' };
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
      trust,
      opportunities,
      away,
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
    if (!['pause', 'resume', 'delete', 'edit'].includes(body.command)) {
      reply.code(400);
      return { ok: false, error: 'command must be pause, resume, delete, or edit' };
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      reply.code(400);
      return { ok: false, error: 'items must be a non-empty array of { listingId, patch? }' };
    }
    if (body.items.length > 200) {
      reply.code(400);
      return { ok: false, error: 'Maximum 200 items per batch' };
    }

    const command: BatchCommand = body.command;
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
        detail: { appliedFields?: string[] } | null;
      }>(
        `SELECT listing_id, status, reason, current_status, detail
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
        appliedFields: row.detail?.appliedFields ?? undefined,
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

    // ── Batch ownership check ─────────────────────────────────────────
    // Fetch all listing ownership in a single query instead of per-item
    // round-trips. This reduces N+1 from 200 queries to 1.
    const listingIds = items.map((i) => i.listingId);
    const ownershipResult = await db.query<{ id: string; seller_id: string }>(
      `SELECT id, seller_id FROM listings WHERE id = ANY($1)`,
      [listingIds],
    );
    const ownershipMap = new Map<string, string>();
    for (const row of ownershipResult.rows) {
      ownershipMap.set(row.id, row.seller_id);
    }

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
      const ownerSellerId = ownershipMap.get(item.listingId);
      if (!ownerSellerId) {
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
             (batch_job_id, listing_id, status, reason, current_status)
           VALUES ($1, $2, 'rejected', 'not_found', NULL)`,
          [batchId, item.listingId],
        );
        continue;
      }
      if (ownerSellerId !== sellerId) {
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
             (batch_job_id, listing_id, status, reason, current_status)
           VALUES ($1, $2, 'rejected', 'forbidden', NULL)`,
          [batchId, item.listingId],
        );
        continue;
      }

      let state: BatchCommandResult['state'];
      let reason: string | undefined;
      let currentStatus: string | undefined;
      let newStatus: string | undefined;
      let appliedFields: string[] | undefined;

      if (command === 'edit') {
        // Field edit — same allowed-field whitelist as PATCH
        // /listings/:listingId (status and cover media excluded: lifecycle
        // transitions must go through the canonical command service and
        // cover changes require the verified-upload flow).
        const parsed = listingEditPatchSchema.safeParse(item.patch);
        if (!parsed.success) {
          state = 'rejected';
          reason = 'invalid_patch';
          rejectedCount += 1;
        } else {
          const editResult = await applyListingFieldPatch(db, {
            listingId: item.listingId,
            patch: parsed.data,
            actorId: sellerId,
            correlationId: request.id,
          });
          if (editResult.status === 'applied') {
            state = 'applied';
            appliedFields = editResult.appliedFields;
            currentStatus = editResult.currentStatus;
            // A moderation hold can land the listing on 'risk_pending'
            // mid-edit — surface the landing status on the receipt.
            newStatus = editResult.newStatus;
            appliedCount += 1;
          } else if (editResult.status === 'rejected') {
            state = 'rejected';
            reason = editResult.reason;
            currentStatus = editResult.currentStatus;
            rejectedCount += 1;
          } else {
            state = 'conflict';
            reason = editResult.reason;
            currentStatus = editResult.currentStatus;
            conflictCount += 1;
          }
        }
      } else {
        const listingCommand: ListingCommand = {
          type: command,
          listingId: item.listingId,
          actorId: sellerId,
        } as ListingCommand;

        // The command service enforces the publish-risk gate internally for
        // any transition targeting 'active' (e.g. batch resume); forward the
        // request signals so the evaluation sees the same context the
        // single-listing routes do.
        const result = await executeListingCommand(db, listingCommand, undefined, {
          requestContext: {
            headers: request.headers as Record<string, string | string[] | undefined>,
            ip: request.ip,
          },
        });

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
      }

      results.push({
        listingId: item.listingId,
        state,
        newStatus,
        reason,
        currentStatus,
        appliedFields,
      });

      // Persist the per-item outcome so a replay returns the same receipt.
      // `detail` carries the applied-field list for edit receipts.
      await db.query(
        `INSERT INTO listing_batch_items
           (batch_job_id, listing_id, status, reason, current_status, detail)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          batchId,
          item.listingId,
          state,
          reason ?? null,
          currentStatus ?? newStatus ?? null,
          appliedFields ? JSON.stringify({ appliedFields }) : null,
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
