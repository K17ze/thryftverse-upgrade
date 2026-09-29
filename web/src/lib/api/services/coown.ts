/**
 * Web co-own service — mirrors frontend/src/services/marketApi.ts +
 * coOwnPortfolio.ts. Prefers the bounded `/co-own/portfolio` projection
 * over the N+1 adapter.
 */

import { ApiRequestError, fetchJson } from '../http';
import {
  mapCoOwnAsset,
  mapCoOwnBuyoutOffer,
  mapCoOwnCorporateAction,
  mapCoOwnDistribution,
  mapCoOwnExecution,
  mapCoOwnExecutionToActivity,
  mapCoOwnOrder,
  mapCoOwnOrderBook,
  mapCoOwnPortfolioHolding,
  mapCoOwnPriceAlert,
  mapCoOwnRecourse,
  type CoOwnBuyoutOfferApi,
  type CoOwnCorporateActionApi,
  type CoOwnDistributionApi,
  type CoOwnExecutionApi,
  type CoOwnOrderBookResponseApi,
  type CoOwnPortfolioHoldingApi,
  type CoOwnPriceAlertApi,
  type CoOwnRecourseApi,
  type MarketCoOwnAssetApi,
  type MarketCoOwnOrderApi,
} from '../mappers';
import type {
  ActivityEvent,
  CoOwnAsset,
  CoOwnBuyoutOffer,
  CoOwnDistributionAggregate,
  CoOwnDripEnrollment,
  CoOwnEligibility,
  CoOwnIssueCategory,
  CoOwnOrder,
  CoOwnPosition,
  CoOwnRecourse,
  CorporateAction,
  Distribution,
  OrderBookSnapshot,
  RiskDisclosureDocument,
  StoredPriceAlert,
  TradeLedgerEntry,
} from '@/lib/contracts/coown';

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** GET /co-own/assets — wire params are `search` (title/jurisdiction
 *  ilike), `openOnly` (is_open filter), `issuerId`, `limit`, and an
 *  opaque base64 offset `cursor`. */
export async function fetchCoOwnAssets(
  params: {
    search?: string;
    openOnly?: boolean;
    issuerId?: string;
    cursor?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<{ items: CoOwnAsset[]; nextCursor: string | null }> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: MarketCoOwnAssetApi[];
    assets?: MarketCoOwnAssetApi[];
    nextCursor?: string | null;
  }>(`/co-own/assets${toQuery(params)}`, undefined, { signal });
  return {
    items: (payload.items ?? payload.assets ?? []).map(mapCoOwnAsset),
    nextCursor: payload.nextCursor ?? null,
  };
}

export async function fetchCoOwnAsset(
  assetId: string,
  signal?: AbortSignal,
): Promise<CoOwnAsset | null> {
  // The detail route returns { ok, item }; `asset` is a legacy alias kept
  // for older deployments.
  const payload = await fetchJson<{
    ok: boolean;
    item?: MarketCoOwnAssetApi;
    asset?: MarketCoOwnAssetApi;
  }>(
    `/co-own/assets/${encodeURIComponent(assetId)}`,
    undefined,
    { signal },
  );
  const item = payload.item ?? payload.asset;
  if (!payload.ok || !item) return null;
  return mapCoOwnAsset(item);
}

export async function fetchCoOwnPortfolio(
  signal?: AbortSignal,
): Promise<{ positions: CoOwnPosition[]; partial: boolean }> {
  const payload = await fetchJson<{
    ok: true;
    holdings?: CoOwnPortfolioHoldingApi[];
    partial?: boolean;
  }>('/co-own/portfolio', undefined, { signal });
  return {
    positions: (payload.holdings ?? []).map(mapCoOwnPortfolioHolding),
    partial: payload.partial ?? false,
  };
}

