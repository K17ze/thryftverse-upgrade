import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import { publishRealtimeEvent } from '../lib/realtime.js';
import {
  evaluateAmlRisk,
  createAmlAlert,
  evaluateMarketEligibility,
} from '../lib/compliance.js';
import {
  listCountryPricingQuotes,
  getOnezeAnchorConfig,
} from '../lib/pricingEngine.js';
import { ledgerTablesAvailable } from '../lib/workerHelpers.js';
import { postAuctionSettlementLedgerEntries } from '../lib/workerRuntime.js';
import type { AuthenticatedUser } from '../lib/auth.js';

// ── Local helpers (mirrored from index.ts) ──

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeRequestHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

const AUCTION_PLATFORM_FEE_RATE = 0.03;

function calculateAuctionPlatformFeeGbp(winningBidGbp: number): number {
  return roundTo(Math.max(0, winningBidGbp) * AUCTION_PLATFORM_FEE_RATE, 2);
}

// ── Canonical auction lifecycle resolver ──

type CanonicalLifecycle =
  | 'upcoming'
  | 'live'
  | 'ended'
  | 'reserve_not_met'
  | 'awaiting_payment'
  | 'payment_expired'
  | 'second_chance_offered'
  | 'settled'
  | 'cancelled';

type TerminalReason =
  | 'cancelled'
  | 'settled'
  | 'buy_now'
  | 'scheduled_end'
  | 'reserve_not_met'
  | 'payment_expired'
  | 'second_chance'
  | 'seller_accepted_below_reserve'
  | 'seller_cancelled'
  | null;

interface CanonicalLifecycleInput {
  cancelledAt: string | null;
  settledAt: string | Date | null;
  winnerBidderId: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  reservePriceGbp?: number | null;
  currentBidGbp?: number | null;
  topBidAmountGbp?: number | null;
  paymentStatus?: 'paid' | 'unpaid' | null;
  status?: string;
  now?: Date;
}

interface CanonicalLifecycleResult {
  lifecycle: CanonicalLifecycle;
  terminalReason: TerminalReason;
}

function resolveCanonicalLifecycle(input: CanonicalLifecycleInput): CanonicalLifecycleResult {
  const now = (input.now ?? new Date()).getTime();
  const startsAt = new Date(input.startsAt).getTime();
  const endsAt = new Date(input.endsAt).getTime();

  if (input.cancelledAt) {
    return { lifecycle: 'cancelled', terminalReason: 'seller_cancelled' };
  }

  if (input.settledAt) {
    return { lifecycle: 'settled', terminalReason: 'settled' };
  }

  // Buy Now is the only case where a winner is set before the scheduled end
  // and the auction status is explicitly 'ended' without payment confirmation.
  if (input.winnerBidderId && input.status === 'ended') {
    return { lifecycle: 'ended', terminalReason: 'buy_now' };
  }

  const isAfterEnd = endsAt <= now;
  const explicitTerminal = input.status && ['ended', 'reserve_not_met', 'awaiting_payment', 'payment_expired', 'second_chance_offered'].includes(input.status);

  if (isAfterEnd || explicitTerminal) {
    const topBidAmount = input.topBidAmountGbp ?? input.currentBidGbp ?? null;

    if (input.status === 'reserve_not_met' || (input.reservePriceGbp != null && topBidAmount != null && topBidAmount < input.reservePriceGbp)) {
      return { lifecycle: 'reserve_not_met', terminalReason: 'reserve_not_met' };
    }

    if (input.status === 'awaiting_payment' || (input.winnerBidderId && input.paymentStatus !== 'paid')) {
      return { lifecycle: 'awaiting_payment', terminalReason: null };
    }

    if (input.status === 'payment_expired') {
      return { lifecycle: 'payment_expired', terminalReason: 'payment_expired' };
    }

    if (input.status === 'second_chance_offered') {
      return { lifecycle: 'second_chance_offered', terminalReason: 'second_chance' };
    }

    return { lifecycle: 'ended', terminalReason: 'scheduled_end' };
  }

  if (startsAt > now) {
    return { lifecycle: 'upcoming', terminalReason: null };
  }

  return { lifecycle: 'live', terminalReason: null };
}

// ── Atomic idempotency claims ──

interface IdempotencyClaimResult {
  claimed: boolean;
  existing?: {
    responseStatus: number;
    responseBody: Record<string, unknown>;
    requestHash: string;
  };
}

async function claimIdempotency(
  client: { query: <T = any>(text: string, values?: any[]) => Promise<{ rows: T[] }> },
  opts: {
    idempotencyKey: string;
    operationType: 'bid' | 'buy_now';
    auctionId: string;
    userId: string;
    requestHash: string;
  }
): Promise<IdempotencyClaimResult> {
  const result = await client.query<{
    id: number;
    response_status: number;
    response_body: Record<string, unknown>;
    request_hash: string;
  }>(
    `
      INSERT INTO auction_transaction_idempotency (idempotency_key, operation_type, auction_id, user_id, request_hash, response_status, response_body)
      VALUES ($1, $2, $3, $4, $5, 200, '{}'::jsonb)
      ON CONFLICT (auction_id, user_id, idempotency_key)
      DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
      RETURNING id, response_status, response_body, request_hash
    `,
    [opts.idempotencyKey, opts.operationType, opts.auctionId, opts.userId, opts.requestHash]
  );

  const row = result.rows[0];
  const isEmptyBody = !row.response_body || Object.keys(row.response_body).length === 0;
  if (isEmptyBody) {
    return { claimed: true };
  }
  return {
    claimed: false,
    existing: {
      responseStatus: row.response_status,
      responseBody: row.response_body,
      requestHash: row.request_hash,
    },
  };
}

