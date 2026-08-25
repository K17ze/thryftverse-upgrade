import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';

// ── Row types (snake_case, matches DB) ──

interface ListingReportRow {
  id: string;
  reporter_id: string;
  listing_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface UserReportRow {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

interface ConversationReportRow {
  id: string;
  conversation_id: string;
  reporter_user_id: string;
  reason: string;
  details: string | null;
  message_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AuctionRow {
  id: string;
  listing_id: string;
  seller_id: string;
  starts_at: string;
  ends_at: string;
  starting_bid_gbp: string;
  current_bid_gbp: string;
  buy_now_price_gbp: string | null;
  bid_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AuctionBidRow {
  bidder_id: string;
}

interface CoOwnAssetRow {
  id: string;
  listing_id: string;
  issuer_id: string;
  title: string;
  image_url: string | null;
  total_units: number;
  available_units: number;
  unit_price_gbp: string;
  unit_price_stable: string;
  settlement_mode: string;
  issuer_jurisdiction: string | null;
  market_move_pct_24h: string;
  holders: number;
  volume_24h_gbp: string;
  is_open: boolean;
  created_at: string;
  updated_at: string;
}

interface CoOwnHoldingRow {
  user_id: string;
}

interface CatalogImportBatchRow {
  id: string;
  user_id: string;
  connection_id: string | null;
  source: string;
  mode: string;
  status: string;
  status_reason: string | null;
  discovered_count: number;
  ready_count: number;
  issue_count: number;
  published_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ── Public API ──

/**
 * Projects a support-safe view of a report. Reports can live in one of three
 * tables: listing_reports, user_reports, or conversation_reports. The
 * projection checks each table in turn and returns the first match where the
 * user is the reporter. Returns null if no report is found or the user is not
 * the reporter.
 */
export async function projectReportContext(
  db: Pool,
  reportId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  // listing_reports
  const listingResult = await db.query<ListingReportRow>(
    `
      SELECT id, reporter_id, listing_id, reason, details, status,
             created_at, updated_at
      FROM listing_reports
      WHERE id = $1 AND reporter_id = $2
    `,
    [reportId, userId],
  );
  if (listingResult.rows.length > 0) {
    const row = listingResult.rows[0];
    return {
      kind: 'report',
      reportType: 'listing',
      id: row.id,
      listingId: row.listing_id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // user_reports
  const userResult = await db.query<UserReportRow>(
    `
      SELECT id, reporter_id, reported_id, reason, details, status,
             created_at, updated_at, reviewed_at
      FROM user_reports
      WHERE id = $1 AND reporter_id = $2
    `,
    [reportId, userId],
  );
  if (userResult.rows.length > 0) {
    const row = userResult.rows[0];
    return {
      kind: 'report',
      reportType: 'user',
      id: row.id,
      reportedId: row.reported_id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewedAt: row.reviewed_at,
    };
  }

  // conversation_reports
  const conversationResult = await db.query<ConversationReportRow>(
    `
      SELECT id, conversation_id, reporter_user_id, reason, details,
             message_id, status, created_at, updated_at
      FROM conversation_reports
      WHERE id = $1 AND reporter_user_id = $2
    `,
    [reportId, userId],
  );
  if (conversationResult.rows.length > 0) {
    const row = conversationResult.rows[0];
    return {
      kind: 'report',
      reportType: 'conversation',
      id: row.id,
      conversationId: row.conversation_id,
      reason: row.reason,
      details: row.details,
      messageId: row.message_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  logger.debug(
    { reportId, userId },
    '[extendedProjections] report not found or not owned by user',
  );
  return null;
}

/**
 * Projects a support-safe view of an auction. Returns null if the auction
 * does not exist or the user is neither the seller nor a bidder.
 */
export async function projectAuctionContext(
  db: Pool,
  auctionId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const auctionResult = await db.query<AuctionRow>(
    `
      SELECT id, listing_id, seller_id, starts_at, ends_at,
             starting_bid_gbp, current_bid_gbp, buy_now_price_gbp,
             bid_count, status, created_at, updated_at
      FROM auctions
      WHERE id = $1
    `,
    [auctionId],
  );

  if (auctionResult.rows.length === 0) {
    return null;
  }

  const auction = auctionResult.rows[0];

  // Authorise: seller or bidder.
  if (auction.seller_id !== userId) {
    const bidResult = await db.query<AuctionBidRow>(
      `
        SELECT bidder_id
        FROM auction_bids
        WHERE auction_id = $1 AND bidder_id = $2
        LIMIT 1
      `,
      [auctionId, userId],
    );
    if (bidResult.rows.length === 0) {
      return null;
    }
  }

  return {
    kind: 'auction',
    id: auction.id,
    listingId: auction.listing_id,
    sellerId: auction.seller_id,
    startsAt: auction.starts_at,
    endsAt: auction.ends_at,
    startingBidGbp: auction.starting_bid_gbp,
    currentBidGbp: auction.current_bid_gbp,
    buyNowPriceGbp: auction.buy_now_price_gbp,
    bidCount: auction.bid_count,
    status: auction.status,
    createdAt: auction.created_at,
    updatedAt: auction.updated_at,
  };
}

/**
 * Projects a support-safe view of a Co-Own asset. Returns null if the asset
 * does not exist or the user is neither the issuer nor a holder.
 */
export async function projectCoOwnAssetContext(
  db: Pool,
  assetId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const assetResult = await db.query<CoOwnAssetRow>(
    `
      SELECT id, listing_id, issuer_id, title, image_url,
             total_units, available_units, unit_price_gbp, unit_price_stable,
             settlement_mode, issuer_jurisdiction, market_move_pct_24h,
             holders, volume_24h_gbp, is_open, created_at, updated_at
      FROM "coOwn_assets"
      WHERE id = $1
    `,
    [assetId],
  );

  if (assetResult.rows.length === 0) {
    return null;
  }

  const asset = assetResult.rows[0];

  // Authorise: issuer or holder.
  if (asset.issuer_id !== userId) {
    const holdingResult = await db.query<CoOwnHoldingRow>(
      `
        SELECT user_id
        FROM "coOwn_holdings"
        WHERE asset_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [assetId, userId],
    );
    if (holdingResult.rows.length === 0) {
      return null;
    }
  }

  return {
    kind: 'coown_asset',
    id: asset.id,
    listingId: asset.listing_id,
    issuerId: asset.issuer_id,
    title: asset.title,
    imageUrl: asset.image_url,
    totalUnits: asset.total_units,
    availableUnits: asset.available_units,
    unitPriceGbp: asset.unit_price_gbp,
    unitPriceStable: asset.unit_price_stable,
    settlementMode: asset.settlement_mode,
    issuerJurisdiction: asset.issuer_jurisdiction,
    marketMovePct24h: asset.market_move_pct_24h,
    holders: asset.holders,
    volume24hGbp: asset.volume_24h_gbp,
    isOpen: asset.is_open,
    createdAt: asset.created_at,
    updatedAt: asset.updated_at,
  };
}

/**
 * Projects a support-safe view of a catalog import batch. Returns null if
 * the batch does not exist or does not belong to the user.
 */
export async function projectCatalogImportContext(
  db: Pool,
  importJobId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const result = await db.query<CatalogImportBatchRow>(
    `
      SELECT id, user_id, connection_id, source, mode, status, status_reason,
             discovered_count, ready_count, issue_count, published_count,
             created_at, updated_at, completed_at
      FROM catalog_import_batches
      WHERE id = $1 AND user_id = $2
    `,
    [importJobId, userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    kind: 'catalog_import',
    id: row.id,
    source: row.source,
    mode: row.mode,
    status: row.status,
    statusReason: row.status_reason,
    discoveredCount: row.discovered_count,
    readyCount: row.ready_count,
    issueCount: row.issue_count,
    publishedCount: row.published_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/**
 * Projects a support-safe view of a media job. No media_job table exists in
 * the current schema, so this always returns null rather than fabricating
 * data.
 */
export async function projectMediaJobContext(
  _db: Pool,
  _mediaJobId: string,
  _userId: string,
): Promise<Record<string, unknown> | null> {
  logger.debug(
    '[extendedProjections] media_job projection not implemented — no table exists',
  );
  return null;
}

export { logger };