export async function fetchCoOwnOrderBook(
  assetId: string,
  signal?: AbortSignal,
): Promise<OrderBookSnapshot> {
  const payload = await fetchJson<CoOwnOrderBookResponseApi>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orderbook`,
    undefined,
    { signal },
  );
  return mapCoOwnOrderBook(assetId, payload);
}

/** GET /co-own/assets/:id/executions — the public per-asset tape, read
 *  straight off coOwn_trades. There is no separate /trades route: this
 *  endpoint IS the trade ledger. The wire deliberately carries no
 *  aggressor side (a print is a match between both sides) but does emit
 *  settlementStatus/failureReason/recoveryAction, which the mapper keeps
 *  so a failed or reversed print never renders as money that moved. */
async function fetchCoOwnExecutionsApi(
  assetId: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CoOwnExecutionApi[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: CoOwnExecutionApi[] }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/executions${toQuery({ limit })}`,
    undefined,
    { signal },
  );
  return payload.items ?? [];
}

export async function fetchCoOwnExecutions(
  assetId: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<TradeLedgerEntry[]> {
  return (await fetchCoOwnExecutionsApi(assetId, limit, signal)).map(
    mapCoOwnExecution,
  );
}

export async function fetchCoOwnActivity(
  assetId: string,
  signal?: AbortSignal,
): Promise<ActivityEvent[]> {
  // The activity feed for one asset is its public trade tape — the
  // executions read carries no aggressor side, so every live print maps
  // to an honest 'trade' event rather than a fabricated buy/sell.
  const items = await fetchCoOwnExecutionsApi(assetId, 50, signal);
  return items.map(mapCoOwnExecutionToActivity);
}

export interface CoOwnDistributionsPage {
  items: Distribution[];
  /** Public per-asset aggregates — populated for anonymous callers in
   *  place of per-recipient rows; empty for authenticated reads. */
  aggregates: CoOwnDistributionAggregate[];
}

export async function fetchCoOwnDistributions(
  assetId?: string,
  signal?: AbortSignal,
): Promise<CoOwnDistributionsPage> {
  const payload = await fetchJson<{
    ok?: boolean;
    scope?: 'user' | 'asset_aggregates';
    items?: CoOwnDistributionApi[];
    aggregates?: Array<{
      assetId: string;
      totalDistributedGbpMinor: number;
      distributionCount: number;
      latestPerUnitGbpMinor: number | null;
      latestDistributionAt: string | null;
    }>;
  }>(
    `/co-own/distributions${toQuery({ assetId })}`,
    undefined,
    { signal },
  );
  return {
    items: (payload.items ?? []).map(mapCoOwnDistribution),
    aggregates: (payload.aggregates ?? []).map((a) => ({
      assetId: a.assetId,
      totalDistributedGbp: a.totalDistributedGbpMinor / 100,
      distributionCount: a.distributionCount,
      latestPerUnitGbp: a.latestPerUnitGbpMinor == null ? null : a.latestPerUnitGbpMinor / 100,
      latestDistributionAt: a.latestDistributionAt,
    })),
  };
}

export async function fetchCoOwnCorporateActions(
  assetId?: string,
  signal?: AbortSignal,
): Promise<CorporateAction[]> {
  // The wire carries votingDeadline; the shared mapper's closesAt chain
  // (payableDate → recordDate → exDate → createdAt) predates it. For a
  // governance action the vote deadline IS the close that gates voting —
  // prefer it so an open action never reads as closed early.
  const payload = await fetchJson<{
    ok?: boolean;
    items?: Array<CoOwnCorporateActionApi & { votingDeadline?: string | null }>;
  }>(`/co-own/corporate-actions${toQuery({ assetId })}`, undefined, { signal });
  return (payload.items ?? []).map((item) => {
    const mapped = mapCoOwnCorporateAction(item);
    return item.votingDeadline ? { ...mapped, closesAt: item.votingDeadline } : mapped;
  });
}

// ── Governance votes ─────────────────────────────────────────────────
// Mirrors frontend/src/services/marketApi.ts — the votes endpoint is the
// authoritative tally + the viewer's vote + server-computed eligibility.

export interface GovernanceVoteSummary {
  vote: 'for' | 'against' | 'abstain';
  votingPowerUnits: number;
  voteCount: number;
}

export interface GovernanceVoteEligibility {
  eligible: boolean;
  /** Human-readable reason for ineligibility (empty when eligible). */
  reason: string;
  votingPowerUnits: number;
  recordDate: string | null;
  status: string;
}

export interface GovernanceVoteResult {
  summary: GovernanceVoteSummary[];
  totalVotingPower: number;
  myVote: 'for' | 'against' | 'abstain' | null;
  eligibility?: GovernanceVoteEligibility;
}

export async function fetchGovernanceVotes(
  actionId: string,
  signal?: AbortSignal,
): Promise<GovernanceVoteResult> {
  const payload = await fetchJson<{ ok?: boolean } & Partial<GovernanceVoteResult>>(
    `/co-own/corporate-actions/${encodeURIComponent(actionId)}/votes`,
    undefined,
    { signal },
  );
  return {
    summary: payload.summary ?? [],
    totalVotingPower: payload.totalVotingPower ?? 0,
    myVote: payload.myVote ?? null,
    eligibility: payload.eligibility,
  };
}

export async function castGovernanceVote(
  actionId: string,
  input: { assetId: string; vote: 'for' | 'against' | 'abstain'; rationale?: string },
): Promise<{ actionId: string; vote: string; votingPowerUnits: number; createdAt: string }> {
  const payload = await fetchJson<{
    ok: true;
    vote: { actionId: string; vote: string; votingPowerUnits: number; createdAt: string };
  }>(`/co-own/corporate-actions/${encodeURIComponent(actionId)}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return payload.vote;
}

export interface PriceCandleApi {
  timestamp: string;
  openGbpMinor: number;
  highGbpMinor: number;
  lowGbpMinor: number;
  closeGbpMinor: number;
  volumeUnits: number;
  tradeCount: number;
}

export async function fetchCoOwnPriceHistory(
  assetId: string,
  options: { interval?: '1h' | '4h' | '1d' | '1w'; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ interval: string; candles: PriceCandleApi[] }> {
  const payload = await fetchJson<{ ok: true; interval: string; candles: PriceCandleApi[] }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/price-history${toQuery({
      interval: options.interval,
      limit: options.limit,
    })}`,
    undefined,
    { signal },
  );
  return { interval: payload.interval, candles: payload.candles ?? [] };
}

/** The wire carries `timeInForce` ('GFD' | 'GTC90'); the web contract
 *  stores it as `OrderDuration`. Mapped here so mappers stay untouched. */
function withDuration(
  order: CoOwnOrder,
  wire: { timeInForce?: 'GFD' | 'GTC90' | null },
): CoOwnOrder {
  const duration =
    wire.timeInForce === 'GFD' ? 'day' : wire.timeInForce === 'GTC90' ? 'gtc' : undefined;
  return duration ? { ...order, duration } : order;
}

/** Cap on the per-asset order fan-out — the backend has no aggregate
 *  "my orders" route, so the caller passes a bounded candidate set
 *  (held + watched assets) and each id gets one my-orders read. */
export const CO_OWN_ORDERS_FANOUT_CAP = 12;

/** The viewer's open/partially-filled orders across the given markets —
 *  bounded fan-out to GET /co-own/assets/:id/my-orders (the only real
 *  read; there is no /co-own/orders aggregate). A 401/403/404 on one
 *  asset yields no orders for it rather than failing the whole list —
 *  guests and delisted markets are honest empty slices. Results merge
 *  newest-first, matching each endpoint's own ordering. */
export async function fetchCoOwnOrders(
  assetIds: readonly string[],
  options: { limitPerAsset?: number } = {},
  signal?: AbortSignal,
): Promise<CoOwnOrder[]> {
  const ids = [...new Set(assetIds)].slice(0, CO_OWN_ORDERS_FANOUT_CAP);
  if (ids.length === 0) return [];
  const perAsset = await Promise.all(
    ids.map(async (assetId) => {
      try {
        const payload = await fetchJson<{
          ok?: boolean;
          items?: Array<MarketCoOwnOrderApi & { timeInForce?: 'GFD' | 'GTC90' | null }>;
        }>(
          `/co-own/assets/${encodeURIComponent(assetId)}/my-orders${toQuery({
            limit: options.limitPerAsset,
          })}`,
          undefined,
          { signal },
        );
        return (payload.items ?? []).map((o) => withDuration(mapCoOwnOrder(o), o));
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          (error.status === 401 || error.status === 403 || error.status === 404)
        ) {
          return [] as CoOwnOrder[];
        }
        throw error;
      }
    }),
  );
  return perAsset
    .flat()
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
}