async function storeIdempotencyResponse(
  client: { query: <T = any>(text: string, values?: any[]) => Promise<{ rows: T[] }> },
  opts: {
    idempotencyKey: string;
    operationType: 'bid' | 'buy_now';
    auctionId: string;
    userId: string;
    responseStatus: number;
    responseBody: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      UPDATE auction_transaction_idempotency
      SET response_status = $2, response_body = $3
      WHERE idempotency_key = $1 AND auction_id = $4 AND user_id = $5
    `,
    [opts.idempotencyKey, opts.responseStatus, JSON.stringify(opts.responseBody), opts.auctionId, opts.userId]
  );
}

function resolveAuctionStatus(startsAt: Date, endsAt: Date): 'upcoming' | 'live' | 'ended' {
  const now = Date.now();
  const start = startsAt.getTime();
  const end = endsAt.getTime();

  if (end <= now) {
    return 'ended';
  }

  if (start <= now && end > now) {
    return 'live';
  }

  return 'upcoming';
}

// ── Dependency injection ──

type AuctionRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  optionalAuthenticate: (request: { headers: Record<string, string | string[] | undefined>; authUser?: AuthenticatedUser }, requestPath: string) => Promise<void>;
  queueUserNotification: (input: {
    userId: string;
    title: string;
    body: string;
    eventType: string;
    payload: Record<string, unknown>;
    route: Record<string, unknown>;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }) => Promise<string | null>;
  onezeTablesAvailable: (client: Pool | PoolClient) => Promise<boolean>;
  onezePricingTablesAvailable: (client: Pool | PoolClient) => Promise<boolean>;
  appendComplianceAuditSafe: (
    request: { authUser?: { userId: string }; ip?: string; headers?: Record<string, string | string[] | undefined> },
    event: { eventType: string; subjectUserId?: string; payload: Record<string, unknown> },
  ) => Promise<void>;
  ATTENTION_LEADING_THRESHOLD_MS: number;
  ATTENTION_WATCHING_THRESHOLD_MS: number;
  CLOSING_SOON_THRESHOLD_MS: number;
};

export const registerAuctionRoutes = ({
  app,
  db,
  optionalAuthenticate,
  queueUserNotification,
  onezeTablesAvailable,
  onezePricingTablesAvailable,
  appendComplianceAuditSafe,
  ATTENTION_LEADING_THRESHOLD_MS,
  ATTENTION_WATCHING_THRESHOLD_MS,
  CLOSING_SOON_THRESHOLD_MS,
}: AuctionRouteDependencies) => {

app.get('/auctions/1ze-rates', async (request, reply) => {
  try {
    if (!(await onezeTablesAvailable(db)) || !(await onezePricingTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze controlled pricing tables are unavailable.',
      };
    }

    const quotes = await listCountryPricingQuotes(db);
    const anchor = await getOnezeAnchorConfig(db);

    const rates: Record<string, {
      rate: number;
      source: string;
      updatedAt: string;
      settlementSupported: boolean;
    }> = {};

    for (const quote of quotes) {
      rates[quote.currency] = {
        rate: quote.netRedemption,
        source: quote.source,
        updatedAt: quote.updatedAt,
        settlementSupported: true,
      };
    }

    return {
      ok: true,
      anchorCurrency: anchor.anchorCurrency,
      anchorValue: anchor.anchorValue,
      rates,
      source: 'internal_pricing',
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    request.log.error({ err: error }, 'Failed to resolve 1ze display rates');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to resolve 1ze display rates',
    };
  }
});

app.get('/auctions/home', async (request, reply) => {
  await optionalAuthenticate(request, '/auctions/home');
  const viewerUserId = request.authUser?.userId ?? null;

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  // â”€â”€ Fetch all auctions with viewer state in a single query â”€â”€
  // Parameterised: viewer ID passed as $1 to every authenticated query.
  // Anonymous queries use literal false/NULL with no parameter.
  const viewerSelect = viewerUserId
    ? `, EXISTS (SELECT 1 FROM auction_watchlist aw WHERE aw.auction_id = a.id AND aw.user_id = $1) AS is_watched, (SELECT MAX(ab.amount_gbp)::text FROM auction_bids ab WHERE ab.auction_id = a.id AND ab.bidder_id = $1) AS viewer_highest_bid`
    : `, false::boolean AS is_watched, NULL::text AS viewer_highest_bid`;

  const baseSelect = `
    SELECT
      a.id, a.listing_id, a.seller_id, a.starts_at, a.ends_at,
      a.starting_bid_gbp, a.current_bid_gbp, a.buy_now_price_gbp,
      a.reserve_price_gbp, a.min_increment_gbp, a.bid_count, a.status, a.cancelled_at, a.settled_at,
      a.winner_bidder_id AS auction_winner_id, a.created_at,
      l.title, l.image_url, l.brand, l.category, l.condition AS condition_label,
      u.username AS seller_username, u.avatar AS seller_avatar, u.display_name AS seller_display_name
      ${viewerSelect}
    FROM auctions a
    LEFT JOIN listings l ON l.id = a.listing_id
    LEFT JOIN users u ON u.id = a.seller_id
    WHERE a.cancelled_at IS NULL
  `;

  const viewerParams = viewerUserId ? [viewerUserId] : [];

  // Fetch live (including closing soon), upcoming, ended, seller, watchlist, and categories in parallel
  const [liveRes, upcomingRes, endedRes, sellerRes, watchlistRes, categoryRes, upcomingCategoryRes] = await Promise.all([
    db.query(baseSelect + ` AND a.starts_at <= NOW() AND a.ends_at > NOW() ORDER BY a.ends_at ASC LIMIT 30`, viewerParams),
    db.query(baseSelect + ` AND a.starts_at > NOW() ORDER BY a.starts_at ASC LIMIT 20`, viewerParams),
    db.query(baseSelect + ` AND a.ends_at <= NOW() ORDER BY a.ends_at DESC LIMIT 20`, viewerParams),
    viewerUserId
      ? db.query(baseSelect + ` AND a.seller_id = $1 ORDER BY a.ends_at DESC LIMIT 20`, [viewerUserId])
      : Promise.resolve({ rows: [] as any[] }),
    viewerUserId
      ? db.query(baseSelect + ` AND EXISTS (SELECT 1 FROM auction_watchlist aw WHERE aw.auction_id = a.id AND aw.user_id = $1) ORDER BY a.ends_at ASC LIMIT 20`, [viewerUserId])
      : Promise.resolve({ rows: [] as any[] }),
    db.query(`SELECT DISTINCT COALESCE(l.category, '') AS category FROM auctions a LEFT JOIN listings l ON l.id = a.listing_id WHERE a.cancelled_at IS NULL AND a.starts_at <= NOW() AND a.ends_at > NOW() AND COALESCE(l.category, '') != '' ORDER BY category ASC`),
    db.query(`SELECT DISTINCT COALESCE(l.category, '') AS category FROM auctions a LEFT JOIN listings l ON l.id = a.listing_id WHERE a.cancelled_at IS NULL AND a.starts_at > NOW() AND COALESCE(l.category, '') != '' ORDER BY category ASC`),
  ]);

  // â”€â”€ Row mapper (shared with /auctions list endpoint) â”€â”€
  function mapRow(row: any) {
    const currentBid = Number(row.current_bid_gbp);
    const canonical = resolveCanonicalLifecycle({
      cancelledAt: row.cancelled_at,
      settledAt: row.settled_at,
      winnerBidderId: row.auction_winner_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
      currentBidGbp: currentBid,
      topBidAmountGbp: currentBid,
      status: row.status,
    });
    const minIncrement = Number(row.min_increment_gbp) || 0.01;
    const minimumNextBid = roundTo(currentBid + minIncrement, 2);

    let viewerState: 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller' = 'not_participating';
    const isWatched = !!row.is_watched;
    const viewerHighestBid = row.viewer_highest_bid ? Number(row.viewer_highest_bid) : null;

    if (viewerUserId && row.seller_id === viewerUserId) {
      viewerState = 'seller';
    } else if (canonical.lifecycle === 'ended' || canonical.lifecycle === 'cancelled' || canonical.lifecycle === 'settled') {
      if (row.auction_winner_id && row.auction_winner_id === viewerUserId) {
        viewerState = 'won';
      } else if (viewerHighestBid !== null) {
        viewerState = 'lost';
      } else if (isWatched) {
        viewerState = 'watching';
      }
    } else if (viewerHighestBid !== null) {
      viewerState = viewerHighestBid >= currentBid ? 'leading' : 'outbid';
    } else if (isWatched) {
      viewerState = 'watching';
    }

    return {
      id: row.id,
      listingId: row.listing_id,
      seller: {
        id: row.seller_id,
        username: row.seller_username ?? 'unknown',
        displayName: row.seller_display_name ?? null,
        avatarUrl: row.seller_avatar ?? null,
      },
      title: row.title ?? 'Untitled',
      imageUrl: row.image_url ?? null,
      brand: row.brand ?? null,
      category: row.category ?? null,
      conditionLabel: row.condition_label ?? null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      startingBidGbp: Number(row.starting_bid_gbp),
      currentBidGbp: currentBid,
      minimumNextBidGbp: minimumNextBid,
      buyNowPriceGbp: row.buy_now_price_gbp === null ? null : Number(row.buy_now_price_gbp),
      reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
      bidCount: row.bid_count,
      lifecycle: canonical.lifecycle,
      terminalReason: canonical.terminalReason,
      viewerState,
      isWatched,
      winnerBidderId: row.auction_winner_id,
      cancelledAt: row.cancelled_at,
      settledAt: row.settled_at,
      createdAt: row.created_at,
    };
  }

  const liveItems = liveRes.rows.map(mapRow);
  const upcomingItems = upcomingRes.rows.map(mapRow);
  const endedItems = endedRes.rows.map(mapRow);
  const sellerItems = sellerRes.rows.map(mapRow);
  const watchlistItems = watchlistRes.rows.map(mapRow);

  // â”€â”€ Activity counts (deduplicated by Auction ID) â”€â”€
  const activity = {
    activeCount: 0,
    needsAttentionCount: 0,
    leadingCount: 0,
    outbidCount: 0,
    watchingCount: 0,
    unresolvedWonCount: 0,
  };

  const seenActivityIds = new Set<string>();
  for (const item of [...liveItems, ...endedItems, ...watchlistItems]) {
    if (seenActivityIds.has(item.id)) continue;
    seenActivityIds.add(item.id);

    if (item.viewerState === 'outbid') { activity.outbidCount++; activity.needsAttentionCount++; activity.activeCount++; }
    else if (item.viewerState === 'leading') { activity.leadingCount++; activity.activeCount++; }
    else if (item.viewerState === 'watching') { activity.watchingCount++; activity.activeCount++; }
    else if (item.viewerState === 'won') { activity.unresolvedWonCount++; activity.needsAttentionCount++; }
  }

  // â”€â”€ Deterministic attention priority â”€â”€
  // 1. unresolved won action (won with ended/settled lifecycle and no settled_at = needs action)
  const wonAction = [...endedItems, ...liveItems].find(
    (i) => i.viewerState === 'won' && !i.settledAt
  );
  // 2. outbid live
  const outbidLive = liveItems.find((i) => i.viewerState === 'outbid');
  // 3. leading ending within threshold
  const leadingEnding = liveItems.find((i) => {
    if (i.viewerState !== 'leading') return false;
    const msToEnd = new Date(i.endsAt).getTime() - nowMs;
    return msToEnd > 0 && msToEnd <= ATTENTION_LEADING_THRESHOLD_MS;
  });
  // 4. leading live
  const leadingLive = liveItems.find((i) => i.viewerState === 'leading');
  // 5. watching ending within threshold
  const watchingEnding = liveItems.find((i) => {
    if (i.viewerState !== 'watching') return false;
    const msToEnd = new Date(i.endsAt).getTime() - nowMs;
    return msToEnd > 0 && msToEnd <= ATTENTION_WATCHING_THRESHOLD_MS;
  });
  // 6. strongest closing-soon market auction
  const closingSoonLive = liveItems.find((i) => {
    const msToEnd = new Date(i.endsAt).getTime() - nowMs;
    return msToEnd > 0 && msToEnd <= CLOSING_SOON_THRESHOLD_MS;
  });
  // 7. strongest live
  const strongestLive = liveItems[0] ?? null;
  // 8. nearest upcoming
  const nearestUpcoming = upcomingItems[0] ?? null;

  let attentionItem: typeof wonAction | null = null;
  let attentionReason: string | null = null;
  if (wonAction) { attentionItem = wonAction; attentionReason = 'won_action'; }
  else if (outbidLive) { attentionItem = outbidLive; attentionReason = 'outbid'; }
  else if (leadingEnding) { attentionItem = leadingEnding; attentionReason = 'leading_ending'; }
  else if (leadingLive) { attentionItem = leadingLive; attentionReason = 'leading'; }
  else if (watchingEnding) { attentionItem = watchingEnding; attentionReason = 'watching_ending'; }

  // Fallback to market auction if no personal attention
  if (!attentionItem) {
    if (closingSoonLive) { attentionItem = closingSoonLive; attentionReason = null; }
    else if (strongestLive) { attentionItem = strongestLive; attentionReason = null; }
    else if (nearestUpcoming) { attentionItem = nearestUpcoming; attentionReason = null; }
  }

  // â”€â”€ Closing soon programme (live items ending within 60 min, excluding attention item) â”€â”€
  const closingSoon = liveItems.filter((i) => {
    if (attentionItem && i.id === attentionItem.id) return false;
    const msToEnd = new Date(i.endsAt).getTime() - nowMs;
    return msToEnd > 0 && msToEnd <= CLOSING_SOON_THRESHOLD_MS;
  });

  // â”€â”€ Live auction floor (live items not in closing soon or attention) â”€â”€
  const excludeIds = new Set<string>();
  if (attentionItem) excludeIds.add(attentionItem.id);
  closingSoon.forEach((i) => excludeIds.add(i.id));
  const liveFloor = liveItems.filter((i) => !excludeIds.has(i.id));

  // â”€â”€ Category worlds â”€â”€
  // Map raw category strings to human-readable display names.
  // The listings table stores lowercase categories (women, men) alongside
  // display-case categories (Watches, Bags, Sneakers, Cameras). The frontend
  // category rail should show proper display names.
  const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
    women: 'Women',
    men: 'Men',
    watches: 'Watches',
    bags: 'Bags',
    sneakers: 'Sneakers',
    cameras: 'Cameras',
    streetwear: 'Streetwear',
    shoes: 'Shoes',
    clothing: 'Clothing',
  };
  function categoryDisplayName(raw: string): string {
    const lower = raw.toLowerCase();
    return CATEGORY_DISPLAY_NAMES[lower] ?? raw;
  }

  const categoryRows = categoryRes.rows as { category: string }[];
  const upcomingCategoryRows = upcomingCategoryRes.rows as { category: string }[];
  // Merge live + upcoming categories, deduplicated, preserving sort order.
  const allCategories = new Set<string>();
  for (const r of categoryRows) allCategories.add(r.category);
  for (const r of upcomingCategoryRows) allCategories.add(r.category);
  const categoryWorlds: Array<{
    categoryKey: string;
    displayName: string;
    representativeImageUrl: string | null;
    availableCount?: number;
  }> = [];

  for (const cat of allCategories) {
    // Find a representative image from live items first, then upcoming
    const repItem = liveItems.find((i) => i.category === cat && i.imageUrl)
      ?? upcomingItems.find((i) => i.category === cat && i.imageUrl);
    const liveCount = liveItems.filter((i) => i.category === cat).length;
    const upcomingCount = upcomingItems.filter((i) => i.category === cat).length;
    categoryWorlds.push({
      categoryKey: cat,
      displayName: categoryDisplayName(cat),
      representativeImageUrl: repItem?.imageUrl ?? null,
      availableCount: (liveCount + upcomingCount) || undefined,
    });
  }

  // â”€â”€ Recently closed â”€â”€
  const recentlyClosed = endedItems.filter((i) => {
    if (attentionItem && i.id === attentionItem.id) return false;
    return true;
  });

  // â”€â”€ Seller summary â”€â”€
  let sellerSummary: { liveCount: number; scheduledCount: number; completedCount: number } | undefined;
  if (sellerItems.length > 0) {
    sellerSummary = {
      liveCount: sellerItems.filter((i) => i.lifecycle === 'live').length,
      scheduledCount: sellerItems.filter((i) => i.lifecycle === 'upcoming').length,
      completedCount: sellerItems.filter((i) => i.lifecycle === 'ended' || i.lifecycle === 'settled').length,
    };
  }

  return {
    ok: true,
    serverNow: nowIso,
    attention: {
      item: attentionItem ?? null,
      reason: attentionReason,
    },
    activity,
    closingSoon,
    live: liveFloor,
    upcoming: upcomingItems,
    categoryWorlds,
    recentlyClosed,
    sellerSummary,
    sellerAuctions: sellerItems,
    watchlist: watchlistItems.filter((i) => {
      if (attentionItem && i.id === attentionItem.id) return false;
      return true;
    }),
  };
});

app.get('/auctions', async (request, reply) => {
  await optionalAuthenticate(request, '/auctions');
  const querySchema = z.object({
    status: z.enum(['live', 'scheduled', 'ended', 'all']).default('all'),
    query: z.string().min(1).max(200).optional(),
    category: z.string().min(1).max(80).optional(),
    sort: z.enum(['endingSoon', 'newest', 'mostBids', 'priceLow', 'priceHigh']).default('endingSoon'),
    watchedOnly: z.coerce.boolean().default(false),
    seller: z.enum(['me']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(60).default(30),
  });

  const { status, query: searchQuery, category, sort, watchedOnly, seller, cursor, limit } = querySchema.parse(request.query);

  const viewerUserId = request.authUser?.userId ?? null;
  const sellerMe = seller === 'me' && viewerUserId;

  if ((watchedOnly || sellerMe) && !viewerUserId) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const whereConditions: string[] = ['a.cancelled_at IS NULL'];
  const whereParams: Array<string | number | boolean> = [];
  let paramIdx = 0;

  if (sellerMe) {
    whereParams.push(viewerUserId!);
    paramIdx++;
    whereConditions.push(`a.seller_id = $${paramIdx}`);
  }

  if (watchedOnly && viewerUserId) {
    whereParams.push(viewerUserId);
    paramIdx++;
    whereConditions.push(`EXISTS (SELECT 1 FROM auction_watchlist aw WHERE aw.auction_id = a.id AND aw.user_id = $${paramIdx})`);
  }

  if (searchQuery) {
    paramIdx++;
    whereParams.push(`%${searchQuery}%`);
    whereConditions.push(`(COALESCE(l.title, '') ILIKE $${paramIdx} OR COALESCE(l.brand, '') ILIKE $${paramIdx})`);
  }

  if (category) {
    paramIdx++;
    whereParams.push(category);
    whereConditions.push(`COALESCE(l.category, '') = $${paramIdx}`);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (status === 'live') {
    whereConditions.push(`a.starts_at <= NOW() AND a.ends_at > NOW()`);
  } else if (status === 'scheduled') {
    whereConditions.push(`a.starts_at > NOW()`);
  } else if (status === 'ended') {
    whereConditions.push(`a.ends_at <= NOW()`);
  }

  let orderBy: string;
  let cursorColumn: string;
  switch (sort) {
    case 'newest':
      orderBy = 'a.created_at DESC, a.id DESC';
      cursorColumn = 'created_at';
      break;
    case 'mostBids':
      orderBy = 'a.bid_count DESC, a.id DESC';
      cursorColumn = 'bid_count';
      break;
    case 'priceLow':
      orderBy = 'a.current_bid_gbp ASC, a.id ASC';
      cursorColumn = 'current_bid_gbp';
      break;
    case 'priceHigh':
      orderBy = 'a.current_bid_gbp DESC, a.id DESC';
      cursorColumn = 'current_bid_gbp';
      break;
    case 'endingSoon':
    default:
      orderBy = 'a.ends_at ASC, a.id ASC';
      cursorColumn = 'ends_at';
      break;
  }

  let cursorCondition = '';
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
      if (decoded.ts && decoded.id) {
        paramIdx++;
        const cursorTsParam = paramIdx;
        paramIdx++;
        const cursorIdParam = paramIdx;
        whereParams.push(decoded.ts, decoded.id);
        const direction = sort === 'priceLow' ? '>' : '<';
        if (sort === 'mostBids') {
          cursorCondition = ` AND (a.bid_count ${direction} $${cursorTsParam} OR (a.bid_count = $${cursorTsParam} AND a.id < $${cursorIdParam}))`;
        } else if (sort === 'priceHigh') {
          cursorCondition = ` AND (a.current_bid_gbp ${direction} $${cursorTsParam} OR (a.current_bid_gbp = $${cursorTsParam} AND a.id < $${cursorIdParam}))`;
        } else if (sort === 'priceLow') {
          cursorCondition = ` AND (a.current_bid_gbp ${direction} $${cursorTsParam} OR (a.current_bid_gbp = $${cursorTsParam} AND a.id > $${cursorIdParam}))`;
        } else if (sort === 'newest') {
          cursorCondition = ` AND (a.created_at < $${cursorTsParam} OR (a.created_at = $${cursorTsParam} AND a.id < $${cursorIdParam}))`;
        } else {
          cursorCondition = ` AND (a.ends_at > $${cursorTsParam} OR (a.ends_at = $${cursorTsParam} AND a.id > $${cursorIdParam}))`;
        }
      }
    } catch {
      // Invalid cursor â€” ignore
    }
  }

  paramIdx++;
  const limitParam = paramIdx;
  whereParams.push(limit + 1);

  const whereClause = `WHERE ${whereConditions.join(' AND ')}${cursorCondition}`;

  const viewerParamIdx = paramIdx + 1;
  const viewerSelect = viewerUserId
    ? `, EXISTS (SELECT 1 FROM auction_watchlist aw WHERE aw.auction_id = a.id AND aw.user_id = $${viewerParamIdx}) AS is_watched, (SELECT MAX(ab.amount_gbp)::text FROM auction_bids ab WHERE ab.auction_id = a.id AND ab.bidder_id = $${viewerParamIdx}) AS viewer_highest_bid`
    : `, false::boolean AS is_watched, NULL::text AS viewer_highest_bid`;

  if (viewerUserId) {
    whereParams.push(viewerUserId);
  }

  const result = await db.query<{
    id: string;
    listing_id: string;
    seller_id: string;
    starts_at: string;
    ends_at: string;
    starting_bid_gbp: number | string;
    current_bid_gbp: number | string;
    buy_now_price_gbp: number | string | null;
    reserve_price_gbp: number | string | null;
    min_increment_gbp: number | string;
    bid_count: number;
    status: string;
    cancelled_at: string | null;
    settled_at: string | null;
    title: string | null;
    image_url: string | null;
    brand: string | null;
    category: string | null;
    condition_label: string | null;
    seller_username: string | null;
    seller_avatar: string | null;
    seller_display_name: string | null;
    is_watched: boolean | null;
    viewer_highest_bid: string | null;
    auction_winner_id: string | null;
    created_at: string;
  }>(
    `
      SELECT
        a.id,
        a.listing_id,
        a.seller_id,
        a.starts_at,
        a.ends_at,
        a.starting_bid_gbp,
        a.current_bid_gbp,
        a.buy_now_price_gbp,
        a.reserve_price_gbp,
        a.min_increment_gbp,
        a.bid_count,
        a.status,
        a.cancelled_at,
        a.settled_at,
        a.winner_bidder_id AS auction_winner_id,
        a.created_at,
        l.title,
        l.image_url,
        l.brand,
        l.category,
        l.condition AS condition_label,
        u.username AS seller_username,
        u.avatar AS seller_avatar,
        u.display_name AS seller_display_name
        ${viewerSelect}
      FROM auctions a
      LEFT JOIN listings l ON l.id = a.listing_id
      LEFT JOIN users u ON u.id = a.seller_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${limitParam}
    `,
    whereParams
  );

  const hasMore = result.rows.length > limit;
  const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;

  const items = pageRows.map((row) => {
    const currentBid = Number(row.current_bid_gbp);
    const canonical = resolveCanonicalLifecycle({
      cancelledAt: row.cancelled_at,
      settledAt: row.settled_at,
      winnerBidderId: row.auction_winner_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
      currentBidGbp: currentBid,
      topBidAmountGbp: currentBid,
      status: row.status,
    });
    const computedStatus = canonical.lifecycle;
    const minIncrement = Number(row.min_increment_gbp) || 0.01;
    const minimumNextBid = roundTo(currentBid + minIncrement, 2);

    let viewerState: 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller' = 'not_participating';
    const isWatched = !!row.is_watched;
    const viewerHighestBid = row.viewer_highest_bid ? Number(row.viewer_highest_bid) : null;

    if (viewerUserId && row.seller_id === viewerUserId) {
      viewerState = 'seller';
    } else if (
      computedStatus === 'ended' ||
      computedStatus === 'cancelled' ||
      computedStatus === 'settled' ||
      computedStatus === 'reserve_not_met' ||
      computedStatus === 'awaiting_payment' ||
      computedStatus === 'payment_expired' ||
      computedStatus === 'second_chance_offered'
    ) {
      if (row.auction_winner_id && row.auction_winner_id === viewerUserId) {
        viewerState = 'won';
      } else if (viewerHighestBid !== null) {
        viewerState = 'lost';
      } else if (isWatched) {
        viewerState = 'watching';
      }
    } else if (viewerHighestBid !== null) {
      viewerState = viewerHighestBid >= currentBid ? 'leading' : 'outbid';
    } else if (isWatched) {
      viewerState = 'watching';
    }

    return {
      id: row.id,
      listingId: row.listing_id,
      seller: {
        id: row.seller_id,
        username: row.seller_username ?? 'unknown',
        displayName: row.seller_display_name ?? null,
        avatarUrl: row.seller_avatar ?? null,
      },
      title: row.title ?? 'Untitled',
      imageUrl: row.image_url ?? null,
      brand: row.brand ?? null,
      category: row.category ?? null,
      conditionLabel: row.condition_label ?? null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      startingBidGbp: Number(row.starting_bid_gbp),
      currentBidGbp: currentBid,
      minimumNextBidGbp: minimumNextBid,
      buyNowPriceGbp: row.buy_now_price_gbp === null ? null : Number(row.buy_now_price_gbp),
      reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
      bidCount: row.bid_count,
      lifecycle: computedStatus,
      terminalReason: canonical.terminalReason,
      viewerState,
      isWatched,
      winnerBidderId: row.auction_winner_id,
      cancelledAt: row.cancelled_at,
      settledAt: row.settled_at,
      createdAt: row.created_at,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    let cursorTs: string;
    switch (sort) {
      case 'newest':
        cursorTs = last.created_at;
        break;
      case 'mostBids':
        cursorTs = String(last.bid_count);
        break;
      case 'priceLow':
      case 'priceHigh':
        cursorTs = String(last.current_bid_gbp);
        break;
      case 'endingSoon':
      default:
        cursorTs = last.ends_at;
        break;
    }
    nextCursor = Buffer.from(JSON.stringify({ ts: cursorTs, id: last.id }), 'utf-8').toString('base64url');
  }

  return {
    ok: true,
    items,
    nextCursor,
    serverNow: nowIso,
  };
});

app.post('/auctions', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    listingId: z.string().min(2),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    startingBidGbp: z.number().min(0),
    buyNowPriceGbp: z.number().min(0).optional(),
    minIncrementGbp: z.number().min(0).max(1000).optional(),
    reservePriceGbp: z.number().min(0).optional(),
    antiSniping: z.object({
      enabled: z.boolean(),
      extensionSeconds: z.number().int().positive(),
      maxExtensions: z.number().int().nonnegative(),
      windowSeconds: z.number().int().positive(),
    }).optional(),
    idempotencyKey: z.string().min(4).max(140).optional(),
  });

  const payload = bodySchema.parse(request.body);
  const sellerId = request.authUser.userId;

  const idempotencyKey = payload.idempotencyKey;

  if (idempotencyKey) {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM auctions WHERE seller_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [sellerId, idempotencyKey]
    );
    if (existing.rows[0]) {
      const existingAuction = await db.query<{
        id: string;
        listing_id: string;
        seller_id: string;
        starts_at: string;
        ends_at: string;
        starting_bid_gbp: number | string;
        current_bid_gbp: number | string;
        buy_now_price_gbp: number | string | null;
        reserve_price_gbp: number | string | null;
        anti_sniping_enabled: boolean;
        anti_sniping_extension_seconds: number | null;
        anti_sniping_max_extensions: number;
        anti_sniping_window_seconds: number | null;
        bid_count: number;
        status: string;
      }>(
        `
          SELECT
            id, listing_id, seller_id, starts_at, ends_at,
            starting_bid_gbp, current_bid_gbp, buy_now_price_gbp,
            reserve_price_gbp, anti_sniping_enabled, anti_sniping_extension_seconds,
            anti_sniping_max_extensions, anti_sniping_window_seconds,
            bid_count, status
          FROM auctions
          WHERE id = $1
          LIMIT 1
        `,
        [existing.rows[0].id]
      );
      const row = existingAuction.rows[0];
      return {
        ok: true,
        idempotent: true,
        auction: {
          id: row.id,
          listingId: row.listing_id,
          sellerId: row.seller_id,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          startingBidGbp: Number(row.starting_bid_gbp),
          currentBidGbp: Number(row.current_bid_gbp),
          buyNowPriceGbp: row.buy_now_price_gbp === null ? null : Number(row.buy_now_price_gbp),
          reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
          antiSniping: row.anti_sniping_enabled
            ? {
              enabled: row.anti_sniping_enabled,
              extensionSeconds: row.anti_sniping_extension_seconds,
              maxExtensions: row.anti_sniping_max_extensions,
              windowSeconds: row.anti_sniping_window_seconds,
            }
            : null,
          bidCount: row.bid_count,
          status: row.status,
        },
      };
    }
  }

  const startsAt = new Date(payload.startsAt);
  const endsAt = new Date(payload.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    reply.code(400);
    return { ok: false, error: 'Auction timing is invalid' };
  }

  const status = resolveAuctionStatus(startsAt, endsAt);
  const auctionId = `a_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const startingBidGbp = roundTo(payload.startingBidGbp, 2);
  const buyNowPriceGbp =
    payload.buyNowPriceGbp === undefined ? null : roundTo(payload.buyNowPriceGbp, 2);
  const reservePriceGbp =
    payload.reservePriceGbp === undefined ? null : roundTo(payload.reservePriceGbp, 2);
  const minIncrementGbp = payload.minIncrementGbp !== undefined ? roundTo(payload.minIncrementGbp, 2) : 0.01;
  const antiSnipingEnabled = payload.antiSniping?.enabled ?? false;
  const antiSnipingExtensionSeconds = antiSnipingEnabled ? payload.antiSniping!.extensionSeconds : null;
  const antiSnipingMaxExtensions = antiSnipingEnabled ? payload.antiSniping!.maxExtensions : 0;
  const antiSnipingWindowSeconds = antiSnipingEnabled ? payload.antiSniping!.windowSeconds : null;

  if (buyNowPriceGbp !== null && buyNowPriceGbp <= startingBidGbp) {
    reply.code(400);
    return { ok: false, error: 'Buy now price must be greater than starting bid' };
  }

  if (reservePriceGbp !== null && reservePriceGbp < startingBidGbp) {
    reply.code(400);
    return { ok: false, error: 'Reserve price must be at least the starting bid' };
  }

  // Transaction: lock the listing row, verify ownership, create auction,
  // and pause the listing atomically. This prevents a race condition
  // where the listing could be sold via direct checkout between the
  // ownership check and the pause.
  const client = await db.connect();
  let result: { rows: { id: string; listing_id: string; seller_id: string; starts_at: string; ends_at: string; starting_bid_gbp: number | string; current_bid_gbp: number | string; buy_now_price_gbp: number | string | null; bid_count: number; status: 'upcoming' | 'live' | 'ended' }[] };
  try {
    await client.query('BEGIN');

    const listingResult = await client.query<{ id: string; seller_id: string; status: string }>(
      'SELECT id, seller_id, status FROM listings WHERE id = $1 LIMIT 1 FOR UPDATE',
      [payload.listingId]
    );

    const listing = listingResult.rows[0];
    if (!listing) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Listing not found' };
    }

    if (listing.seller_id !== sellerId && request.authUser.role !== 'admin') {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Forbidden: you can only create auctions for your own listings' };
    }

    if (listing.status !== 'active') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Listing is not available for auction (it may already be sold, paused, or auctioned)', code: 'LISTING_NOT_AUCTIONABLE' };
    }

    result = await client.query<{
      id: string;
      listing_id: string;
      seller_id: string;
      starts_at: string;
      ends_at: string;
      starting_bid_gbp: number | string;
      current_bid_gbp: number | string;
      buy_now_price_gbp: number | string | null;
      bid_count: number;
      status: 'upcoming' | 'live' | 'ended';
    }>(
      `
        INSERT INTO auctions (
          id,
          listing_id,
          seller_id,
          starts_at,
          ends_at,
          starting_bid_gbp,
          current_bid_gbp,
          buy_now_price_gbp,
          min_increment_gbp,
          bid_count,
          status,
          idempotency_key,
          reserve_price_gbp,
          anti_sniping_enabled,
          anti_sniping_extension_seconds,
          anti_sniping_max_extensions,
          anti_sniping_window_seconds
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, 0, $9, $10, $11, $12, $13, $14, $15)
        RETURNING
          id,
          listing_id,
          seller_id,
          starts_at,
          ends_at,
          starting_bid_gbp,
          current_bid_gbp,
          buy_now_price_gbp,
          bid_count,
          status
      `,
      [
        auctionId,
        payload.listingId,
        sellerId,
        startsAt.toISOString(),
        endsAt.toISOString(),
        startingBidGbp,
        buyNowPriceGbp,
        minIncrementGbp,
        status,
        idempotencyKey ?? null,
        reservePriceGbp,
        antiSnipingEnabled,
        antiSnipingExtensionSeconds,
        antiSnipingMaxExtensions,
        antiSnipingWindowSeconds,
      ]
    );

    // Pause the underlying listing so it is no longer available for direct
    // purchase while the auction is active. This prevents double-exposure
    // where the same item is simultaneously buyable in the feed and being
    // auctioned. If the auction ends without a sale, the listing is
    // reactivated by the auction settlement sweep.
    await client.query(
      `UPDATE listings
       SET status = 'paused', updated_at = NOW()
       WHERE id = $1 AND status = 'active'`,
      [payload.listingId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    app.log.error({ err }, 'POST /auctions failed');
    reply.code(500);
    return { ok: false, error: 'Failed to create auction' };
  } finally {
    client.release();
  }

  publishRealtimeEvent({
    topic: 'auctions.market',
    type: 'auction.created',
    payload: {
      auctionId: result.rows[0].id,
      listingId: result.rows[0].listing_id,
      sellerId: result.rows[0].seller_id,
      status: result.rows[0].status,
    },
    // R01: versioned event for forward-compatible client parsing.
    seq: true,
    version: 1,
  });

  reply.code(201);
  return {
    ok: true,
    idempotent: false,
    auction: {
      id: result.rows[0].id,
      listingId: result.rows[0].listing_id,
      sellerId: result.rows[0].seller_id,
      startsAt: result.rows[0].starts_at,
      endsAt: result.rows[0].ends_at,
      startingBidGbp: Number(result.rows[0].starting_bid_gbp),
      currentBidGbp: Number(result.rows[0].current_bid_gbp),
      buyNowPriceGbp: result.rows[0].buy_now_price_gbp === null ? null : Number(result.rows[0].buy_now_price_gbp),
      reservePriceGbp,
      antiSniping: antiSnipingEnabled
        ? {
          enabled: true,
          extensionSeconds: antiSnipingExtensionSeconds,
          maxExtensions: antiSnipingMaxExtensions,
          windowSeconds: antiSnipingWindowSeconds,
        }
        : null,
      bidCount: result.rows[0].bid_count,
      status: result.rows[0].status,
    },
  };
});

