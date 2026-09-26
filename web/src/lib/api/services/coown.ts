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
  const payload = await fetchJson<{ ok?: boolean; items?: CoOwnCorporateActionApi[] }>(
    `/co-own/corporate-actions${toQuery({ assetId })}`,
    undefined,
    { signal },
  );
  return (payload.items ?? []).map(mapCoOwnCorporateAction);
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

export async function fetchCoOwnOrders(signal?: AbortSignal): Promise<CoOwnOrder[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: MarketCoOwnOrderApi[] }>(
    '/co-own/orders',
    undefined,
    { signal },
  );
  return (payload.items ?? []).map(mapCoOwnOrder);
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
}): Promise<CoOwnOrder> {
  const payload = await fetchJson<{ ok: true; status: string; order: MarketCoOwnOrderApi }>(
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
      }),
    },
  );
  return mapCoOwnOrder(payload.order);
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