export async function fetchCoOwnBuyoutOffers(
  assetId: string,
  viewerId?: string,
  signal?: AbortSignal,
): Promise<CoOwnBuyoutOffer[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: CoOwnBuyoutOfferApi[] }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/buyout-offers`,
    undefined,
    { signal },
  );
  return (payload.items ?? []).map((o) => mapCoOwnBuyoutOffer(o, viewerId));
}

// ── Order lifecycle — preview → reserve → commit ─────────────────────
// Web port of the mobile TradeScreen → TradeConfirmScreen flow
// (frontend/src/services/marketApi.ts:1959-2150, screens/TradeScreen.tsx,
// screens/TradeConfirmScreen.tsx). The ingest schema only accepts
// 'limit' | 'protected_market' — a bare 'market' is rejected — and every
// placement must carry reservationId from POST /orders/reserve, which
// holds the buyer's 1ZE (or the seller's units) for ~60s.

/** The wire command shared by preview, reserve and commit. `market` is
 *  deliberately absent — callers convert it to a bounded protected_market
 *  before this point. */
export interface CoOwnOrderCommand {
  userId: string;
  side: 'buy' | 'sell';
  units: number;
  orderType: 'limit' | 'protected_market';
  /** Required for limit orders; forbidden on protected_market. */
  limitPriceGbp?: number;
  /** Protection bound — required for protected_market buys. */
  maxPriceGbp?: number;
  /** Protection bound — required for protected_market sells. */
  minPriceGbp?: number;
}

/** POST /co-own/assets/:id/orders/preview — the server's non-binding
 *  estimate: fill walk, fee, total, and the per-notional eligibility
 *  verdict. `validUntil` (≈15s) bounds how long the numbers may be
 *  presented as the live quote. */
export interface CoOwnOrderPreview {
  assetId: string;
  side: 'buy' | 'sell';
  units: number;
  orderType: 'limit' | 'protected_market';
  limitPriceGbp: number | null;
  protectionPriceGbp: number | null;
  referencePriceGbp: number;
  orderPriceGbp: number;
  estimatedFill: {
    filledUnits: number;
    remainingUnits: number;
    avgFillPrice: number;
    worstPrice: number;
    grossNotional: number;
    slippageBeyondDepth: boolean;
  };
  fee: number;
  total: number;
  feeRate: number;
  availableUnits: number;
  totalUnits: number;
  eligibility: { allowed: boolean; code: string | null; message: string };
  binding: boolean;
  validUntil: string;
}

export async function previewCoOwnOrder(
  assetId: string,
  command: CoOwnOrderCommand,
): Promise<CoOwnOrderPreview> {
  const payload = await fetchJson<{ ok: true; preview: CoOwnOrderPreview }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    },
  );
  return payload.preview;
}

/** POST /co-own/assets/:id/orders/reserve — locks the order's full
 *  obligation (units × order price + fee, priced at the server's
 *  settlement quote for buys; units for sells) until `expiresAt`. */
export interface CoOwnOrderReservation {
  id: string;
  assetId: string;
  userId: string;
  side: 'buy' | 'sell';
  /** 1ZE milliunits held for a buy — the real max-reserved figure. */
  reserved1zeUnits: number;
  /** Units held for a sell. */
  reservedUnits: number;
  referencePriceGbp: number;
  estimatedTotalGbp: number;
  estimatedFeeGbp: number;
  expiresAt: string;
  status: 'active' | 'placed' | 'cancelled' | 'expired';
}

export async function reserveCoOwnOrder(
  assetId: string,
  command: CoOwnOrderCommand & { idempotencyKey: string },
): Promise<CoOwnOrderReservation> {
  const payload = await fetchJson<{ ok: true; reservation: CoOwnOrderReservation }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders/reserve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    },
  );
  return payload.reservation;
}

/** DELETE /co-own/assets/:id/orders/reserve/:reservationId — releases an
 *  unconsumed reservation (review abandoned, quote lapsed). Ownership is
 *  enforced by the auth token; a 404 just means it already released or
 *  expired — callers treat that as released. */
export async function releaseCoOwnReservation(
  assetId: string,
  reservationId: string,
): Promise<void> {
  await fetchJson(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders/reserve/${encodeURIComponent(reservationId)}`,
    { method: 'DELETE' },
  );
}

