'use client';

/**
 * Seller query hooks — the only path from seller-hub screens to data.
 * Fixture-backed with simulated latency, mirroring lib/hooks/queries.ts
 * posture; live mode will target /api/seller/* when that surface lands.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SellerPeriod } from '@/lib/data/fixtures-seller';
import {
  FULFILMENT_QUEUE,
  monthlyTotals,
  payoutEntries,
  payoutSchedule,
  round2,
  sellerDailySeries,
  sellerPerformanceRows,
  sellerTodos,
  markJobPosted,
  type FulfilmentJob,
  type ListingPerformanceRow,
  type MonthlyTotal,
  type PayoutEntry,
  type PayoutSchedule,
  type SellerDailyPoint,
  type SellerMetric,
  type SellerTodo,
} from '@/lib/data/fixtures-seller';
import { DATA_MODE } from '@/lib/api/client';
import * as sellerHubService from '@/lib/api/services/sellerHub';
import * as commerceService from '@/lib/api/services/commerce';
import { useSession } from '@/lib/session/SessionProvider';

const tick = (ms = 260) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// DERIVED VIEW-MODELS — pure functions over the fixtures
// ============================================================================

export interface SellerOverview {
  available: number;
  pending: number;
  lifetimeSales: number;
  currency: string;
  period: SellerPeriod;
  series: SellerDailyPoint[];
  revenueTotal: number;
  revenuePrev: number;
  revenueDelta: number | null;
  peak: { date: string; value: number } | null;
  metrics: SellerMetric[];
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

const fmtPctLive = (v: number) => `${v.toFixed(1)}%`;
const fmtMoneyLive = (v: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: v % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v);

/** Live overview — server-projected money + analytics instead of the
 *  fixture derivation. The daily series merges revenue (analytics trend)
 *  with per-day views/likes/sales (analytics/daily). */
function buildLiveOverview(
  period: SellerPeriod,
  overview: sellerHubService.SellerHubOverviewApi,
  analytics: sellerHubService.SellerAnalyticsApi,
  daily: sellerHubService.SellerDailyApi[],
): SellerOverview {
  const revenueByDate = new Map(analytics.trend.current.map((p) => [p.date, p.value]));
  const series: SellerDailyPoint[] = daily.map((d) => ({
    date: d.date,
    revenue: round2((revenueByDate.get(d.date) ?? 0) / 100),
    orders: d.sales,
    views: d.views,
    likes: d.likes,
  }));

  const revenue = round2(analytics.revenueGbpMinor / 100);
  const prevRevenue = round2(analytics.comparison.revenueGbpMinor / 100);
  const views = analytics.totalViews;
  const prevViews = analytics.comparison.totalViews;
  const likes = analytics.totalLikes;
  const prevLikes = analytics.comparison.totalLikes;
  const orders = analytics.itemsSold;
  const prevOrders = analytics.comparison.itemsSold;

  const conversion = views > 0 ? (orders / views) * 100 : 0;
  const prevConversion = prevViews > 0 ? (prevOrders / prevViews) * 100 : 0;
  const aov = analytics.aovGbpMinor != null ? round2(analytics.aovGbpMinor / 100) : 0;
  const prevAov = prevOrders > 0 ? round2(prevRevenue / prevOrders) : 0;
  const sellThrough =
    analytics.totalListings > 0
      ? ((analytics.totalListings - analytics.activeListings) / analytics.totalListings) * 100
      : 0;

  const peakPoint = series.reduce<SellerDailyPoint | null>(
    (best, p) => (best == null || p.revenue > best.revenue ? p : best),
    null,
  );

  const metrics: SellerMetric[] = [
    { key: 'views', label: 'Views', value: views.toLocaleString('en-GB'), delta: pctDelta(views, prevViews) },
    { key: 'watchers', label: 'Watchers', value: likes.toLocaleString('en-GB'), delta: pctDelta(likes, prevLikes) },
    { key: 'conversion', label: 'Conversion', value: fmtPctLive(conversion), delta: pctDelta(conversion, prevConversion) },
    { key: 'aov', label: 'Avg sale', value: fmtMoneyLive(aov), delta: pctDelta(aov, prevAov) },
    { key: 'sellThrough', label: 'Sell-through', value: fmtPctLive(sellThrough), delta: null },
  ];

  return {
    available: round2((overview.money?.availableGbp ?? 0)),
    pending: round2((overview.money?.processingGbp ?? 0) + (overview.money?.heldGbp ?? 0)),
    lifetimeSales: analytics.totalSales ?? 0,
    currency: 'GBP',
    period,
    series,
    revenueTotal: revenue,
    revenuePrev: prevRevenue,
    revenueDelta: pctDelta(revenue, prevRevenue),
    peak: peakPoint ? { date: peakPoint.date, value: peakPoint.revenue } : null,
    metrics,
  };
}

