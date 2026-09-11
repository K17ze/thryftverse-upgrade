import { db } from '../db/pool.js';
import { redis } from './redis.js';

// ── Portfolio aggregate projection (B14) ──
//
// Replaces the per-holding N+1 pattern on the portfolio screen with a single
// bounded SQL query that returns every holding plus its mark, provenance,
// sellable units and order-book depth in one round-trip.
//
// The mark basis precedence is:
//   1. last_trade   — most recent settled secondary trade
//   2. reference    — independent appraisal value (appraisal_value_gbp)
//   3. offering     — primary offering price while allocation is still open
//   4. none         — no mark available
//
// This module deliberately does not import from routes or queues. The offering
// / market status projection and the 1ZE reconciliation halt read are
// reproduced locally against the same source-of-truth (schema + Redis key) so
// the projection stays a leaf-level dependency.

export interface PortfolioProjectionRow {
  assetId: string;
  title: string;
  imageUrl: string | null;
  totalUnits: number;
  sellableUnits: number;
  unitPriceGbp: number | null;
  markBasis: 'last_trade' | 'reference' | 'offering' | 'none';
  markTimestamp: string | null;
  markAgeSeconds: number | null;
  marketValueGbp: number | null;
  costBasisGbp: number;
  unrealisedPnlGbp: number | null;
  marketStatus: string;
  offeringStatus: string;
  bestBidGbp: number | null;
  bestAskGbp: number | null;
  bidDepthUnits: number;
  askDepthUnits: number;
  partialLiquidity: boolean;
  lockupEndDate: string | null;
}

export interface PortfolioProjectionResult {
  holdings: PortfolioProjectionRow[];
  partial: boolean;
  error?: string;
}

// ── Lifecycle projection (mirrors coOwn route helpers) ──

type CoOwnOfferingStatus = 'offering' | 'allocated' | 'failed' | 'closed';

function computeOfferingStatus(isOpen: boolean, availableUnits: number): CoOwnOfferingStatus {
  if (isOpen && availableUnits > 0) return 'offering';
  if (isOpen && availableUnits === 0) return 'allocated';
  if (!isOpen && availableUnits > 0) return 'failed';
  return 'closed';
}

type CoOwnMarketStatus = 'pre_market' | 'trading' | 'paused' | 'closed';

function computeMarketStatus(
  offeringStatus: CoOwnOfferingStatus,
  hasExitAction: boolean,
  isReconciliationHalted: boolean
): CoOwnMarketStatus {
  if (hasExitAction) return 'closed';
  if (isReconciliationHalted) return 'paused';
  if (offeringStatus === 'failed') return 'paused';
  if (offeringStatus === 'allocated') return 'trading';
  if (offeringStatus === 'closed') return 'closed';
  return 'pre_market';
}

// ── 1ZE reconciliation halt (mirrors index.ts helper, same Redis key) ──

const ONEZE_MINT_BURN_HALT_REDIS_KEY = 'oneze:mint_burn_halted';

