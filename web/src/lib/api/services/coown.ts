/**
 * Web co-own service — mirrors frontend/src/services/marketApi.ts +
 * coOwnPortfolio.ts. Prefers the bounded `/co-own/portfolio` projection
 * over the N+1 adapter.
 */

import { fetchJson } from '../http';
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
  type CoOwnBuyoutOfferApi,
  type CoOwnCorporateActionApi,
  type CoOwnDistributionApi,
  type CoOwnExecutionApi,
  type CoOwnOrderBookResponseApi,
  type CoOwnPortfolioHoldingApi,
  type MarketCoOwnAssetApi,
  type MarketCoOwnOrderApi,
} from '../mappers';
import type {
  ActivityEvent,
  CoOwnAsset,
  CoOwnBuyoutOffer,
  CoOwnOrder,
  CoOwnPosition,
  CorporateAction,
  Distribution,
  OrderBookSnapshot,
  TradeLedgerEntry,
} from '@/lib/contracts/coown';

function toQuery(params: Record<string, string | number | undefined | null>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export async function fetchCoOwnAssets(
  params: { q?: string; status?: string; cursor?: string; limit?: number } = {},
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
  const payload = await fetchJson<{ ok: boolean; asset?: MarketCoOwnAssetApi }>(
    `/co-own/assets/${encodeURIComponent(assetId)}`,
    undefined,
    { signal },
  );
  if (!payload.ok || !payload.asset) return null;
  return mapCoOwnAsset(payload.asset);
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

export async function fetchCoOwnExecutions(
  assetId: string,
  signal?: AbortSignal,
): Promise<TradeLedgerEntry[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: CoOwnExecutionApi[] }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/executions`,
    undefined,
    { signal },
  );
  return (payload.items ?? []).map(mapCoOwnExecution);
}

export async function fetchCoOwnActivity(
  assetId: string,
  signal?: AbortSignal,
): Promise<ActivityEvent[]> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: Array<{
      id: number | string;
      assetId: string;
      units?: number | null;
      unitPriceGbp?: number | null;
      eventType?: string;
      actorUsername?: string | null;
      note?: string | null;
      executedAt?: string;
      createdAt?: string;
    }>;
  }>(`/co-own/assets/${encodeURIComponent(assetId)}/executions`, undefined, { signal });
  return (payload.items ?? []).map(mapCoOwnExecutionToActivity);
}

export async function fetchCoOwnDistributions(
  assetId?: string,
  signal?: AbortSignal,
): Promise<Distribution[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: CoOwnDistributionApi[] }>(
    `/co-own/distributions${toQuery({ assetId })}`,
    undefined,
    { signal },
  );
  return (payload.items ?? []).map(mapCoOwnDistribution);
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

export async function fetchCoOwnOrders(signal?: AbortSignal): Promise<CoOwnOrder[]> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: Array<MarketCoOwnOrderApi & { timeInForce?: 'GFD' | 'GTC90' | null }>;
  }>('/co-own/orders', undefined, { signal });
  return (payload.items ?? []).map((o) => withDuration(mapCoOwnOrder(o), o));
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

export async function placeCoOwnOrder(input: {
  assetId: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'protected_market';
  units: number;
  limitPriceGbp?: number;
  protectionPriceGbp?: number;
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
    status: string;
    order: MarketCoOwnOrderApi & { timeInForce?: 'GFD' | 'GTC90' | null };
  }>(
    `/co-own/assets/${encodeURIComponent(input.assetId)}/orders`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        side: input.side,
        orderType: input.orderType,
        units: input.units,
        limitPriceGbp: input.limitPriceGbp,
        protectionPriceGbp: input.protectionPriceGbp,
        timeInForce: input.timeInForce,
        idempotencyKey: input.idempotencyKey,
      }),
    },
  );
  return withDuration(mapCoOwnOrder(payload.order), payload.order);
}

export async function cancelCoOwnOrder(orderId: string): Promise<void> {
  await fetchJson(`/co-own/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
  });
}

// ── Buyout offers ────────────────────────────────────────────────────────────

export async function createBuyoutOffer(
  assetId: string,
  input: { offerPriceGbp: number; targetUnits: number },
): Promise<void> {
  await fetchJson(`/co-own/assets/${encodeURIComponent(assetId)}/buyout-offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function acceptBuyoutOffer(offerId: string, units: number): Promise<void> {
  await fetchJson(`/co-own/buyout-offers/${encodeURIComponent(offerId)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ units }),
  });
}