/** Stable idempotency keys — one per order attempt, reused across retries
 *  so an ambiguous failure replays server-side instead of double-writing.
 *  The reserve and commit calls each carry their own key (the backend
 *  dedupes them independently). */
export function newCoOwnOrderAttemptKey(): string {
  return `web-coown-order-${crypto.randomUUID()}`;
}

export function newCoOwnReserveAttemptKey(): string {
  return `web-coown-reserve-${crypto.randomUUID()}`;
}

export async function placeCoOwnOrder(input: CoOwnOrderCommand & {
  assetId: string;
  /** From reserveCoOwnOrder — required; the placement validates it is
   *  active, unexpired, owned by userId and covers the obligation. */
  reservationId: string;
  /** Resting-order duration — GFD (day) or GTC90. */
  timeInForce?: 'GFD' | 'GTC90';
  /** Stable per order attempt — the server dedupes on
   *  (asset_id, actor_id, idempotency_key), so a retry after an
   *  ambiguous failure replays instead of double-placing (the backend
   *  also exposes GET .../orders/lookup-by-key/:key for reconciliation). */
  idempotencyKey: string;
}): Promise<CoOwnOrder> {
  const payload = await fetchJson<{
    ok: true;
    status?: string;
    order?: MarketCoOwnOrderApi & { timeInForce?: 'GFD' | 'GTC90' | null };
  }>(
    `/co-own/assets/${encodeURIComponent(input.assetId)}/orders`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: input.userId,
        side: input.side,
        orderType: input.orderType,
        units: input.units,
        limitPriceGbp: input.limitPriceGbp,
        maxPriceGbp: input.maxPriceGbp,
        minPriceGbp: input.minPriceGbp,
        reservationId: input.reservationId,
        timeInForce: input.timeInForce,
        idempotencyKey: input.idempotencyKey,
      }),
    },
  );
  // A 202 command acknowledgement carries no order — the write's outcome
  // is genuinely unknown until lookup-by-key settles it. Refuse to
  // fabricate an order row; the caller surfaces this verbatim.
  if (!payload.order) {
    throw new ApiRequestError(
      'The order was accepted but is still processing — check open orders before retrying.',
      202,
      { code: 'ORDER_STILL_PROCESSING' },
    );
  }
  return withDuration(mapCoOwnOrder(payload.order), payload.order);
}