async function readOnezeHaltState(): Promise<boolean> {
  try {
    const raw = await redis.get(ONEZE_MINT_BURN_HALT_REDIS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { halted?: boolean } | null;
    return Boolean(parsed?.halted);
  } catch {
    // Treat decode failure as halted, matching the authoritative implementation.
    return true;
  }
}

// ── Row shape returned by the projection query ──

interface ProjectionDbRow {
  asset_id: string;
  title: string;
  image_url: string | null;
  total_units: string | number;
  reserved_units: string | number;
  last_trade_price_gbp: string | number | null;
  last_trade_at: string | null;
  offering_price_gbp: string | number;
  reference_price_gbp: string | number | null;
  reference_price_at: string | null;
  is_open: boolean;
  available_units: string | number;
  best_bid_gbp: string | number | null;
  best_ask_gbp: string | number | null;
  bid_depth_units: string | number;
  ask_depth_units: string | number;
  has_exit: boolean;
  avg_entry_price_gbp: string | number;
  lockup_end_date: string | null;
}

const PROJECTION_SQL = `
  WITH user_holdings AS (
    SELECT
      h.asset_id,
      h.units_owned,
      h.avg_entry_price_gbp
    FROM coown_holdings h
    WHERE h.user_id = $1
      AND h.units_owned > 0
  ),
  last_trades AS (
    SELECT DISTINCT ON (t.asset_id)
      t.asset_id,
      t.unit_price_gbp,
      t.created_at
    FROM coown_trades t
    JOIN user_holdings uh ON uh.asset_id = t.asset_id
    WHERE t.settlement_status = 'settled'
    ORDER BY t.asset_id, t.created_at DESC, t.id DESC
  ),
  sell_reserved AS (
    SELECT
      r.asset_id,
      COALESCE(SUM(r.reserved_units), 0)::int AS reserved_units
    FROM coown_order_reservations r
    JOIN user_holdings uh ON uh.asset_id = r.asset_id
    WHERE r.user_id = $1
      AND r.side = 'sell'
      AND r.status IN ('active', 'placed')
      AND r.reserved_units > 0
      AND (r.expires_at IS NULL OR r.expires_at > NOW())
    GROUP BY r.asset_id
  ),
  book AS (
    SELECT
      o.asset_id,
      MAX(o.unit_price_gbp) FILTER (WHERE o.side = 'buy') AS best_bid_gbp,
      MIN(o.unit_price_gbp) FILTER (WHERE o.side = 'sell') AS best_ask_gbp,
      COALESCE(SUM(o.remaining_units) FILTER (WHERE o.side = 'buy'), 0)::int AS bid_depth_units,
      COALESCE(SUM(o.remaining_units) FILTER (WHERE o.side = 'sell'), 0)::int AS ask_depth_units
    FROM coown_orders o
    JOIN user_holdings uh ON uh.asset_id = o.asset_id
    WHERE o.status IN ('open', 'partially_filled')
      AND o.remaining_units > 0
      AND (o.expires_at IS NULL OR o.expires_at > NOW())
    GROUP BY o.asset_id
  ),
  exits AS (
    SELECT DISTINCT ca.asset_id
    FROM coown_corporate_actions ca
    JOIN user_holdings uh ON uh.asset_id = ca.asset_id
    WHERE ca.action_type = 'exit'
  )
  SELECT
    a.id AS asset_id,
    a.title,
    a.image_url,
    uh.units_owned::text AS total_units,
    COALESCE(sr.reserved_units, 0)::text AS reserved_units,
    lt.unit_price_gbp AS last_trade_price_gbp,
    lt.created_at AS last_trade_at,
    a.unit_price_gbp AS offering_price_gbp,
    a.appraisal_value_gbp AS reference_price_gbp,
    a.appraisal_valued_at AS reference_price_at,
    a.is_open,
    a.available_units::text AS available_units,
    book.best_bid_gbp,
    book.best_ask_gbp,
    COALESCE(book.bid_depth_units, 0)::text AS bid_depth_units,
    COALESCE(book.ask_depth_units, 0)::text AS ask_depth_units,
    EXISTS (SELECT 1 FROM exits e WHERE e.asset_id = a.id) AS has_exit,
    uh.avg_entry_price_gbp,
    a.lockup_end_date
  FROM user_holdings uh
  JOIN coown_assets a ON a.id = uh.asset_id
  LEFT JOIN last_trades lt ON lt.asset_id = a.id
  LEFT JOIN sell_reserved sr ON sr.asset_id = a.id
  LEFT JOIN book ON book.asset_id = a.id
  ORDER BY a.title, a.id
`;

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function rowToProjection(
  row: ProjectionDbRow,
  isReconciliationHalted: boolean
): PortfolioProjectionRow {
  const totalUnits = Number(row.total_units);
  const reservedUnits = Number(row.reserved_units);
  const sellableUnits = Math.max(0, totalUnits - reservedUnits);

  const lastTradePrice = toNumber(row.last_trade_price_gbp);
  const referencePrice = toNumber(row.reference_price_gbp);
  const offeringPrice = toNumber(row.offering_price_gbp);
  const avgEntry = Number(row.avg_entry_price_gbp);

  const isOpen = row.is_open;
  const availableUnits = Number(row.available_units);
  const offeringStatus = computeOfferingStatus(isOpen, availableUnits);

  // Mark basis precedence: last trade → reference appraisal → offering → none.
  let markBasis: PortfolioProjectionRow['markBasis'];
  let unitPriceGbp: number | null;
  let markTimestamp: string | null;

  if (lastTradePrice !== null) {
    markBasis = 'last_trade';
    unitPriceGbp = lastTradePrice;
    markTimestamp = row.last_trade_at;
  } else if (referencePrice !== null) {
    markBasis = 'reference';
    unitPriceGbp = referencePrice;
    markTimestamp = row.reference_price_at;
  } else if (offeringStatus === 'offering' && offeringPrice !== null) {
    markBasis = 'offering';
    unitPriceGbp = offeringPrice;
    markTimestamp = null;
  } else {
    markBasis = 'none';
    unitPriceGbp = null;
    markTimestamp = null;
  }

  let markAgeSeconds: number | null = null;
  if (markTimestamp !== null) {
    const ageMs = Date.now() - new Date(markTimestamp).getTime();
    markAgeSeconds = Number.isFinite(ageMs) ? Math.max(0, Math.floor(ageMs / 1000)) : null;
  }

  const marketValueGbp = unitPriceGbp !== null ? unitPriceGbp * totalUnits : null;
  const costBasisGbp = avgEntry * totalUnits;
  const unrealisedPnlGbp =
    marketValueGbp !== null ? marketValueGbp - costBasisGbp : null;

  const marketStatus = computeMarketStatus(
    offeringStatus,
    row.has_exit,
    isReconciliationHalted
  );

  return {
    assetId: row.asset_id,
    title: row.title,
    imageUrl: row.image_url,
    totalUnits,
    sellableUnits,
    unitPriceGbp,
    markBasis,
    markTimestamp,
    markAgeSeconds,
    marketValueGbp,
    costBasisGbp,
    unrealisedPnlGbp,
    marketStatus,
    offeringStatus,
    bestBidGbp: toNumber(row.best_bid_gbp),
    bestAskGbp: toNumber(row.best_ask_gbp),
    bidDepthUnits: Number(row.bid_depth_units),
    askDepthUnits: Number(row.ask_depth_units),
    partialLiquidity: sellableUnits < totalUnits,
    lockupEndDate: row.lockup_end_date ?? null,
  };
}

/**
 * Returns the authenticated user's full portfolio projection in a single
 * bounded SQL round-trip (plus one Redis read for the global 1ZE halt flag).
 *
 * Empty portfolios resolve to an empty array — never an error. Database
 * failures are reported via `partial: true` and an `error` message so callers
 * can surface a degraded state without throwing.
 */
export async function getPortfolioProjection(
  userId: string
): Promise<PortfolioProjectionResult> {
  try {
    const isReconciliationHalted = await readOnezeHaltState();

    const result = await db.query<ProjectionDbRow>(PROJECTION_SQL, [userId]);

    const holdings = result.rows.map((row) =>
      rowToProjection(row, isReconciliationHalted)
    );

    return { holdings, partial: false };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'portfolio_projection_failed';
    return { holdings: [], partial: true, error: message };
  }
}