function buildOverview(period: SellerPeriod): SellerOverview {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const all = sellerDailySeries();
  const current = all.slice(-days);
  const previousWindow = all.slice(-days * 2, -days);

  const sum = (pts: SellerDailyPoint[], key: 'revenue' | 'orders' | 'views' | 'likes') =>
    pts.reduce((s, p) => s + p[key], 0);

  const revenue = round2(sum(current, 'revenue'));
  const prevRevenue = round2(sum(previousWindow, 'revenue'));
  const orders = sum(current, 'orders');
  const prevOrders = sum(previousWindow, 'orders');
  const views = sum(current, 'views');
  const prevViews = sum(previousWindow, 'views');
  const likes = sum(current, 'likes');
  const prevLikes = sum(previousWindow, 'likes');

  const conversion = views > 0 ? (orders / views) * 100 : 0;
  const prevConversion = prevViews > 0 ? (prevOrders / prevViews) * 100 : 0;
  const aov = orders > 0 ? revenue / orders : 0;
  const prevAov = prevOrders > 0 ? prevRevenue / prevOrders : 0;

  // Sell-through: sold share of everything the seller has listed.
  const rows = sellerPerformanceRows(period);
  const soldCount = rows.filter((r) => r.listing.status === 'sold').length;
  const sellThrough = rows.length > 0 ? (soldCount / rows.length) * 100 : 0;
  const prevRows = sellerPerformanceRows('90d');
  const prevSellThrough =
    prevRows.length > 0
      ? (prevRows.filter((r) => r.listing.status === 'sold').length / prevRows.length) * 100
      : 0;

  const peakPoint = current.reduce<SellerDailyPoint | null>(
    (best, p) => (best == null || p.revenue > best.revenue ? p : best),
    null,
  );

  const fmtPct = (v: number) => `${v.toFixed(1)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: v % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(v);

  const metrics: SellerMetric[] = [
    { key: 'views', label: 'Views', value: views.toLocaleString('en-GB'), delta: pctDelta(views, prevViews) },
    { key: 'watchers', label: 'Watchers', value: likes.toLocaleString('en-GB'), delta: pctDelta(likes, prevLikes) },
    { key: 'conversion', label: 'Conversion', value: fmtPct(conversion), delta: pctDelta(conversion, prevConversion) },
    { key: 'aov', label: 'Avg sale', value: fmtMoney(aov), delta: pctDelta(aov, prevAov) },
    { key: 'sellThrough', label: 'Sell-through', value: fmtPct(sellThrough), delta: pctDelta(sellThrough, prevSellThrough) },
  ];

  return {
    available: 214.9,
    pending: round2(payoutSchedule().pendingTotal),
    lifetimeSales: payoutSchedule().lifetimeSales,
    currency: 'GBP',
    period,
    series: current,
    revenueTotal: revenue,
    revenuePrev: prevRevenue,
    revenueDelta: pctDelta(revenue, prevRevenue),
    peak: peakPoint ? { date: peakPoint.date, value: peakPoint.revenue } : null,
    metrics,
  };
}

// ============================================================================
// HOOKS
// ============================================================================

export function useSellerOverview(period: SellerPeriod) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'overview', period, DATA_MODE, user?.id],
    queryFn: async () => {
      if (DATA_MODE === 'live' && user?.id) {
        const [overview, analytics, daily] = await Promise.all([
          sellerHubService.fetchSellerHubOverview(),
          sellerHubService.fetchSellerAnalytics(user.id, period),
          sellerHubService.fetchSellerAnalyticsDaily(user.id, period),
        ]);
        return buildLiveOverview(period, overview, analytics, daily);
      }
      await tick();
      return buildOverview(period);
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

export function useSellerListingPerformance(period: SellerPeriod) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'performance', period, DATA_MODE, user?.id],
    queryFn: async (): Promise<ListingPerformanceRow[]> => {
      if (DATA_MODE === 'live' && user?.id) {
        const rows = await sellerHubService.fetchSellerTopPerformers(user.id);
        return rows.map((r) => ({
          listing: {
            id: r.id,
            title: r.title,
            brand: null,
            size: null,
            condition: 'Good' as const,
            price: round2(r.priceGbpMinor / 100),
            images: [],
            likes: r.likesCount,
            views: r.viewsCount,
            isSold: r.status === 'sold',
            status: (r.status as ListingPerformanceRow['listing']['status']) ?? 'unknown',
            sellerId: user.id,
            category: '',
            description: '',
            createdAt: r.createdAt,
          },
          views: r.viewsCount,
          likes: r.likesCount,
          watchers: r.savedCount,
          conversion:
            r.viewsCount > 0
              ? Math.round((r.savedCount / r.viewsCount) * 1000) / 10
              : 0,
          ageDays: Math.max(
            0,
            Math.floor((Date.now() - Date.parse(r.createdAt)) / 86_400_000),
          ),
        }));
      }
      await tick(280);
      return sellerPerformanceRows(period);
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

/** Live: a fulfilment job is a seller order — paid → to-post, shipped →
 *  posted, delivered → delivered. */
function mapOrderToFulfilmentJob(o: {
  id: string;
  listingId: string;
  listingTitle?: string | null;
  listingImageUrl?: string | null;
  buyerUsername?: string | null;
  subtotalGbp: number;
  status: string;
  createdAt: string;
  shipByDate?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  trackingNumber?: string | null;
  shippingProvider?: string | null;
}): FulfilmentJob {
  const status = o.status.toLowerCase();
  const stage: FulfilmentJob['stage'] =
    status === 'delivered' ? 'delivered' : o.shippedAt || status === 'shipped' || status === 'in transit' ? 'posted' : 'to-post';
  return {
    id: o.id,
    listingId: o.listingId,
    title: o.listingTitle ?? 'Listing',
    thumb: o.listingImageUrl ?? '',
    buyer: { name: o.buyerUsername ?? 'Buyer', avatar: '' },
    paid: o.subtotalGbp,
    service: o.shippingProvider ?? '',
    stage,
    orderedAt: o.createdAt,
    shipBy: o.shipByDate ?? '',
    postedAt: o.shippedAt ?? undefined,
    trackingNumber: o.trackingNumber ?? undefined,
    deliveredAt: o.deliveredAt ?? undefined,
  };
}

export function useFulfilmentQueue() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'fulfilment', DATA_MODE, user?.id],
    queryFn: async (): Promise<FulfilmentJob[]> => {
      if (DATA_MODE === 'live' && user?.id) {
        const page = await commerceService.fetchOrders({
          role: 'seller',
          status: 'paid,shipped,in transit,out for delivery',
          limit: 50,
        });
        return page.raw
          .map((o) =>
            mapOrderToFulfilmentJob({
              id: o.id,
              listingId: o.listingId,
              listingTitle: o.listingTitle,
              listingImageUrl: o.listingImageUrl,
              buyerUsername: o.buyerUsername,
              subtotalGbp: o.subtotalGbp,
              status: o.status,
              createdAt: o.createdAt,
              shipByDate: o.shipByDate,
              shippedAt: o.shippedAt,
              deliveredAt: o.deliveredAt,
              trackingNumber: o.trackingNumber,
              shippingProvider: o.shippingProvider,
            }),
          )
          .sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
      }
      await tick();
      return [...FULFILMENT_QUEUE].sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

/** Optimistic dispatch — the row moves to Posted before the "network" answers.
 *  Live mode posts /orders/:id/ship; fixture mode mutates the queue overlay. */
export function useMarkPosted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (DATA_MODE === 'live') {
        await commerceService.shipOrder(jobId, {});
        return null;
      }
      await tick(420);
      return markJobPosted(jobId);
    },
    onMutate: async (jobId) => {
      await qc.cancelQueries({ queryKey: ['seller', 'fulfilment'] });
      const previous = qc.getQueryData<FulfilmentJob[]>(['seller', 'fulfilment']);
      qc.setQueryData<FulfilmentJob[]>(['seller', 'fulfilment'], (old) =>
        (old ?? []).map((j) =>
          j.id === jobId
            ? {
                ...j,
                stage: 'posted' as const,
                postedAt: new Date().toISOString(),
                // Fixture mode seeds a plausible label number; live mode
                // waits for the ship response's real trackingNumber.
                ...(DATA_MODE === 'live'
                  ? {}
                  : { trackingNumber: `RM48${Math.floor(100_000_000 + Math.random() * 899_999_999)}GB` }),
              }
            : j,
        ),
      );
      return { previous };
    },
    onError: (_err, _jobId, ctx) => {
      if (ctx?.previous) qc.setQueryData(['seller', 'fulfilment'], ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['seller', 'fulfilment'] });
      void qc.invalidateQueries({ queryKey: ['seller', 'overview'] });
    },
  });
}

export function useSellerEarnings() {
  return useQuery({
    queryKey: ['seller', 'earnings'],
    queryFn: async (): Promise<{
      schedule: PayoutSchedule;
      entries: PayoutEntry[];
      monthly: MonthlyTotal[];
    }> => {
      await tick(280);
      return { schedule: payoutSchedule(), entries: payoutEntries(), monthly: monthlyTotals() };
    },
  });
}

export function useSellerTodos() {
  return useQuery({
    queryKey: ['seller', 'todos'],
    queryFn: async (): Promise<SellerTodo[]> => {
      await tick(200);
      return sellerTodos();
    },
  });
}

export function useFulfilmentCounts() {
  const { data } = useFulfilmentQueue();
  const toPost = (data ?? []).filter((j) => j.stage === 'to-post').length;
  const posted = (data ?? []).filter((j) => j.stage === 'posted').length;
  return { toPost, posted };
}