/** POST /co-own/assets/:assetId/orders/:orderId/cancel — the asset-scoped
 *  route (there is no /co-own/orders/:id/cancel). `userId` must match the
 *  authenticated session — the backend rejects a mismatch. */
export async function cancelCoOwnOrder(input: {
  assetId: string;
  orderId: string;
  userId: string;
}): Promise<{ filledUnits: number }> {
  const payload = await fetchJson<{
    ok: true;
    order: { id: number; status: 'cancelled'; filledUnits: number; remainingUnits: number };
  }>(
    `/co-own/assets/${encodeURIComponent(input.assetId)}/orders/${encodeURIComponent(input.orderId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: input.userId }),
    },
  );
  return { filledUnits: payload.order.filledUnits };
}

// ── Buyout offers ────────────────────────────────────────────────────────────
// The create schema is strict ({bidderUserId, offerPriceGbp, targetUnits?,
// expiresInHours?, metadata?}) — no idempotencyKey on the wire — and the
// bidder must equal the authenticated user. Accept is likewise strict:
// {holderUserId, units, metadata?}.

export async function createBuyoutOffer(
  assetId: string,
  input: {
    bidderUserId: string;
    offerPriceGbp: number;
    /** Defaults server-side to every unit the bidder doesn't hold. */
    targetUnits?: number;
    /** Offer lifetime, 1–168h. The composer offers 24h. */
    expiresInHours?: number;
  },
): Promise<CoOwnBuyoutOffer> {
  const payload = await fetchJson<{ ok: true; offer: CoOwnBuyoutOfferApi }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/buyout-offers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return mapCoOwnBuyoutOffer(payload.offer, input.bidderUserId);
}

/** Returns the server's post-acceptance tally — the real accepted units
 *  (the backend clamps to the remaining target) and the offer's status. */
export async function acceptBuyoutOffer(
  offerId: string,
  input: { holderUserId: string; units: number },
): Promise<{ acceptedUnits: number; status: string }> {
  const payload = await fetchJson<{
    ok: true;
    offer: CoOwnBuyoutOfferApi;
    accepted: { holderUserId: string; units: number };
  }>(
    `/co-own/buyout-offers/${encodeURIComponent(offerId)}/accept`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return { acceptedUnits: payload.accepted.units, status: payload.offer.status };
}

// ── Price alerts (server-persisted — mirrors the mobile contract) ──────
// Live mode: CRUD against /co-own/price-alerts so alerts survive devices
// and evaluate server-side. Fixture mode keeps the device-local store.

export async function fetchCoOwnPriceAlerts(
  signal?: AbortSignal,
): Promise<Array<StoredPriceAlert & { triggeredAt: string | null }>> {
  const payload = await fetchJson<{ ok: true; alerts?: CoOwnPriceAlertApi[] }>(
    '/co-own/price-alerts',
    undefined,
    { signal },
  );
  return (payload.alerts ?? []).map(mapCoOwnPriceAlert);
}

export async function createCoOwnPriceAlert(input: {
  assetId: string;
  direction: 'above' | 'below';
  targetPriceGbp: number;
}): Promise<void> {
  await fetchJson('/co-own/price-alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetId: input.assetId,
      condition: input.direction,
      targetPriceGbpMinor: Math.round(input.targetPriceGbp * 100),
    }),
  });
}

export async function setCoOwnPriceAlertActive(
  id: string,
  active: boolean,
): Promise<void> {
  await fetchJson(`/co-own/price-alerts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
}

export async function deleteCoOwnPriceAlert(id: string): Promise<void> {
  await fetchJson(`/co-own/price-alerts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ── Recourse — the holder-protection dossier (authenticated read) ─────

export async function fetchCoOwnRecourse(
  assetId: string,
  signal?: AbortSignal,
): Promise<CoOwnRecourse> {
  const payload = await fetchJson<CoOwnRecourseApi & { ok: true }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/recourse`,
    undefined,
    { signal },
  );
  return mapCoOwnRecourse(assetId, payload);
}

// ── Policy — the versioned commerce limits the server enforces ────────

export interface CoOwnPolicy {
  version: string;
  maxIssuanceUnits: number;
  maxOrderUnits: number;
  maxBuyoutUnits: number;
}

/** GET /co-own/policy — server-published caps; the composer gates on
 *  these rather than a local constant so the enforced limit and the
 *  displayed limit can't drift apart. */
export async function fetchCoOwnPolicy(signal?: AbortSignal): Promise<CoOwnPolicy> {
  const payload = await fetchJson<{ ok: true; policy: CoOwnPolicy }>(
    '/co-own/policy',
    undefined,
    { signal },
  );
  return payload.policy;
}

// ── Eligibility — the server's advisory pre-trade verdict ─────────────

export async function fetchCoOwnEligibility(
  assetId: string,
  signal?: AbortSignal,
): Promise<CoOwnEligibility> {
  const payload = await fetchJson<{
    ok: true;
    eligible: boolean;
    message?: string;
  }>(`/co-own/eligibility/${encodeURIComponent(assetId)}`, undefined, { signal });
  return {
    eligible: payload.eligible,
    reason: payload.message ?? null,
    maxUnits: null,
  };
}

// ── Issue reports — the asset-anchored case record ────────────────────

export async function reportCoOwnIssue(
  assetId: string,
  input: { category: CoOwnIssueCategory; description: string },
): Promise<{ id: string; status: string; createdAt: string }> {
  const payload = await fetchJson<{
    ok: true;
    issue: { id: string; status: string; createdAt: string };
  }>(`/co-own/assets/${encodeURIComponent(assetId)}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return payload.issue;
}

// ── DRIP — dividend reinvestment enrolment per held asset ─────────────

export async function fetchDripEnrollments(
  signal?: AbortSignal,
): Promise<CoOwnDripEnrollment[]> {
  const payload = await fetchJson<{
    ok: true;
    enrollments?: Array<{ assetId: string; enrolled: boolean; enrolledAt: string | null }>;
  }>('/co-own/drip/enrollments', undefined, { signal });
  return (payload.enrollments ?? []).map((e) => ({
    assetId: e.assetId,
    enrolled: e.enrolled,
    enrolledAt: e.enrolledAt,
  }));
}

export async function setDripEnrollment(
  assetId: string,
  enrolled: boolean,
): Promise<void> {
  await fetchJson('/co-own/drip/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, enrolled }),
  });
}

// ── Global market tape — one bounded read across every market ─────────
// Replaces the per-asset N+1 fan-out on /co-own/ledger in live mode.

export async function fetchCoOwnGlobalExecutions(
  limit = 100,
  signal?: AbortSignal,
): Promise<TradeLedgerEntry[]> {
  const payload = await fetchJson<{
    ok: true;
    items?: CoOwnExecutionApi[];
  }>(`/co-own/executions${toQuery({ limit })}`, undefined, { signal });
  return (payload.items ?? []).map(mapCoOwnExecution);
}

// ── Risk disclosure — the active legal document + the viewer's consent ─

/** Mirrors the server-side accept gate in POST /compliance/consents/accept:
 *  the document must be active, in effect, carry a public content URL and a
 *  full SHA-256 content hash (not a placeholder). Same predicate the native
 *  app applies before offering acknowledgement. */
function isConsentableDocument(
  doc: {
    isActive: boolean;
    contentUrl: string | null;
    contentHash: string | null;
    effectiveAt: string;
    retiredAt: string | null;
  },
  nowMs: number,
): boolean {
  if (!doc.isActive || !doc.contentUrl) return false;
  if (!doc.contentHash || !/^sha256:[a-f0-9]{64}$/i.test(doc.contentHash)) return false;
  if (/placeholder/i.test(doc.contentHash)) return false;
  const effectiveMs = Date.parse(doc.effectiveAt);
  if (Number.isFinite(effectiveMs) && effectiveMs > nowMs) return false;
  if (doc.retiredAt) {
    const retiredMs = Date.parse(doc.retiredAt);
    if (Number.isFinite(retiredMs) && retiredMs <= nowMs) return false;
  }
  return true;
}

export async function fetchActiveRiskDisclosure(
  signal?: AbortSignal,
): Promise<RiskDisclosureDocument | null> {
  const payload = await fetchJson<{
    ok: true;
    items?: Array<{
      id: string;
      version: string;
      title: string;
      contentUrl: string | null;
      contentHash: string | null;
      isActive: boolean;
      effectiveAt: string;
      retiredAt: string | null;
    }>;
  }>(
    `/compliance/consents/documents${toQuery({ docType: 'risk_disclosure', activeOnly: 'true', limit: 20 })}`,
    undefined,
    { signal },
  );
  const doc = (payload.items ?? []).find((d) =>
    isConsentableDocument(d, Date.now()),
  );
  if (!doc) return null;
  return {
    id: doc.id,
    version: doc.version,
    title: doc.title,
    contentUrl: doc.contentUrl,
    effectiveAt: doc.effectiveAt,
  };
}

/** The viewer's consent record for one document — null means unaccepted. */
export async function fetchUserConsent(
  userId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<{ accepted: boolean; acceptedAt: string | null } | null> {
  const payload = await fetchJson<{
    ok: true;
    items?: Array<{ documentId: string; accepted: boolean; acceptedAt: string }>;
  }>(`/compliance/consents/${encodeURIComponent(userId)}`, undefined, { signal });
  const row = payload.items?.find((i) => i.documentId === documentId);
  if (!row) return null;
  return { accepted: row.accepted, acceptedAt: row.acceptedAt };
}

export async function acceptRiskDisclosure(
  userId: string,
  documentId: string,
  evidence?: Record<string, unknown>,
): Promise<void> {
  await fetchJson('/compliance/consents/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      documentId,
      accepted: true,
      ...(evidence ? { evidence } : {}),
    }),
  });
}