app.get('/auctions/:auctionId/bids', async (request, reply) => {
  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const { limit } = querySchema.parse(request.query);

  const auctionExists = await db.query('SELECT id FROM auctions WHERE id = $1 LIMIT 1', [auctionId]);
  if (!auctionExists.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Auction not found' };
  }

  const result = await db.query<{
    id: number;
    auction_id: string;
    bidder_id: string;
    amount_gbp: number | string;
    created_at: string;
  }>(
    `
      SELECT id, auction_id, bidder_id, amount_gbp, created_at
      FROM auction_bids
      WHERE auction_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [auctionId, limit]
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      auctionId: row.auction_id,
      bidderId: row.bidder_id,
      amountGbp: Number(row.amount_gbp),
      createdAt: row.created_at,
    })),
  };
});

app.post('/auctions/:auctionId/bids', {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  },
  // Fastify JSON Schema â€” framework-level defence-in-depth per OWASP API
  // security best practices. Validates structure before the handler runs;
  // Zod in the handler provides semantic validation as a second layer.
  schema: {
    params: {
      type: 'object',
      required: ['auctionId'],
      properties: {
        auctionId: { type: 'string', minLength: 2 },
      },
    },
    body: {
      type: 'object',
      required: ['amountGbp'],
      properties: {
        amountGbp: { type: 'number', exclusiveMinimum: 0 },
        maxBidGbp: { type: 'number', exclusiveMinimum: 0 },
        idempotencyKey: { type: 'string', minLength: 4, maxLength: 140 },
      },
      additionalProperties: false,
    },
  },
}, async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const bodySchema = z.object({
    amountGbp: z.number().positive(),
    maxBidGbp: z.number().positive().optional(),
    idempotencyKey: z.string().min(4).max(140).optional(),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const bidderId = request.authUser.userId;

  const idempotencyKey = payload.idempotencyKey;
  const scopedKey = idempotencyKey ? `bid:${idempotencyKey}` : null;
  const requestHash = computeRequestHash({
    auctionId,
    bidderId,
    amountGbp: payload.amountGbp,
    maxBidGbp: payload.maxBidGbp ?? null,
    operation: 'bid',
  });

  const client = await db.connect();
  let amlAlert: { alertId: string; status: string } | null = null;
  try {
    await client.query('BEGIN');

    // Atomic idempotency claim â€” prevents TOCTOU race
    if (scopedKey) {
      const claim = await claimIdempotency(client, {
        idempotencyKey: scopedKey,
        operationType: 'bid',
        auctionId,
        userId: bidderId,
        requestHash,
      });
      if (!claim.claimed && claim.existing) {
        if (claim.existing.requestHash !== requestHash) {
          await client.query('ROLLBACK');
          reply.code(409);
          return { ok: false, error: 'Idempotency key already used with a different payload.', code: 'IDEMPOTENCY_KEY_REUSED' };
        }
        // Same hash â€” replay the original response
        await client.query('ROLLBACK');
        reply.code(claim.existing.responseStatus);
        return claim.existing.responseBody as any;
      }
    }

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      starts_at: string;
      ends_at: string;
      status: string;
      current_bid_gbp: number | string;
      starting_bid_gbp: number | string;
      min_increment_gbp: number | string;
      bid_count: number;
      buy_now_price_gbp: number | string | null;
      reserve_price_gbp: number | string | null;
      anti_sniping_enabled: boolean;
      anti_sniping_extension_seconds: number | null;
      anti_sniping_max_extensions: number;
      extension_count: number;
      anti_sniping_window_seconds: number | null;
      cancelled_at: string | null;
      settled_at: string | null;
      winner_bidder_id: string | null;
      winner_bid_id: number | null;
      paid_at: string | null;
      payment_confirmed_by: string | null;
    }>(
      `
        SELECT
          id, seller_id, starts_at, ends_at, status, current_bid_gbp, starting_bid_gbp,
          min_increment_gbp, bid_count, buy_now_price_gbp, reserve_price_gbp,
          anti_sniping_enabled, anti_sniping_extension_seconds, anti_sniping_max_extensions,
          extension_count, anti_sniping_window_seconds,
          cancelled_at, settled_at, winner_bidder_id, winner_bid_id,
          paid_at, payment_confirmed_by
        FROM auctions
        WHERE id = $1
        FOR UPDATE
      `,
      [auctionId]
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.seller_id === bidderId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Seller cannot bid on their own auction', code: 'SELLER_RESTRICTED' };
    }

    if (auction.cancelled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has been cancelled.', code: 'AUCTION_CANCELLED' };
    }

    if (auction.settled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has been settled.', code: 'AUCTION_SETTLED' };
    }

    // Winner already set â€” auction is terminally ended via Buy Now
    if (auction.winner_bidder_id) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has already been won via Buy Now.', code: 'AUCTION_ALREADY_WON' };
    }

    const canonical = resolveCanonicalLifecycle({
      cancelledAt: auction.cancelled_at,
      settledAt: auction.settled_at,
      winnerBidderId: auction.winner_bidder_id,
      startsAt: auction.starts_at,
      endsAt: auction.ends_at,
      reservePriceGbp: auction.reserve_price_gbp === null ? null : Number(auction.reserve_price_gbp),
      currentBidGbp: Number(auction.current_bid_gbp),
      topBidAmountGbp: Number(auction.current_bid_gbp),
      paymentStatus: auction.paid_at ? 'paid' : 'unpaid',
      status: auction.status ?? null,
    });

    if (canonical.lifecycle === 'upcoming') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has not started yet.', code: 'AUCTION_NOT_STARTED' };
    }

    if (canonical.lifecycle === 'ended') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has ended. Bidding is no longer available.', code: 'AUCTION_ENDED' };
    }

    const currentBid = Number(auction.current_bid_gbp);
    const minIncrement = Number(auction.min_increment_gbp) || 0.01;
    const submittedAmount = roundTo(payload.amountGbp, 2);
    const maxBidGbp = payload.maxBidGbp !== undefined ? roundTo(payload.maxBidGbp, 2) : null;
    const isProxy = maxBidGbp !== null && maxBidGbp >= submittedAmount;
    const minimumNextBid = roundTo(currentBid + minIncrement, 2);

    if (submittedAmount < minimumNextBid) {
      await client.query('ROLLBACK');
      reply.code(400);
      return {
        ok: false,
        error: `Bid must be at least ${minimumNextBid.toFixed(2)} GBP (current bid ${currentBid.toFixed(2)} GBP + min increment ${minIncrement.toFixed(2)} GBP)`,
        code: 'BID_BELOW_MINIMUM',
        minimumNextBidGbp: minimumNextBid,
      };
    }

    if (isProxy && maxBidGbp !== null && maxBidGbp < minimumNextBid) {
      await client.query('ROLLBACK');
      reply.code(400);
      return {
        ok: false,
        error: `Proxy maximum must be at least ${minimumNextBid.toFixed(2)} GBP`,
        code: 'PROXY_MAX_BELOW_MINIMUM',
        minimumNextBidGbp: minimumNextBid,
      };
    }

    // Fetch the current top bid (its committed amount and proxy max) to resolve
    // the new current price and leading bidder.
    const previousTopBidder = await client.query<{
      id: number;
      bidder_id: string;
      amount_gbp: number | string;
      max_bid_gbp: number | string | null;
      is_proxy: boolean;
    }>(
      `
        SELECT id, bidder_id, amount_gbp, max_bid_gbp, is_proxy
        FROM auction_bids
        WHERE auction_id = $1
        ORDER BY amount_gbp DESC, created_at ASC, id ASC
        LIMIT 1
      `,
      [auctionId]
    );
    const existingTop = previousTopBidder.rows[0] ?? null;
    const previousTopBidderId = existingTop?.bidder_id ?? null;

    let committedAmount: number;
    let leadingBidderId: string;
    let isNewBidderLeading: boolean;

    if (!existingTop) {
      committedAmount = submittedAmount;
      leadingBidderId = bidderId;
      isNewBidderLeading = true;
    } else {
      const existingMax = existingTop.is_proxy && existingTop.max_bid_gbp !== null
        ? Number(existingTop.max_bid_gbp)
        : Number(existingTop.amount_gbp);
      const newMax = isProxy ? (maxBidGbp ?? submittedAmount) : submittedAmount;

      if (newMax > existingMax) {
        committedAmount = roundTo(Math.min(newMax, existingMax + minIncrement), 2);
        leadingBidderId = bidderId;
        isNewBidderLeading = true;
      } else {
        committedAmount = roundTo(Math.min(existingMax, newMax + minIncrement), 2);
        leadingBidderId = existingTop.bidder_id;
        isNewBidderLeading = false;

        // The existing leading proxy auto-increments to just enough to stay top.
        await client.query(
          `UPDATE auction_bids SET amount_gbp = $2 WHERE id = $1`,
          [existingTop.id, committedAmount]
        );
      }
    }

    const amountGbp = committedAmount;
    const amlNotional = isProxy ? (maxBidGbp ?? amountGbp) : amountGbp;

    // Reject bids that meet or exceed the Buy Now price â€” user must use the dedicated Buy Now flow
    if (auction.buy_now_price_gbp !== null && amountGbp >= Number(auction.buy_now_price_gbp)) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Your bid meets or exceeds the Buy Now price. Use Buy Now to purchase this item immediately.',
        code: 'BUY_NOW_REVIEW_REQUIRED',
        buyNowPriceGbp: Number(auction.buy_now_price_gbp),
      };
    }

    const eligibility = await evaluateMarketEligibility(client, {
      userId: bidderId,
      market: 'auctions',
      orderNotionalGbp: amlNotional,
    });

    if (!eligibility.allowed) {
      await client.query('ROLLBACK');

      await appendComplianceAuditSafe(request, {
        eventType: 'auction.bid.blocked.eligibility',
        subjectUserId: bidderId,
        payload: {
          auctionId,
          amountGbp: amlNotional,
          code: eligibility.code,
          message: eligibility.message,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: eligibility.message,
        code: eligibility.code,
      };
    }

    const amlAssessment = await evaluateAmlRisk(client, {
      userId: bidderId,
      market: 'auctions',
      amountGbp: amlNotional,
      counterpartyUserId: auction.seller_id,
    });

    if (amlAssessment.shouldBlock) {
      await client.query('ROLLBACK');

      if (amlAssessment.shouldCreateAlert) {
        amlAlert = await createAmlAlert(db, {
          userId: bidderId,
          relatedUserId: auction.seller_id,
          market: 'auctions',
          eventType: 'bid',
          amountGbp: amlNotional,
          referenceId: auctionId,
          ruleCode: 'AML_PRE_TRADE_BLOCK',
          notes: 'Auction bid blocked by AML pre-trade evaluation',
          context: {
            auctionId,
            bidderId,
            sellerId: auction.seller_id,
          },
          assessment: amlAssessment,
        });
      }

      await appendComplianceAuditSafe(request, {
        eventType: 'auction.bid.blocked.aml',
        subjectUserId: bidderId,
        payload: {
          auctionId,
          amountGbp: amlNotional,
          riskScore: amlAssessment.riskScore,
          riskLevel: amlAssessment.riskLevel,
          alertId: amlAlert?.alertId ?? null,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: 'Bid blocked by AML controls. Please contact support for manual review.',
        code: 'AML_BLOCKED',
        riskLevel: amlAssessment.riskLevel,
        alertId: amlAlert?.alertId ?? null,
      };
    }

    // Anti-sniping: extend the clock if a bid lands inside the configured window.
    const bidTime = new Date();
    const endsAtTime = new Date(auction.ends_at).getTime();
    const antiSnipingWindowMs = (auction.anti_sniping_window_seconds ?? 0) * 1000;
    const antiSnipingApplies = !!auction.anti_sniping_enabled
      && antiSnipingWindowMs > 0
      && (auction.anti_sniping_max_extensions ?? 0) > 0
      && (bidTime.getTime() >= endsAtTime - antiSnipingWindowMs)
      && (bidTime.getTime() < endsAtTime)
      && auction.extension_count < auction.anti_sniping_max_extensions;

    let oldEndsAt: string | null = null;
    let newEndsAt: string | null = null;
    let nextExtensionCount: number | null = null;
    if (antiSnipingApplies) {
      oldEndsAt = auction.ends_at;
      const newEndsAtTime = endsAtTime + (auction.anti_sniping_extension_seconds ?? 0) * 1000;
      newEndsAt = new Date(newEndsAtTime).toISOString();
      nextExtensionCount = auction.extension_count + 1;
    }

    const bidResult = await client.query<{
      id: number;
      auction_sequence: number;
      created_at: string;
    }>(
      `
        INSERT INTO auction_bids (auction_id, bidder_id, amount_gbp, is_proxy, max_bid_gbp, idempotency_key)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, auction_sequence, created_at
      `,
      [auctionId, bidderId, amountGbp, isProxy, isProxy ? maxBidGbp : null, scopedKey ?? null]
    );

    const nextBidCount = auction.bid_count + 1;

    await client.query(
      `
        UPDATE auctions
        SET current_bid_gbp = $2,
            bid_count = $3,
            updated_at = NOW(),
            ends_at = COALESCE($4::timestamptz, ends_at),
            extension_count = COALESCE($5, extension_count)
        WHERE id = $1
      `,
      [auctionId, amountGbp, nextBidCount, newEndsAt, nextExtensionCount]
    );

    if (amlAssessment.shouldCreateAlert) {
      amlAlert = await createAmlAlert(client, {
        userId: bidderId,
        relatedUserId: auction.seller_id,
        market: 'auctions',
        eventType: 'bid',
        amountGbp,
        referenceId: auctionId,
        ruleCode: 'AML_POST_BID_MONITOR',
        notes: 'Auction bid generated elevated AML risk score',
        context: {
          auctionId,
          bidderId,
          sellerId: auction.seller_id,
        },
        assessment: amlAssessment,
      });
    }

    // Store idempotency response before commit so it persists with the transaction
    if (scopedKey) {
      await storeIdempotencyResponse(client, {
        idempotencyKey: scopedKey,
        operationType: 'bid',
        auctionId,
        userId: bidderId,
        responseStatus: 201,
        responseBody: {
          ok: true,
          bid: {
            id: bidResult.rows[0].id,
            auctionId,
            bidderId,
            amountGbp,
            isProxy,
            maxBidGbp: isProxy ? maxBidGbp : null,
            auctionSequence: bidResult.rows[0].auction_sequence,
            createdAt: bidResult.rows[0].created_at,
          },
          auction: {
            id: auctionId,
            currentBidGbp: amountGbp,
            bidCount: nextBidCount,
            isBuyNow: false,
            endsAt: newEndsAt ?? auction.ends_at,
            extensionCount: nextExtensionCount ?? auction.extension_count,
          },
          aml: amlAlert
            ? { alertId: amlAlert.alertId, status: amlAlert.status }
            : null,
        },
      });
    }

    await client.query('COMMIT');

    if (antiSnipingApplies && oldEndsAt && newEndsAt) {
      publishRealtimeEvent({
        topic: `auction:${auctionId}`,
        type: 'auction.extended',
        payload: {
          auctionId,
          oldEndsAt,
          newEndsAt,
          reason: 'anti_sniping',
        },
        seq: true,
        version: 1,
      });
    }

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.bid.created',
      payload: {
        auctionId,
        bidderId,
        amountGbp,
        bidCount: nextBidCount,
        isBuyNow: false,
        auctionSequence: bidResult.rows[0].auction_sequence,
      },
      // R01: versioned event for forward-compatible client parsing.
      seq: true,
      version: 1,
    });

    publishRealtimeEvent({
      topic: 'auctions.market',
      type: 'auction.bid.created',
      payload: {
        auctionId,
        currentBidGbp: amountGbp,
        bidCount: nextBidCount,
        isBuyNow: false,
        auctionSequence: bidResult.rows[0].auction_sequence,
      },
      seq: true,
      version: 1,
    });

    try {
      await queueUserNotification({
        userId: auction.seller_id,
        title: 'New auction bid',
        body: `A new bid of ${amountGbp.toFixed(2)} GBP was placed on auction ${auctionId}.`,
        eventType: 'auction_bid',
        payload: {
          auctionId,
          bidderId,
          amountGbp,
          event: 'auction_bid',
        },
        route: { screen: 'AuctionDetail', params: { auctionId } },
        idempotencyKey: `auction-bid-${auctionId}-${nextBidCount}`,
        metadata: {
          source: 'auction_bid_route',
        },
      });
    } catch (error) {
      request.log.error({ err: error, auctionId }, 'Failed to queue seller bid notification');
    }

    // Notify the previous top bidder that they've been outbid
    if (previousTopBidderId && previousTopBidderId !== bidderId && isNewBidderLeading) {
      try {
        await queueUserNotification({
          userId: previousTopBidderId,
          title: 'You\'ve been outbid',
          body: `Someone outbid you with ${amountGbp.toFixed(2)} GBP. Place a new bid to reclaim the top spot.`,
          eventType: 'auction_outbid',
          payload: {
            auctionId,
            event: 'auction_outbid',
            newBidAmountGbp: amountGbp,
          },
          route: { screen: 'AuctionDetail', params: { auctionId } },
          idempotencyKey: `auction-outbid-${auctionId}-${nextBidCount}`,
          metadata: {
            source: 'auction_outbid_route',
          },
        });
      } catch (error) {
        request.log.error({ err: error, auctionId }, 'Failed to queue outbid notification');
      }
    }

    await appendComplianceAuditSafe(request, {
      eventType: 'auction.bid.created',
      subjectUserId: bidderId,
      payload: {
        auctionId,
        amountGbp,
        bidCount: nextBidCount,
        amlAlertId: amlAlert?.alertId ?? null,
      },
    });

    reply.code(201);
    return {
      ok: true,
      bid: {
        id: bidResult.rows[0].id,
        auctionId,
        bidderId,
        amountGbp,
        isProxy,
        maxBidGbp: isProxy ? maxBidGbp : null,
        auctionSequence: bidResult.rows[0].auction_sequence,
        createdAt: bidResult.rows[0].created_at,
      },
      auction: {
        id: auctionId,
        currentBidGbp: amountGbp,
        bidCount: nextBidCount,
        isBuyNow: false,
        endsAt: newEndsAt ?? auction.ends_at,
        extensionCount: nextExtensionCount ?? auction.extension_count,
      },
      aml: amlAlert
        ? {
          alertId: amlAlert.alertId,
          status: amlAlert.status,
        }
        : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return {
      ok: false,
      error: `Unable to place bid: ${(error as Error).message}`,
    };
  } finally {
    client.release();
  }
});

app.post('/auctions/:auctionId/buy-now', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const bodySchema = z.object({
    idempotencyKey: z.string().min(4).max(140),
    expectedPriceGbp: z.number().positive(),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const buyerId = request.authUser.userId;
  const idempotencyKey = payload.idempotencyKey;
  const scopedKey = `buy_now:${idempotencyKey}`;
  const requestHash = computeRequestHash({ auctionId, buyerId, expectedPriceGbp: payload.expectedPriceGbp, operation: 'buy_now' });

  const client = await db.connect();
  let amlAlert: { alertId: string; status: string } | null = null;
  try {
    await client.query('BEGIN');

    // Atomic idempotency claim â€” prevents TOCTOU race
    const claim = await claimIdempotency(client, {
      idempotencyKey: scopedKey,
      operationType: 'buy_now',
      auctionId,
      userId: buyerId,
      requestHash,
    });
    if (!claim.claimed && claim.existing) {
      if (claim.existing.requestHash !== requestHash) {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Idempotency key already used with a different payload.', code: 'IDEMPOTENCY_KEY_REUSED' };
      }
      // Same hash â€” replay the original response
      await client.query('ROLLBACK');
      reply.code(claim.existing.responseStatus);
      return claim.existing.responseBody as any;
    }

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      starts_at: string;
      ends_at: string;
      status: string;
      current_bid_gbp: number | string;
      min_increment_gbp: number | string;
      bid_count: number;
      buy_now_price_gbp: number | string | null;
      reserve_price_gbp: number | string | null;
      cancelled_at: string | null;
      settled_at: string | null;
      winner_bidder_id: string | null;
      winner_bid_id: number | null;
      paid_at: string | null;
      payment_confirmed_by: string | null;
    }>(
      `
        SELECT id, seller_id, listing_id, starts_at, ends_at, status, current_bid_gbp,
          min_increment_gbp, bid_count, buy_now_price_gbp, reserve_price_gbp,
          cancelled_at, settled_at, winner_bidder_id, winner_bid_id,
          paid_at, payment_confirmed_by
        FROM auctions
        WHERE id = $1
        FOR UPDATE
      `,
      [auctionId]
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.seller_id === buyerId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Seller cannot purchase their own auction', code: 'SELLER_RESTRICTED' };
    }

    if (auction.cancelled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has been cancelled.', code: 'AUCTION_CANCELLED' };
    }

    if (auction.settled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has been settled.', code: 'AUCTION_SETTLED' };
    }

    // Winner already set â€” auction is terminally ended
    if (auction.winner_bidder_id) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has already been won.', code: 'AUCTION_ALREADY_WON' };
    }

    const canonical = resolveCanonicalLifecycle({
      cancelledAt: auction.cancelled_at,
      settledAt: auction.settled_at,
      winnerBidderId: auction.winner_bidder_id,
      startsAt: auction.starts_at,
      endsAt: auction.ends_at,
      reservePriceGbp: auction.reserve_price_gbp === null ? null : Number(auction.reserve_price_gbp),
      currentBidGbp: Number(auction.current_bid_gbp),
      topBidAmountGbp: Number(auction.current_bid_gbp),
      paymentStatus: auction.paid_at ? 'paid' : 'unpaid',
      status: auction.status ?? null,
    });

    if (canonical.lifecycle === 'upcoming') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has not started yet.', code: 'AUCTION_NOT_STARTED' };
    }

    if (canonical.lifecycle === 'ended') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This auction has ended. Buy Now is no longer available.', code: 'AUCTION_ENDED' };
    }

    const buyNowPriceGbp = auction.buy_now_price_gbp !== null ? Number(auction.buy_now_price_gbp) : null;
    if (!buyNowPriceGbp || buyNowPriceGbp <= 0) {
      await client.query('ROLLBACK');
      reply.code(400);
      return { ok: false, error: 'This auction does not have a Buy Now price.', code: 'BUY_NOW_UNAVAILABLE' };
    }

    // Verify the client's expected price matches the authoritative stored price
    const expectedPrice = roundTo(payload.expectedPriceGbp, 2);
    if (expectedPrice !== buyNowPriceGbp) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'The Buy Now price has changed. Please review the updated price.',
        code: 'BUY_NOW_PRICE_CHANGED',
        currentBuyNowPriceGbp: buyNowPriceGbp,
      };
    }

    // Use the authoritative server price as the transaction amount
    const transactionAmountGbp = buyNowPriceGbp;

    const eligibility = await evaluateMarketEligibility(client, {
      userId: buyerId,
      market: 'auctions',
      orderNotionalGbp: transactionAmountGbp,
    });

    if (!eligibility.allowed) {
      await client.query('ROLLBACK');

      await appendComplianceAuditSafe(request, {
        eventType: 'auction.buy_now.blocked.eligibility',
        subjectUserId: buyerId,
        payload: {
          auctionId,
          amountGbp: transactionAmountGbp,
          code: eligibility.code,
          message: eligibility.message,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: eligibility.message,
        code: eligibility.code,
      };
    }

    const amlAssessment = await evaluateAmlRisk(client, {
      userId: buyerId,
      market: 'auctions',
      amountGbp: transactionAmountGbp,
      counterpartyUserId: auction.seller_id,
    });

    if (amlAssessment.shouldBlock) {
      await client.query('ROLLBACK');

      if (amlAssessment.shouldCreateAlert) {
        amlAlert = await createAmlAlert(db, {
          userId: buyerId,
          relatedUserId: auction.seller_id,
          market: 'auctions',
          eventType: 'buy_now',
          amountGbp: transactionAmountGbp,
          referenceId: auctionId,
          ruleCode: 'AML_PRE_TRADE_BLOCK',
          notes: 'Auction Buy Now blocked by AML pre-trade evaluation',
          context: {
            auctionId,
            buyerId,
            sellerId: auction.seller_id,
          },
          assessment: amlAssessment,
        });
      }

      await appendComplianceAuditSafe(request, {
        eventType: 'auction.buy_now.blocked.aml',
        subjectUserId: buyerId,
        payload: {
          auctionId,
          amountGbp: transactionAmountGbp,
          riskScore: amlAssessment.riskScore,
          riskLevel: amlAssessment.riskLevel,
          alertId: amlAlert?.alertId ?? null,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: 'Buy Now blocked by AML controls. Please contact support for manual review.',
        code: 'AML_BLOCKED',
        riskLevel: amlAssessment.riskLevel,
        alertId: amlAlert?.alertId ?? null,
      };
    }

    // Insert exactly one transaction/bid record
    const bidResult = await client.query<{
      id: number;
      created_at: string;
    }>(
      `
        INSERT INTO auction_bids (auction_id, bidder_id, amount_gbp, idempotency_key)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at
      `,
      [auctionId, buyerId, transactionAmountGbp, scopedKey]
    );

    const nextBidCount = auction.bid_count + 1;

    // Mark the auction ended and set winner fields atomically
    await client.query(
      `
        UPDATE auctions
        SET current_bid_gbp = $2,
            bid_count = $3,
            winner_bidder_id = $4,
            winner_bid_id = $5,
            status = 'ended',
            updated_at = NOW()
        WHERE id = $1
      `,
      [auctionId, transactionAmountGbp, nextBidCount, buyerId, bidResult.rows[0].id]
    );

    // T08: Create an order record so Buy Now flows into fulfilment.
    // The orders.auction_id column (migration 065) has a partial unique
    // index (WHERE auction_id IS NOT NULL), guaranteeing exactly one
    // order per auction Buy Now. We use a pre-check + INSERT rather
    // than ON CONFLICT because the partial index makes parameter type
    // inference unreliable in some PostgreSQL versions.
    let orderId = `auc-${auctionId}-${scopedKey.slice(-12)}`;
    const existingOrder = await client.query<{ id: string }>(
      `SELECT id FROM orders WHERE auction_id = $1 LIMIT 1`,
      [auctionId]
    );
    if (!existingOrder.rowCount) {
      await client.query(
        `
          INSERT INTO orders (
            id, buyer_id, seller_id, listing_id,
            subtotal_gbp, buyer_protection_fee_gbp, total_gbp,
            status, auction_id
          )
          VALUES ($1, $2, $3, $4, $5, 0, $5, 'created', $6)
        `,
        [orderId, buyerId, auction.seller_id, auction.listing_id, transactionAmountGbp, auctionId]
      );
    } else {
      // Order already exists from a prior idempotent replay â€” reuse its ID
      orderId = existingOrder.rows[0].id;
    }

    if (amlAssessment.shouldCreateAlert) {
      amlAlert = await createAmlAlert(client, {
        userId: buyerId,
        relatedUserId: auction.seller_id,
        market: 'auctions',
        eventType: 'buy_now',
        amountGbp: transactionAmountGbp,
        referenceId: auctionId,
        ruleCode: 'AML_POST_BUY_NOW_MONITOR',
        notes: 'Auction Buy Now generated elevated AML risk score',
        context: {
          auctionId,
          buyerId,
          sellerId: auction.seller_id,
        },
        assessment: amlAssessment,
      });
    }

    // Store idempotency response before commit so it persists with the transaction
    await storeIdempotencyResponse(client, {
      idempotencyKey: scopedKey,
      operationType: 'buy_now',
      auctionId,
      userId: buyerId,
      responseStatus: 201,
      responseBody: {
        ok: true,
        isBuyNow: true,
        orderId,
        bid: {
          id: bidResult.rows[0].id,
          auctionId,
          bidderId: buyerId,
          amountGbp: transactionAmountGbp,
          createdAt: bidResult.rows[0].created_at,
        },
        auction: {
          id: auctionId,
          currentBidGbp: transactionAmountGbp,
          bidCount: nextBidCount,
          isBuyNow: true,
          status: 'ended',
          winnerBidderId: buyerId,
        },
        aml: amlAlert
          ? { alertId: amlAlert.alertId, status: amlAlert.status }
          : null,
      },
    });

    // Mark the underlying listing as sold â€” the Buy Now is an immediate
    // purchase, so the item is no longer available. This aligns auction
    // Buy Now with the direct-checkout flow which also sets status = 'sold'
    // via the reconcile_listing_checkout_from_order trigger.
    await client.query(
      `UPDATE listings
       SET status = 'sold', updated_at = NOW()
       WHERE id = $1`,
      [auction.listing_id]
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.buy_now.completed',
      payload: {
        auctionId,
        buyerId,
        amountGbp: transactionAmountGbp,
        bidCount: nextBidCount,
        isBuyNow: true,
      },
      // R01: versioned event for forward-compatible client parsing.
      seq: true,
      version: 1,
    });

    publishRealtimeEvent({
      topic: 'auctions.market',
      type: 'auction.buy_now.completed',
      payload: {
        auctionId,
        currentBidGbp: transactionAmountGbp,
        bidCount: nextBidCount,
        isBuyNow: true,
      },
      seq: true,
      version: 1,
    });

    try {
      await queueUserNotification({
        userId: auction.seller_id,
        title: 'Auction won via Buy Now',
        body: `Your auction was won via Buy Now for ${transactionAmountGbp.toFixed(2)} GBP.`,
        eventType: 'auction_buy_now',
        payload: {
          auctionId,
          buyerId,
          amountGbp: transactionAmountGbp,
          event: 'auction_buy_now',
        },
        route: { screen: 'AuctionDetail', params: { auctionId } },
        idempotencyKey: `auction-buy-now-${auctionId}`,
        metadata: {
          source: 'auction_buy_now_route',
        },
      });
    } catch (error) {
      request.log.error({ err: error, auctionId }, 'Failed to queue seller Buy Now notification');
    }

    await appendComplianceAuditSafe(request, {
      eventType: 'auction.buy_now.completed',
      subjectUserId: buyerId,
      payload: {
        auctionId,
        amountGbp: transactionAmountGbp,
        bidCount: nextBidCount,
        amlAlertId: amlAlert?.alertId ?? null,
      },
    });

    reply.code(201);
    return {
      ok: true,
      isBuyNow: true,
      orderId,
      bid: {
        id: bidResult.rows[0].id,
        auctionId,
        bidderId: buyerId,
        amountGbp: transactionAmountGbp,
        createdAt: bidResult.rows[0].created_at,
      },
      auction: {
        id: auctionId,
        currentBidGbp: transactionAmountGbp,
        bidCount: nextBidCount,
        isBuyNow: true,
        status: 'ended',
        winnerBidderId: buyerId,
      },
      aml: amlAlert
        ? {
          alertId: amlAlert.alertId,
          status: amlAlert.status,
        }
        : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ err: error, auctionId, buyerId }, 'Buy Now failed');
    reply.code(500);
    return {
      ok: false,
      error: `Unable to complete Buy Now: ${(error as Error).message}`,
    };
  } finally {
    client.release();
  }
});

app.get('/auctions/:auctionId', async (request, reply) => {
  await optionalAuthenticate(request, '/auctions/:auctionId');
  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const { auctionId } = paramsSchema.parse(request.params);

  const viewerUserId = request.authUser?.userId ?? null;

  const result = await db.query<{
    id: string;
    listing_id: string;
    seller_id: string;
    starts_at: string;
    ends_at: string;
    starting_bid_gbp: number | string;
    current_bid_gbp: number | string;
    buy_now_price_gbp: number | string | null;
    min_increment_gbp: number | string;
    bid_count: number;
    status: string;
    winner_bidder_id: string | null;
    settled_at: string | null;
    cancelled_at: string | null;
    cancelled_by: string | null;
    cancelled_reason: string | null;
    reserve_price_gbp: number | string | null;
    paid_at: string | null;
    payment_deadline_at: string | null;
    payment_confirmed_by: string | null;
    second_chance_offered_to: string | null;
    anti_sniping_enabled: boolean;
    anti_sniping_extension_seconds: number | null;
    anti_sniping_max_extensions: number;
    anti_sniping_window_seconds: number | null;
    extension_count: number;
    created_at: string;
    title: string | null;
    image_url: string | null;
    brand: string | null;
    category: string | null;
    condition_label: string | null;
    description: string | null;
    price_gbp: number | string | null;
    media_frozen_at: string | null;
    seller_username: string | null;
    seller_avatar: string | null;
    seller_display_name: string | null;
    is_watched: boolean | null;
    viewer_highest_bid: string | null;
  }>(
    `
      SELECT
        a.id,
        a.listing_id,
        a.seller_id,
        a.starts_at,
        a.ends_at,
        a.starting_bid_gbp,
        a.current_bid_gbp,
        a.buy_now_price_gbp,
        a.min_increment_gbp,
        a.bid_count,
        a.status,
        a.winner_bidder_id,
        a.settled_at,
        a.cancelled_at,
        a.cancelled_by,
        a.cancelled_reason,
        a.reserve_price_gbp,
        a.paid_at,
        a.payment_deadline_at,
        a.payment_confirmed_by,
        a.second_chance_offered_to,
        a.anti_sniping_enabled,
        a.anti_sniping_extension_seconds,
        a.anti_sniping_max_extensions,
        a.anti_sniping_window_seconds,
        a.extension_count,
        a.created_at,
        l.title,
        l.image_url,
        l.brand,
        l.category,
        l.condition AS condition_label,
        l.description,
        l.price_gbp,
        l.media_frozen_at,
        u.username AS seller_username,
        u.avatar AS seller_avatar,
        u.display_name AS seller_display_name,
        ${viewerUserId ? `EXISTS (SELECT 1 FROM auction_watchlist aw WHERE aw.auction_id = a.id AND aw.user_id = $2)::boolean` : 'false::boolean'} AS is_watched,
        ${viewerUserId ? `(SELECT MAX(ab.amount_gbp)::text FROM auction_bids ab WHERE ab.auction_id = a.id AND ab.bidder_id = $2)` : 'NULL::text'} AS viewer_highest_bid
      FROM auctions a
      LEFT JOIN listings l ON l.id = a.listing_id
      LEFT JOIN users u ON u.id = a.seller_id
      WHERE a.id = $1
      LIMIT 1
    `,
    viewerUserId ? [auctionId, viewerUserId] : [auctionId]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'Auction not found' };
  }

  const startsAt = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);
  const canonical = resolveCanonicalLifecycle({
    cancelledAt: row.cancelled_at,
    settledAt: row.settled_at,
    winnerBidderId: row.winner_bidder_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
    currentBidGbp: Number(row.current_bid_gbp),
    topBidAmountGbp: Number(row.current_bid_gbp),
    paymentStatus: row.paid_at ? 'paid' : 'unpaid',
    status: row.status ?? null,
  });
  const computedStatus = canonical.lifecycle;
  const currentBid = Number(row.current_bid_gbp);
  const minIncrement = Number(row.min_increment_gbp) || 0.01;
  const minimumNextBid = roundTo(currentBid + minIncrement, 2);

  let viewerState: 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller' = 'not_participating';
  const isWatched = !!row.is_watched;
  const viewerHighestBid = row.viewer_highest_bid ? Number(row.viewer_highest_bid) : null;

  if (viewerUserId && row.seller_id === viewerUserId) {
    viewerState = 'seller';
  } else if (computedStatus === 'ended' || computedStatus === 'cancelled' || computedStatus === 'settled') {
    if (row.winner_bidder_id && row.winner_bidder_id === viewerUserId) {
      viewerState = 'won';
    } else if (viewerHighestBid !== null) {
      viewerState = 'lost';
    } else if (isWatched) {
      viewerState = 'watching';
    }
  } else if (viewerHighestBid !== null) {
    viewerState = viewerHighestBid >= currentBid ? 'leading' : 'outbid';
  } else if (isWatched) {
    viewerState = 'watching';
  }

  const bidsResult = await db.query<{
    id: number;
    bidder_id: string;
    amount_gbp: number | string;
    created_at: string;
    bidder_username: string | null;
  }>(
    `
      SELECT ab.id, ab.bidder_id, ab.amount_gbp, ab.created_at, u.username AS bidder_username
      FROM auction_bids ab
      LEFT JOIN users u ON u.id = ab.bidder_id
      WHERE ab.auction_id = $1
      ORDER BY ab.amount_gbp DESC, ab.created_at ASC
      LIMIT 20
    `,
    [auctionId]
  );

  const mediaResult = await db.query<{
    id: string;
    image_url: string;
    sort_order: number;
    media_width: number | null;
    media_height: number | null;
    media_type: 'image' | 'video' | null;
    poster_url: string | null;
    poster_verified_at: string | null;
    blurhash: string | null;
    focal_x: string | number | null;
    focal_y: string | number | null;
  }>(
    `
      SELECT
        id,
        image_url,
        sort_order,
        NULLIF(to_jsonb(listing_images) ->> 'media_width', '')::integer AS media_width,
        NULLIF(to_jsonb(listing_images) ->> 'media_height', '')::integer AS media_height,
        COALESCE(NULLIF(to_jsonb(listing_images) ->> 'media_type', ''), 'image') AS media_type,
        NULLIF(to_jsonb(listing_images) ->> 'poster_url', '') AS poster_url,
        NULLIF(to_jsonb(listing_images) ->> 'poster_verified_at', '') AS poster_verified_at,
        NULLIF(to_jsonb(listing_images) ->> 'blurhash', '') AS blurhash,
        NULLIF(to_jsonb(listing_images) ->> 'focal_x', '') AS focal_x,
        NULLIF(to_jsonb(listing_images) ->> 'focal_y', '') AS focal_y
      FROM listing_images
      WHERE listing_id = $1
      ORDER BY sort_order, created_at, id
    `,
    [row.listing_id]
  );

  const mediaItems = mediaResult.rows.map((media) => ({
    id: media.id,
    type: media.media_type === 'video' ? 'video' as const : 'image' as const,
    url: media.image_url,
    width: media.media_width,
    height: media.media_height,
    blurhash: media.blurhash,
    focalX: media.focal_x == null ? null : Number(media.focal_x),
    focalY: media.focal_y == null ? null : Number(media.focal_y),
    posterUrl: media.poster_url,
    posterVerifiedAt: media.poster_verified_at,
    order: media.sort_order,
  }));

  if (mediaItems.length === 0 && row.image_url) {
    mediaItems.push({
      id: `${row.listing_id}:primary`,
      type: 'image',
      url: row.image_url,
      width: null,
      height: null,
      blurhash: null,
      focalX: null,
      focalY: null,
      posterUrl: null,
      posterVerifiedAt: null,
      order: 0,
    });
  }

  return {
    ok: true,
    auction: {
      id: row.id,
      listingId: row.listing_id,
      seller: {
        id: row.seller_id,
        username: row.seller_username ?? 'unknown',
        displayName: row.seller_display_name ?? null,
        avatarUrl: row.seller_avatar ?? null,
      },
      title: row.title ?? 'Untitled',
      imageUrl: row.image_url ?? null,
      // Per spec 02_AUCTION Â§7: canonical media array. Empty until
      // the listing_media table is populated. imageUrl remains as a
      // compatibility field.
      mediaItems,
      mediaFrozenAt: row.media_frozen_at,
      brand: row.brand ?? null,
      category: row.category ?? null,
      conditionLabel: row.condition_label ?? null,
      description: row.description ?? null,
      listingPriceGbp: row.price_gbp !== null ? Number(row.price_gbp) : null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      startingBidGbp: Number(row.starting_bid_gbp),
      currentBidGbp: currentBid,
      minimumNextBidGbp: minimumNextBid,
      buyNowPriceGbp: row.buy_now_price_gbp === null ? null : Number(row.buy_now_price_gbp),
      // T07: authoritative reserve price from the auctions table.
      // NULL means no reserve set (auction is effectively reserve-met).
      reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
      bidCount: row.bid_count,
      lifecycle: computedStatus,
      terminalReason: canonical.terminalReason,
      viewerState,
      isWatched,
      winnerBidderId: row.winner_bidder_id,
      settledAt: row.settled_at,
      cancelledAt: row.cancelled_at,
      cancelledBy: row.cancelled_by,
      cancelledReason: row.cancelled_reason,
      paidAt: row.paid_at,
      paymentDeadlineAt: row.payment_deadline_at,
      paymentConfirmedBy: row.payment_confirmed_by,
      secondChanceOfferedTo: row.second_chance_offered_to,
      antiSniping: row.anti_sniping_enabled
        ? {
          enabled: true,
          extensionSeconds: row.anti_sniping_extension_seconds,
          maxExtensions: row.anti_sniping_max_extensions,
          windowSeconds: row.anti_sniping_window_seconds,
          extensionCount: row.extension_count,
        }
        : null,
      createdAt: row.created_at,
      // Per spec 02_AUCTION Â§8: backend-backed fulfilment contract.
      // Null until the auction is terminal and fulfilment data exists.
      fulfilment: null,
      // Buyer protection is a platform-wide feature: all auction
      // transactions go through escrow with a buyer protection hold
      // (default 48h after delivery). This is truthful â€” not per-listing.
      buyerProtection: config.buyerProtectionHoldHours > 0,
    },
    bidActivity: bidsResult.rows.map((b) => ({
      id: b.id,
      bidderId: b.bidder_id,
      bidderUsername: b.bidder_username ?? 'unknown',
      amountGbp: Number(b.amount_gbp),
      createdAt: b.created_at,
      isViewer: viewerUserId === b.bidder_id,
    })),
    serverNow: new Date().toISOString(),
  };
});

app.get('/auctions/watchlist', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const viewerUserId = request.authUser.userId;
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(60).default(30),
    cursor: z.string().optional(),
  });
  const { limit, cursor } = querySchema.parse(request.query);

  let cursorCondition = '';
  const params: Array<string | number> = [viewerUserId];
  let paramIdx = 1;

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
      if (decoded.ts && decoded.id) {
        paramIdx++;
        const cursorTsParam = paramIdx;
        paramIdx++;
        const cursorIdParam = paramIdx;
        params.push(decoded.ts, decoded.id);
        cursorCondition = ` AND (aw.created_at < $${cursorTsParam} OR (aw.created_at = $${cursorTsParam} AND aw.id < $${cursorIdParam}))`;
      }
    } catch {
      // Invalid cursor
    }
  }

  paramIdx++;
  const limitParam = paramIdx;
  params.push(limit + 1);

  const result = await db.query<{
    id: string;
    listing_id: string;
    seller_id: string;
    starts_at: string;
    ends_at: string;
    starting_bid_gbp: number | string;
    current_bid_gbp: number | string;
    buy_now_price_gbp: number | string | null;
    reserve_price_gbp: number | string | null;
    min_increment_gbp: number | string;
    bid_count: number;
    status: string;
    winner_bidder_id: string | null;
    settled_at: string | null;
    cancelled_at: string | null;
    paid_at: string | null;
    created_at: string;
    title: string | null;
    image_url: string | null;
    brand: string | null;
    category: string | null;
    condition_label: string | null;
    seller_username: string | null;
    seller_display_name: string | null;
    seller_avatar: string | null;
    watched_at: string;
    aw_id: number;
  }>(
    `
      SELECT
        a.id,
        a.listing_id,
        a.seller_id,
        a.starts_at,
        a.ends_at,
        a.starting_bid_gbp,
        a.current_bid_gbp,
        a.buy_now_price_gbp,
        a.reserve_price_gbp,
        a.min_increment_gbp,
        a.bid_count,
        a.status,
        a.winner_bidder_id,
        a.settled_at,
        a.cancelled_at,
        a.paid_at,
        a.created_at,
        l.title,
        l.image_url,
        l.brand,
        l.category,
        l.condition AS condition_label,
        u.username AS seller_username,
        u.display_name AS seller_display_name,
        u.avatar AS seller_avatar,
        aw.created_at AS watched_at,
        aw.id AS aw_id
      FROM auction_watchlist aw
      INNER JOIN auctions a ON a.id = aw.auction_id
      LEFT JOIN listings l ON l.id = a.listing_id
      LEFT JOIN users u ON u.id = a.seller_id
      WHERE aw.user_id = $1 AND a.cancelled_at IS NULL${cursorCondition}
      ORDER BY aw.created_at DESC, aw.id DESC
      LIMIT $${limitParam}
    `,
    params
  );

  const hasMore = result.rows.length > limit;
  const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;

  const items = pageRows.map((row) => {
    const canonical = resolveCanonicalLifecycle({
      cancelledAt: row.cancelled_at,
      settledAt: row.settled_at,
      winnerBidderId: row.winner_bidder_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
      currentBidGbp: Number(row.current_bid_gbp),
      topBidAmountGbp: Number(row.current_bid_gbp),
      paymentStatus: row.paid_at ? 'paid' : 'unpaid',
      status: row.status ?? null,
    });
    const computedStatus = canonical.lifecycle;
    const currentBid = Number(row.current_bid_gbp);
    const minIncrement = Number(row.min_increment_gbp) || 0.01;

    let viewerState: 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller' = 'watching';
    const viewerHighestBid = row.winner_bidder_id === viewerUserId ? currentBid : null;

    if (viewerUserId && row.seller_id === viewerUserId) {
      viewerState = 'seller';
    } else if (computedStatus === 'ended' || computedStatus === 'settled') {
      if (row.winner_bidder_id === viewerUserId) {
        viewerState = 'won';
      } else if (viewerHighestBid !== null) {
        viewerState = 'lost';
      }
    }

    return {
      id: row.id,
      listingId: row.listing_id,
      seller: {
        id: row.seller_id,
        username: row.seller_username ?? 'unknown',
        displayName: row.seller_display_name ?? null,
        avatarUrl: row.seller_avatar ?? null,
      },
      title: row.title ?? 'Untitled',
      imageUrl: row.image_url ?? null,
      brand: row.brand ?? null,
      category: row.category ?? null,
      conditionLabel: row.condition_label ?? null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      startingBidGbp: Number(row.starting_bid_gbp),
      currentBidGbp: currentBid,
      minimumNextBidGbp: roundTo(currentBid + minIncrement, 2),
      buyNowPriceGbp: row.buy_now_price_gbp === null ? null : Number(row.buy_now_price_gbp),
      reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
      bidCount: row.bid_count,
      lifecycle: computedStatus,
      terminalReason: canonical.terminalReason,
      viewerState,
      isWatched: true,
      winnerBidderId: row.winner_bidder_id,
      watchedAt: row.watched_at,
      createdAt: row.created_at,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ ts: last.watched_at, id: String(last.aw_id) }), 'utf-8').toString('base64url');
  }

  return { ok: true, items, nextCursor };
});

app.post('/auctions/:auctionId/watch', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const { auctionId } = paramsSchema.parse(request.params);
  const userId = request.authUser.userId;

  const auctionExists = await db.query('SELECT id FROM auctions WHERE id = $1 AND cancelled_at IS NULL LIMIT 1', [auctionId]);
  if (!auctionExists.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Auction not found' };
  }

  try {
    await db.query(
      `INSERT INTO auction_watchlist (user_id, auction_id) VALUES ($1, $2) ON CONFLICT (user_id, auction_id) DO NOTHING`,
      [userId, auctionId]
    );
  } catch {
    // Auction may have been deleted â€” safe ignore
  }

  return { ok: true, isWatched: true };
});

app.delete('/auctions/:auctionId/watch', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const { auctionId } = paramsSchema.parse(request.params);
  const userId = request.authUser.userId;

  await db.query(
    `DELETE FROM auction_watchlist WHERE user_id = $1 AND auction_id = $2`,
    [userId, auctionId]
  );

  return { ok: true, isWatched: false };
});

app.get('/users/me/auction-bids', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bidderId = request.authUser.userId;
  const querySchema = z.object({
    status: z.enum(['active', 'won', 'lost', 'all']).default('all'),
    limit: z.coerce.number().int().min(1).max(60).default(30),
    cursor: z.string().optional(),
  });
  const { status, limit, cursor } = querySchema.parse(request.query);

  let cursorCondition = '';
  const params: Array<string | number> = [bidderId];
  let paramIdx = 1;

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
      if (decoded.ts && decoded.id) {
        paramIdx++;
        const cursorTsParam = paramIdx;
        paramIdx++;
        const cursorIdParam = paramIdx;
        params.push(decoded.ts, decoded.id);
        cursorCondition = ` AND (ab.created_at < $${cursorTsParam} OR (ab.created_at = $${cursorTsParam} AND ab.id < $${cursorIdParam}))`;
      }
    } catch {
      // Invalid cursor
    }
  }

  paramIdx++;
  const limitParam = paramIdx;
  params.push(limit + 1);

  const result = await db.query<{
    id: number;
    auction_id: string;
    amount_gbp: number | string;
    created_at: string;
    starts_at: string;
    ends_at: string;
    current_bid_gbp: number | string;
    bid_count: number;
    winner_bidder_id: string | null;
    settled_at: string | null;
    cancelled_at: string | null;
    reserve_price_gbp: number | string | null;
    paid_at: string | null;
    status: string;
    title: string | null;
    image_url: string | null;
    seller_id: string;
    seller_username: string | null;
  }>(
    `
      SELECT
        ab.id,
        ab.auction_id,
        ab.amount_gbp,
        ab.created_at,
        a.starts_at,
        a.ends_at,
        a.current_bid_gbp,
        a.bid_count,
        a.winner_bidder_id,
        a.settled_at,
        a.cancelled_at,
        a.reserve_price_gbp,
        a.paid_at,
        a.status,
        l.title,
        l.image_url,
        a.seller_id,
        u.username AS seller_username
      FROM auction_bids ab
      INNER JOIN auctions a ON a.id = ab.auction_id
      LEFT JOIN listings l ON l.id = a.listing_id
      LEFT JOIN users u ON u.id = a.seller_id
      WHERE ab.bidder_id = $1${cursorCondition}
      ORDER BY ab.created_at DESC, ab.id DESC
      LIMIT $${limitParam}
    `,
    params
  );

  const hasMore = result.rows.length > limit;
  const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;

  const items = pageRows.map((row) => {
    const canonical = resolveCanonicalLifecycle({
      cancelledAt: row.cancelled_at,
      settledAt: row.settled_at,
      winnerBidderId: row.winner_bidder_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reservePriceGbp: row.reserve_price_gbp === null ? null : Number(row.reserve_price_gbp),
      currentBidGbp: Number(row.current_bid_gbp),
      topBidAmountGbp: Number(row.current_bid_gbp),
      paymentStatus: row.paid_at ? 'paid' : 'unpaid',
      status: row.status ?? null,
    });
    const computedStatus = canonical.lifecycle;
    const currentBid = Number(row.current_bid_gbp);
    const myBid = Number(row.amount_gbp);

    let bidState: 'active' | 'leading' | 'outbid' | 'won' | 'lost' = 'active';
    if (computedStatus === 'ended' || computedStatus === 'settled' || computedStatus === 'cancelled') {
      if (row.winner_bidder_id === bidderId) {
        bidState = 'won';
      } else {
        bidState = 'lost';
      }
    } else if (myBid >= currentBid) {
      bidState = 'leading';
    } else {
      bidState = 'outbid';
    }

    return {
      id: row.id,
      auctionId: row.auction_id,
      amountGbp: myBid,
      createdAt: row.created_at,
      bidState,
      auction: {
        id: row.auction_id,
        title: row.title ?? 'Untitled',
        imageUrl: row.image_url ?? null,
        currentBidGbp: currentBid,
        bidCount: row.bid_count,
        lifecycle: computedStatus,
        terminalReason: canonical.terminalReason,
        winnerBidderId: row.winner_bidder_id,
        sellerId: row.seller_id,
        sellerUsername: row.seller_username ?? 'unknown',
        endsAt: row.ends_at,
      },
    };
  });

  const filtered = status === 'all' ? items : items.filter((item) => {
    if (status === 'active') return item.bidState === 'leading' || item.bidState === 'outbid';
    return item.bidState === status;
  });

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ ts: last.created_at, id: String(last.id) }), 'utf-8').toString('base64url');
  }

  return { ok: true, items: filtered, nextCursor };
});

// ── Unknown-outcome reconciliation for auction bids ────────────────
//
// GET /users/me/auction-bids/lookup-by-key/:idempotencyKey
//
// When a client sends POST /auctions/:auctionId/bids but the response is
// lost (network timeout), the outcome is ambiguous — the bid may or may
// not have been placed. This endpoint resolves the ambiguity by looking
// up the bid by its idempotency key. Returns:
//   - 200 { ok: true, status: 'acknowledged', bid }
//   - 404 { ok: false, status: 'safe_to_retry' }
app.get('/users/me/auction-bids/lookup-by-key/:idempotencyKey', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bidderId = request.authUser.userId;
  const { idempotencyKey } = z.object({
    idempotencyKey: z.string().min(2).max(200),
  }).parse(request.params);

  const result = await db.query<{
    id: number;
    auction_id: string;
    bidder_id: string;
    amount_gbp: number | string;
    is_proxy: boolean;
    max_bid_gbp: number | string | null;
    idempotency_key: string | null;
    created_at: string;
  }>(
    `SELECT id, auction_id, bidder_id, amount_gbp,
            is_proxy, max_bid_gbp, idempotency_key, created_at
     FROM auction_bids
     WHERE bidder_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [bidderId, idempotencyKey],
  );

  if (!result.rowCount) {
    reply.code(404);
    return { ok: false, status: 'safe_to_retry' as const };
  }

  const row = result.rows[0];
  return {
    ok: true as const,
    status: 'acknowledged' as const,
    bid: {
      id: row.id,
      auctionId: row.auction_id,
      amountGbp: Number(row.amount_gbp),
      isProxy: row.is_proxy,
      maxBidGbp: row.max_bid_gbp !== null ? Number(row.max_bid_gbp) : null,
      createdAt: row.created_at,
    },
  };
});

