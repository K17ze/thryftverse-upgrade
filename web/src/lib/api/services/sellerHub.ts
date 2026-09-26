/**
 * Web seller-hub service — mirrors frontend/src/services/sellerHubApi.ts.
 * The overview is a single server-assembled projection; the web UI reads it
 * directly rather than deriving from fixtures.
 */

import { fetchJson } from '../http';

export interface SellerHubTaskApi {
  id: string;
  type: string;
  priority: string;
  count: number;
  dueAt: string | null;
  consequence: { kind: 'money' | 'buyer' | 'trust' | 'listing'; amountGbp?: number } | null;
  actionRoute: string;
  actionParams?: Record<string, unknown>;
  actionLabel: string;
}

export interface SellerHubOverviewApi {
  schemaVersion: 2;
  generatedAt: string;
  freshness: Record<string, { asOf: string; state: 'fresh' | 'stale' | 'unavailable' }>;
  tasks: SellerHubTaskApi[];
  topTask: SellerHubTaskApi | null;
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
    netSalesPrevPeriodPct: number | null;
    ordersPrevPeriodPct: number | null;
  } | null;
  trust: {
    responseRatePct: number | null;
    avgDispatchDays: number | null;
    totalSales: number;
    positiveRatingPct: number | null;
    calculatedAt: string | null;
  } | null;
  opportunities: Array<{
    listingId: string;
    title: string;
    imageUrl: string | null;
    priceGbp: number | null;
    views30d: number;
  }> | null;
  away: { active: boolean; until: string | null; message: string | null } | null;
}

export async function fetchSellerHubOverview(
  signal?: AbortSignal,
): Promise<SellerHubOverviewApi> {
  const res = await fetchJson<{ ok: boolean; overview: SellerHubOverviewApi }>(
    '/seller-hub/overview',
    undefined,
    { signal },
  );
  return res.overview;
}

export interface SellerInventoryTotals {
  active: number;
  drafts: number;
  paused: number;
  sold: number;
  listedValueGbp: number;
}

export async function fetchSellerInventoryTotals(
  signal?: AbortSignal,
): Promise<SellerInventoryTotals> {
  const res = await fetchJson<{ ok: boolean; totals: SellerInventoryTotals }>(
    '/seller-hub/inventory/totals',
    undefined,
    { signal },
  );
  return res.totals;
}

// ── Seller analytics (self-scoped — :sellerId must be the authed user) ───────

export interface SellerAnalyticsApi {
  totalListings: number;
  activeListings: number;
  totalViews: number;
  totalLikes: number;
  totalSaves: number;
  itemsSold: number;
  revenueGbpMinor: number;
  netSalesGbpMinor: number | null;
  aovGbpMinor: number | null;
  avgRating: number | null;
  reviewCount: number;
  totalSales: number | null;
  comparison: {
    revenueGbpMinor: number;
    itemsSold: number;
    totalViews: number;
    totalLikes: number;
  };
  trend: {
    metric: 'revenue';
    current: Array<{ date: string; value: number }>;
    previous: Array<{ date: string; value: number }>;
  };
}

export async function fetchSellerAnalytics(
  sellerId: string,
  period: '7d' | '30d' | '90d',
  signal?: AbortSignal,
): Promise<SellerAnalyticsApi> {
  const res = await fetchJson<{ ok: boolean; analytics: SellerAnalyticsApi }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics?period=${period}`,
    undefined,
    { signal },
  );
  return res.analytics;
}

export interface SellerDailyApi {
  date: string;
  views: number;
  likes: number;
  saves: number;
  sales: number;
}

export async function fetchSellerAnalyticsDaily(
  sellerId: string,
  period: '7d' | '30d' | '90d',
  signal?: AbortSignal,
): Promise<SellerDailyApi[]> {
  const res = await fetchJson<{ ok: boolean; days: SellerDailyApi[] }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics/daily?period=${period}`,
    undefined,
    { signal },
  );
  return res.days;
}

export interface SellerTopPerformerApi {
  id: string;
  title: string;
  priceGbpMinor: number;
  viewsCount: number;
  likesCount: number;
  savedCount: number;
  status: string;
  createdAt: string;
  engagementScore: number;
}

export async function fetchSellerTopPerformers(
  sellerId: string,
  signal?: AbortSignal,
): Promise<SellerTopPerformerApi[]> {
  const res = await fetchJson<{ ok: boolean; items: SellerTopPerformerApi[] }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics/top-performers`,
    undefined,
    { signal },
  );
  return res.items;
}
