/**
 * Co-Own history service — the user-scoped ledger reads the shared
 * /co-own market surface doesn't carry:
 *
 *  - GET /co-own/settlements — the viewer's settlement ledger (one row
 *    per matched trade where they were buyer or seller).
 *  - GET /users/:userId/market-history — the cross-channel activity feed
 *    (auction bids + co-own orders), web port of the mobile
 *    listUserMarketHistory (frontend/src/services/marketApi.ts:2520).
 *
 * Both routes are auth-gated: the global preHandler 401s without a
 * Bearer token, and the market-history path's :userId must equal the
 * session user (403 otherwise). Callers pass the viewer's own id only.
 */

import { fetchJson } from '../http';

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

// ── Settlements (GET /co-own/settlements) ────────────────────────────
// Wire: { ok, settlements[], nextCursor }. `nextCursor` is the last
// row's created_at timestamp — keyset pagination on a strict
// `created_at <` boundary. `role` is derived server-side from userId —
// the query params are userId/status/limit/cursor only; there is no
// role filter. Amounts are GBP majors — the wire carries no currency
// column. Net differs by role: a buyer pays notional + fee, a seller
// receives notional − fee (coOwn.ts:4493).

export type CoOwnSettlementStatus = 'pending' | 'settled' | 'failed' | 'reversed';
export type CoOwnSettlementRole = 'buyer' | 'seller';

export interface CoOwnSettlement {
  id: string;
  assetId: string;
  buyerId: string;
  sellerId: string;
  units: number;
  unitPriceGbp: number;
  /** units × unit price — the gross matched value. */
  notionalGbp: number;
  feeGbp: number;
  settlementStatus: CoOwnSettlementStatus;
  /** Null until the trade actually clears — never substitute createdAt. */
  settledAt: string | null;
  createdAt: string;
  /** The viewer's side of this trade, resolved by the server. */
  role: CoOwnSettlementRole;
}

export interface CoOwnSettlementsPage {
  items: CoOwnSettlement[];
  /** created_at of the last row — pass back verbatim as `cursor`. */
  nextCursor: string | null;
}

export async function fetchCoOwnSettlements(
  userId: string,
  options: {
    status?: CoOwnSettlementStatus;
    cursor?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<CoOwnSettlementsPage> {
  const payload = await fetchJson<{
    ok?: boolean;
    settlements?: CoOwnSettlement[];
    nextCursor?: string | null;
  }>(
    `/co-own/settlements${toQuery({
      userId,
      status: options.status,
      cursor: options.cursor,
      limit: options.limit,
    })}`,
    undefined,
    { signal },
  );
  return {
    items: payload.settlements ?? [],
    nextCursor: payload.nextCursor ?? null,
  };
}

// ── Market history (GET /users/:userId/market-history) ───────────────
// Wire: { ok, items[], pageInfo: { hasMore, nextCursor? } }. The cursor
// is a (cursorTs, cursorId) pair — both must travel together or the
// backend 400s. `channel` filters server-side: 'all' | 'auction' |
// 'co-own' (default 'all'). Items are newest-first; `note` carries the
// joined asset/listing title, `status`/`orderType` are null on auction
// bid rows.

export type MarketHistoryChannel = 'auction' | 'co-own';
export type MarketHistoryChannelFilter = 'all' | MarketHistoryChannel;
export type MarketHistoryAction = 'bid' | 'buy-units' | 'sell-units';

export interface MarketHistoryItem {
  /** 'auction_bid_<id>' or 'coOwn_order_<id>' — stable across pages. */
  id: string;
  /** Numeric order id for co-own rows (null on auction bids). */
  orderId: number | null;
  channel: MarketHistoryChannel;
  action: MarketHistoryAction;
  /** co-own: assetId — auction: auctionId. */
  referenceId: string;
  amountGbp: number;
  units: number | null;
  filledUnits: number | null;
  remainingUnits: number | null;
  unitPriceGbp: number | null;
  /** Null unless the row's fee is known (winning auction bid / co-own order). */
  feeGbp: number | null;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | null;
  orderType: 'market' | 'limit' | 'protected_market' | null;
  /** Joined title — asset title for co-own rows, listing title for bids. */
  note: string | null;
  timestamp: string;
}

export interface MarketHistoryCursor {
  cursorTs: string;
  cursorId: string;
}

export interface MarketHistoryPage {
  items: MarketHistoryItem[];
  pageInfo: {
    hasMore: boolean;
    nextCursor?: MarketHistoryCursor;
  };
}

export async function fetchMyMarketHistory(
  userId: string,
  options: {
    channel?: MarketHistoryChannelFilter;
    limit?: number;
    /** Pass the previous page's pageInfo.nextCursor verbatim — the
     *  backend rejects a lone cursorTs or cursorId. */
    cursor?: MarketHistoryCursor;
  } = {},
  signal?: AbortSignal,
): Promise<MarketHistoryPage> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: MarketHistoryItem[];
    pageInfo?: { hasMore?: boolean; nextCursor?: MarketHistoryCursor };
  }>(
    `/users/${encodeURIComponent(userId)}/market-history${toQuery({
      channel: options.channel,
      limit: options.limit,
      cursorTs: options.cursor?.cursorTs,
      cursorId: options.cursor?.cursorId,
    })}`,
    undefined,
    { signal },
  );
  return {
    items: payload.items ?? [],
    pageInfo: {
      hasMore: payload.pageInfo?.hasMore ?? false,
      nextCursor: payload.pageInfo?.nextCursor,
    },
  };
}