// ── T20: Seller cancellation ──────────────────────────────────────
// Allows a seller to cancel an auction that is not yet terminal.
// Notifies all bidders and reactivates the listing.

app.post('/auctions/:auctionId/cancel', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const bodySchema = z.object({
    reason: z.string().min(1).max(500).optional(),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
      cancelled_at: string | null;
      settled_at: string | null;
      winner_bidder_id: string | null;
    }>(
      `SELECT id, seller_id, listing_id, status, cancelled_at, settled_at, winner_bidder_id
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.seller_id !== userId && request.authUser.role !== 'admin') {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the seller can cancel this auction', code: 'SELLER_RESTRICTED' };
    }

    if (auction.cancelled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction already cancelled', code: 'AUCTION_CANCELLED' };
    }

    if (auction.settled_at || auction.status === 'settled') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Cannot cancel a settled auction', code: 'AUCTION_SETTLED' };
    }

    // Block cancellation after payment is confirmed or awaiting payment
    if (auction.status === 'awaiting_payment' || auction.winner_bidder_id) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Cannot cancel an auction with a confirmed winner', code: 'AUCTION_HAS_WINNER' };
    }

    // Cancel the auction and reactivate the listing
    await client.query(
      `UPDATE auctions
       SET cancelled_at = NOW(), cancelled_by = $2, cancelled_reason = $3,
           status = 'ended', updated_at = NOW()
       WHERE id = $1`,
      [auctionId, userId, payload.reason ?? null],
    );
    await client.query(
      `UPDATE listings SET status = 'active', updated_at = NOW()
       WHERE id = $1 AND status = 'paused'`,
      [auction.listing_id],
    );

    // Notify all bidders
    const bidders = await client.query<{ bidder_id: string }>(
      `SELECT DISTINCT bidder_id FROM auction_bids WHERE auction_id = $1`,
      [auctionId],
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.cancelled',
      payload: {
        auctionId,
        listingId: auction.listing_id,
        cancelledBy: userId,
        reason: payload.reason ?? null,
      },
      seq: true,
      version: 1,
    });

    for (const row of bidders.rows) {
      try {
        await queueUserNotification({
          userId: row.bidder_id,
          title: 'Auction cancelled',
          body: payload.reason
            ? `The seller cancelled this auction: ${payload.reason}`
            : 'The seller has cancelled this auction.',
          eventType: 'auction_outbid',
          payload: { auctionId, event: 'auction_cancelled' },
          route: { screen: 'AuctionDetail', params: { auctionId } },
          idempotencyKey: `auction-cancel-${auctionId}-${row.bidder_id}`,
        });
      } catch (error) {
        request.log.error({ err: error, auctionId }, 'Failed to queue cancellation notification');
      }
    }

    return { ok: true, auctionId, cancelledAt: new Date().toISOString() };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to cancel auction: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});

// ── T20: Payment confirmation ─────────────────────────────────────
// The winner confirms payment. This triggers settlement: listing marked
// sold, ledger entries posted, order created, and status → settled.

app.post('/auctions/:auctionId/payment', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const bodySchema = z.object({
    idempotencyKey: z.string().min(4).max(140),
    paymentMethodId: z.number().int().positive().optional(),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
      winner_bidder_id: string | null;
      winner_bid_id: number | null;
      current_bid_gbp: number | string;
      cancelled_at: string | null;
      settled_at: string | null;
      paid_at: string | null;
    }>(
      `SELECT id, seller_id, listing_id, status, winner_bidder_id, winner_bid_id,
              current_bid_gbp, cancelled_at, settled_at, paid_at
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.cancelled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction cancelled', code: 'AUCTION_CANCELLED' };
    }

    if (auction.settled_at || auction.status === 'settled') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction already settled', code: 'AUCTION_SETTLED' };
    }

    if (auction.status !== 'awaiting_payment' && auction.status !== 'payment_expired') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction is not awaiting payment', code: 'NOT_AWAITING_PAYMENT' };
    }

    // Only the winner (or admin) can confirm payment
    if (auction.winner_bidder_id !== userId && request.authUser.role !== 'admin') {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the winner can confirm payment', code: 'WINNER_RESTRICTED' };
    }

    if (auction.paid_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Payment already confirmed', code: 'PAYMENT_ALREADY_CONFIRMED' };
    }

    const winningBidGbp = Number(auction.current_bid_gbp);
    const platformFeeGbp = calculateAuctionPlatformFeeGbp(winningBidGbp);

    // Settle the auction
    await client.query(
      `UPDATE auctions
       SET status = 'settled', settled_at = NOW(), paid_at = NOW(),
           payment_confirmed_by = $2, payment_method_id = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [auctionId, userId, payload.paymentMethodId ?? null],
    );

    // Mark listing as sold — payment is now confirmed
    await client.query(
      `UPDATE listings SET status = 'sold', updated_at = NOW() WHERE id = $1`,
      [auction.listing_id],
    );

    // Create order record (reuse the Buy Now order pattern)
    const orderId = `auc-pay-${auctionId}-${payload.idempotencyKey.slice(-12)}`;
    const existingOrder = await client.query<{ id: string }>(
      `SELECT id FROM orders WHERE auction_id = $1 LIMIT 1`,
      [auctionId],
    );
    if (!existingOrder.rowCount) {
      await client.query(
        `INSERT INTO orders (id, buyer_id, seller_id, listing_id, subtotal_gbp,
           buyer_protection_fee_gbp, total_gbp, status, auction_id)
         VALUES ($1, $2, $3, $4, $5, 0, $5, 'paid', $6)`,
        [orderId, auction.winner_bidder_id, auction.seller_id, auction.listing_id, winningBidGbp, auctionId],
      );
    }

    // Post ledger entries now that payment is confirmed
    const canPostLedger = await ledgerTablesAvailable(client);
    if (canPostLedger) {
      await postAuctionSettlementLedgerEntries(client, {
        auctionId,
        buyerId: auction.winner_bidder_id!,
        sellerId: auction.seller_id,
        winningBidGbp,
        platformFeeGbp,
      });
    }

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.settled',
      payload: {
        auctionId,
        listingId: auction.listing_id,
        winnerBidderId: auction.winner_bidder_id,
        winnerAmountGbp: winningBidGbp,
        platformFeeRate: AUCTION_PLATFORM_FEE_RATE,
        platformFeeGbp,
        reason: 'payment_confirmed',
      },
      seq: true,
      version: 1,
    });

    // Notify seller
    try {
      await queueUserNotification({
        userId: auction.seller_id,
        title: 'Payment received',
        body: `Payment of £${winningBidGbp.toFixed(2)} received for ${auctionId}. The auction is settled.`,
        eventType: 'auction_won',
        payload: { auctionId, event: 'auction_payment_confirmed', orderId },
        route: { screen: 'AuctionDetail', params: { auctionId } },
        idempotencyKey: `auction-payment-${auctionId}`,
      });
    } catch (error) {
      request.log.error({ err: error, auctionId }, 'Failed to queue payment notification');
    }

    return {
      ok: true,
      orderId: existingOrder.rowCount ? existingOrder.rows[0].id : orderId,
      auction: {
        id: auctionId,
        status: 'settled',
        settledAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to confirm payment: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});

// ── T20: Second-chance acceptance ─────────────────────────────────
// The next-highest bidder accepts the second-chance offer.

app.post('/auctions/:auctionId/second-chance/accept', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const bodySchema = z.object({
    idempotencyKey: z.string().min(4).max(140),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
      second_chance_offered_to: string | null;
      payment_deadline_at: string | null;
      winner_bid_id: number | null;
      current_bid_gbp: number | string;
    }>(
      `SELECT id, seller_id, listing_id, status, second_chance_offered_to,
              payment_deadline_at, winner_bid_id, current_bid_gbp
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.status !== 'payment_expired') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'No second-chance offer available', code: 'NO_SECOND_CHANCE' };
    }

    if (auction.second_chance_offered_to !== userId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'You are not the second-chance recipient', code: 'NOT_SECOND_CHANCE_RECIPIENT' };
    }

    // Check deadline hasn't passed
    if (auction.payment_deadline_at && new Date(auction.payment_deadline_at) <= new Date()) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Second-chance deadline has passed', code: 'SECOND_CHANCE_EXPIRED' };
    }

    // Transition to awaiting_payment with the new winner
    const newDeadline = new Date(Date.now() + 24 * 3600_000).toISOString();
    await client.query(
      `UPDATE auctions
       SET status = 'awaiting_payment',
           second_chance_offered_to = NULL,
           payment_deadline_at = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [auctionId, newDeadline],
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.awaiting_payment',
      payload: {
        auctionId,
        listingId: auction.listing_id,
        winnerBidderId: userId,
        paymentDeadlineAt: newDeadline,
        reason: 'second_chance_accepted',
      },
      seq: true,
      version: 1,
    });

    return {
      ok: true,
      auction: {
        id: auctionId,
        status: 'awaiting_payment',
        paymentDeadlineAt: newDeadline,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to accept second chance: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});

// ── T20: Second-chance decline ────────────────────────────────────
// The next-highest bidder declines — the item is relisted.

app.post('/auctions/:auctionId/second-chance/decline', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const { auctionId } = paramsSchema.parse(request.params);
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      listing_id: string;
      seller_id: string;
      status: string;
      second_chance_offered_to: string | null;
    }>(
      `SELECT id, listing_id, seller_id, status, second_chance_offered_to
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.status !== 'payment_expired') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'No second-chance offer available', code: 'NO_SECOND_CHANCE' };
    }

    if (auction.second_chance_offered_to !== userId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'You are not the second-chance recipient', code: 'NOT_SECOND_CHANCE_RECIPIENT' };
    }

    // Relist the item
    await client.query(
      `UPDATE auctions
       SET winner_bidder_id = NULL, winner_bid_id = NULL,
           second_chance_offered_to = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [auctionId],
    );
    await client.query(
      `UPDATE listings SET status = 'active', updated_at = NOW()
       WHERE id = $1 AND status = 'paused'`,
      [auction.listing_id],
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.payment_expired',
      payload: { auctionId, listingId: auction.listing_id, reason: 'second_chance_declined' },
      seq: true,
      version: 1,
    });

    // Notify seller
    try {
      await queueUserNotification({
        userId: auction.seller_id,
        title: 'Second chance declined',
        body: 'The next bidder declined the second-chance offer. Your listing has been reactivated.',
        eventType: 'auction_bid',
        payload: { auctionId, event: 'second_chance_declined' },
        route: { screen: 'AuctionDetail', params: { auctionId } },
        idempotencyKey: `auction-sc-decline-${auctionId}`,
      });
    } catch (error) {
      request.log.error({ err: error, auctionId }, 'Failed to queue decline notification');
    }

    return { ok: true, auctionId, relisted: true };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to decline second chance: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});

// ── T20: Seller accepts highest bid below reserve ─────────────────
// After reserve_not_met, the seller can choose to accept the highest bid
// anyway, transitioning the auction to awaiting_payment.

app.post('/auctions/:auctionId/accept-highest-bid', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const { auctionId } = paramsSchema.parse(request.params);
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
    }>(
      `SELECT id, seller_id, listing_id, status FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.seller_id !== userId && request.authUser.role !== 'admin') {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the seller can accept the highest bid', code: 'SELLER_RESTRICTED' };
    }

    if (auction.status !== 'reserve_not_met') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction is not in reserve-not-met state', code: 'NOT_RESERVE_NOT_MET' };
    }

    // Find the highest bid
    const topBid = await client.query<{
      id: number;
      bidder_id: string;
      amount_gbp: string;
    }>(
      `SELECT id, bidder_id, amount_gbp::text FROM auction_bids
       WHERE auction_id = $1 ORDER BY amount_gbp DESC, created_at ASC, id ASC LIMIT 1`,
      [auctionId],
    );

    const top = topBid.rows[0];
    if (!top) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'No bids to accept', code: 'NO_BIDS' };
    }

    const paymentDeadline = new Date(Date.now() + 72 * 3600_000).toISOString();
    await client.query(
      `UPDATE auctions
       SET status = 'awaiting_payment', winner_bidder_id = $2, winner_bid_id = $3,
           payment_deadline_at = $4, updated_at = NOW()
       WHERE id = $1`,
      [auctionId, top.bidder_id, top.id, paymentDeadline],
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.awaiting_payment',
      payload: {
        auctionId,
        listingId: auction.listing_id,
        winnerBidderId: top.bidder_id,
        paymentDeadlineAt: paymentDeadline,
        reason: 'seller_accepted_below_reserve',
      },
      seq: true,
      version: 1,
    });

    // Notify the winner
    try {
      await queueUserNotification({
        userId: top.bidder_id,
        title: 'Seller accepted your bid',
        body: `The seller accepted your bid of £${Number(top.amount_gbp).toFixed(2)} even though the reserve wasn't met. Pay by ${new Date(paymentDeadline).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} to complete your purchase.`,
        eventType: 'auction_won',
        payload: { auctionId, event: 'seller_accepted_below_reserve', paymentDeadlineAt: paymentDeadline },
        route: { screen: 'AuctionDetail', params: { auctionId } },
        idempotencyKey: `auction-accept-${auctionId}`,
      });
    } catch (error) {
      request.log.error({ err: error, auctionId }, 'Failed to queue accept notification');
    }

    return {
      ok: true,
      auction: { id: auctionId, status: 'awaiting_payment', paymentDeadlineAt: paymentDeadline },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to accept highest bid: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});



};
