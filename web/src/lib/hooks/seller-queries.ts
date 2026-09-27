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
  sellerOffersReceived,
  sellerPerformanceRows,
  sellerPromotions,
  createSellerPromotion,
  setSellerPromotionStatus,
  sellerStandardsFixture,
  sellerTodos,
  markJobPosted,
  pauseFixtureListing,
  resumeFixtureListing,
  deleteFixtureListing,
  applyAwayStateToFixtures,
  loadSellerAwayState,
  saveSellerAwayState,
  type FulfilmentJob,
  type ListingPerformanceRow,
  type MonthlyTotal,
  type PayoutEntry,
  type PayoutSchedule,
  type SellerAwayState,
  type SellerDailyPoint,
  type SellerMetric,
  type SellerPromotionFixture,
  type SellerStandardsFixture,
  type SellerTodo,
} from '@/lib/data/fixtures-seller';
import { DATA_MODE } from '@/lib/api/client';
import * as sellerHubService from '@/lib/api/services/sellerHub';
import * as commerceService from '@/lib/api/services/commerce';
import * as listingsService from '@/lib/api/services/listings';
import { MY_LISTINGS } from '@/lib/data/fixtures';
import { MY_LISTING_STATS, OFFERS, setListingStatus } from '@/lib/data/fixtures-commerce';
import { useSession } from '@/lib/session/SessionProvider';
import {
  applyFixtureListingEdit,
  fixtureSeriesBounds,
  latestLikerOffer,
  recordLikerOffer,
  sellerCategoryMix,
  sellerRepeatBuyerStats,
  sellerSeriesRange,
  type LikerOfferBatch,
  type RepeatBuyerStats,
  type SellerCategorySlice,
} from '@/lib/data/fixtures-sellertools';

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
  /** The period funnel's raw numbers — views → watchers → offers → sales.
   *  Offers are real OFFERS rows / fetched offers in both modes; null
   *  only if a live fetch fails (the UI renders "—", never a guess). */
  funnel: { views: number; watchers: number; offers: number | null; orders: number };
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
  offersReceived: number | null,
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
    // Same numbers the metric cells show — one funnel, one truth.
    funnel: { views, watchers: likes, offers: offersReceived, orders },
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
    // Demo caveat: the daily series tracks saves/likes, which stand in for
    // watchers — honest as an estimate, labelled in the UI via `estimated`.
    { key: 'watchers', label: 'Watchers', value: likes.toLocaleString('en-GB'), delta: pctDelta(likes, prevLikes), estimated: true },
    { key: 'conversion', label: 'Conversion', value: fmtPct(conversion), delta: pctDelta(conversion, prevConversion) },
    { key: 'aov', label: 'Avg sale', value: fmtMoney(aov), delta: pctDelta(aov, prevAov) },
    { key: 'sellThrough', label: 'Sell-through', value: fmtPct(sellThrough), delta: pctDelta(sellThrough, prevSellThrough) },
  ];

  // Same truth the wallet and the earnings screen read — never a
  // hardcoded figure that can drift from WALLET_BALANCE.
  const schedule = payoutSchedule();
  return {
    available: schedule.available,
    pending: round2(schedule.pendingTotal),
    lifetimeSales: schedule.lifetimeSales ?? 0,
    currency: 'GBP',
    period,
    series: current,
    revenueTotal: revenue,
    revenuePrev: prevRevenue,
    revenueDelta: pctDelta(revenue, prevRevenue),
    peak: peakPoint ? { date: peakPoint.date, value: peakPoint.revenue } : null,
    metrics,
    // Real OFFERS rows received inside the window — the funnel's middle
    // stage. Watchers stand in for saves (the series tracks likes) and
    // are labelled estimated where the metric grid renders.
    funnel: {
      views,
      watchers: likes,
      offers: sellerOffersReceived(period),
      orders,
    },
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
        const [overview, analytics, daily, offers] = await Promise.all([
          sellerHubService.fetchSellerHubOverview(),
          sellerHubService.fetchSellerAnalytics(user.id, period),
          sellerHubService.fetchSellerAnalyticsDaily(user.id, period),
          // Received offers power the funnel's middle stage — a soft-fail
          // (null) degrades to an honest "—" rather than a fake count.
          commerceService.fetchOffers().then((rows) => {
            const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            const cutoff = Date.now() - days * 86_400_000;
            return rows.filter(
              (o) => o.sellerId === user.id && Date.parse(o.createdAt) >= cutoff,
            ).length;
          }).catch(() => null),
        ]);
        return buildLiveOverview(period, overview, analytics, daily, offers);
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
                // No optimistic tracking number — a minted reference would
                // display as real before the server confirms it. The
                // settled refetch brings the authoritative value.
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
      // The buyer-visible order ships with the same write — keep the
      // commerce list honest for fixture-mode dispatch too.
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** Statuses whose proceeds are still inside the clearance window. */
const CLEARING_STATUSES = new Set([
  'paid', 'processing', 'preparing', 'shipped', 'in transit', 'out for delivery',
]);
const SETTLED_STATUSES = new Set(['delivered', 'completed']);

/**
 * Seller earnings — fixture mode reads the escrow ledger fixtures; live
 * mode derives the same view-model from real server data:
 *  - pending/available come from /seller-hub/overview money,
 *  - clearance entries are the seller's in-flight orders,
 *  - monthly totals group settled seller orders by month.
 * Fields the live contract doesn't expose stay null — the UI renders an
 * honest unavailable state instead of invented figures.
 */
export function useSellerEarnings() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'earnings', DATA_MODE, user?.id],
    queryFn: async (): Promise<{
      schedule: PayoutSchedule;
      entries: PayoutEntry[];
      monthly: MonthlyTotal[];
    }> => {
      if (DATA_MODE === 'live' && user?.id) {
        const [overview, orders] = await Promise.all([
          sellerHubService.fetchSellerHubOverview(),
          commerceService.fetchOrders({ role: 'seller', limit: 50 }),
        ]);
        const entries: PayoutEntry[] = orders.raw
          .filter((o) => CLEARING_STATUSES.has(o.status.toLowerCase()))
          .map((o) => ({
            id: `po-${o.id}`,
            orderId: o.id,
            title: o.listingTitle ?? 'Listing',
            soldAt: o.createdAt,
            itemPrice: o.subtotalGbp,
            // The order row doesn't carry the fee split — null reads as
            // "not broken out" rather than a fabricated zero deduction.
            protectionFee: null,
            net: null,
            releaseAt: o.estimatedReleaseAt ?? o.deliveredAt ?? o.createdAt,
          }))
          .sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt));
        const monthBuckets = new Map<string, { revenue: number; orders: number }>();
        for (const o of [...orders.raw].sort(
          (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
        )) {
          if (!SETTLED_STATUSES.has(o.status.toLowerCase())) continue;
          const label = new Date(o.deliveredAt ?? o.createdAt).toLocaleDateString('en-GB', {
            month: 'long',
          });
          const bucket = monthBuckets.get(label) ?? { revenue: 0, orders: 0 };
          bucket.revenue += o.subtotalGbp;
          bucket.orders += 1;
          monthBuckets.set(label, bucket);
        }
        return {
          schedule: {
            nextDate: overview.money?.nextPayoutAt ?? null,
            nextAmount: null,
            method: null,
            pendingTotal: round2(
              (overview.money?.processingGbp ?? 0) + (overview.money?.heldGbp ?? 0),
            ),
            lifetimeSales: overview.trust?.totalSales ?? null,
            available: round2(overview.money?.availableGbp ?? 0),
          },
          entries,
          monthly: [...monthBuckets.entries()].map(([label, b]) => ({
            label,
            revenue: round2(b.revenue),
            orders: b.orders,
          })),
        };
      }
      await tick(280);
      return { schedule: payoutSchedule(), entries: payoutEntries(), monthly: monthlyTotals() };
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

export function useSellerTodos() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'todos', DATA_MODE, user?.id],
    queryFn: async (): Promise<SellerTodo[]> => {
      if (DATA_MODE === 'live' && user?.id) {
        // The server-computed radar — /seller-hub/overview tasks are the
        // same rows mobile renders; map them onto the web view-model.
        const overview = await sellerHubService.fetchSellerHubOverview();
        return (overview.tasks ?? []).map((t): SellerTodo => {
          const type = t.type.toLowerCase();
          const kind: SellerTodo['kind'] =
            type.includes('dispatch') || type.includes('ship')
              ? 'dispatch'
              : type.includes('offer')
                ? 'offers'
                : 'inventory';
          const priority = t.priority.toLowerCase();
          return {
            id: t.id,
            kind,
            title: t.actionLabel,
            meta: t.dueAt
              ? `Due ${new Date(t.dueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
              : '',
            href: t.actionRoute || '/seller-hub',
            count: t.count,
            tone: priority === 'urgent' || priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'neutral',
          };
        });
      }
      await tick(200);
      return sellerTodos();
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

export function useFulfilmentCounts() {
  const { data } = useFulfilmentQueue();
  const toPost = (data ?? []).filter((j) => j.stage === 'to-post').length;
  const posted = (data ?? []).filter((j) => j.stage === 'posted').length;
  return { toPost, posted };
}

// ============================================================================
// AWAY MODE — seller-side holiday/vacation control
// ============================================================================

/**
 * The seller's away state. Live mode reads PATCH-capable
 * /users/me/preferences; fixture mode persists on-device and projects the
 * flag onto the fixture listings' seller record so the buyer-side gate
 * actually pauses purchases in the demo — one truth, not a dead toggle.
 */
export function useShopAway() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'away', DATA_MODE, user?.id],
    queryFn: async (): Promise<SellerAwayState> => {
      if (DATA_MODE === 'live' && user?.id) {
        const prefs = await sellerHubService.fetchAccountPreferences();
        return {
          holidayMode: prefs.holidayMode,
          holidayModeUntil: prefs.holidayModeUntil,
          awayMessage: prefs.awayMessage,
        };
      }
      await tick(160);
      const state = loadSellerAwayState();
      // Keep the fixture projection warm on every read — a fresh session
      // still pauses the demo buy buttons the persisted state set last time.
      applyAwayStateToFixtures(state);
      return state;
    },
    // Guests have no shop to pause — render the signed-out state, not a
    // fabricated toggle.
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

/** Write the away state — live PATCHes /users/me/preferences (the backend
 *  rejects past return dates and clears stored away fields on disable);
 *  fixture mode writes the device store and re-projects the flag. */
export function useUpdateShopAway() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (next: SellerAwayState): Promise<SellerAwayState> => {
      if (DATA_MODE === 'live' && user?.id) {
        const prefs = await sellerHubService.updateAccountPreferences({
          holidayMode: next.holidayMode,
          holidayModeUntil: next.holidayMode ? next.holidayModeUntil : null,
          awayMessage: next.holidayMode ? next.awayMessage : null,
        });
        return {
          holidayMode: prefs.holidayMode,
          holidayModeUntil: prefs.holidayModeUntil,
          awayMessage: prefs.awayMessage,
        };
      }
      await tick(200);
      saveSellerAwayState(next);
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(['seller', 'away', DATA_MODE, user?.id], next);
      void qc.invalidateQueries({ queryKey: ['seller'] });
      void qc.invalidateQueries({ queryKey: ['listing'] });
    },
  });
}

// ============================================================================
// PROMOTIONS — sponsored-placement management
// ============================================================================

/**
 * Promotion list rows — live mode reads /seller/promotions verbatim;
 * fixture rows come from the session store (demo-flagged, zero metrics —
 * no invented impressions or spend).
 */
export type PromotionRow =
  | { kind: 'live'; promotion: sellerHubService.SellerPromotion }
  | { kind: 'demo'; promotion: SellerPromotionFixture };

export function useSellerPromotions() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'promotions', DATA_MODE, user?.id],
    queryFn: async (): Promise<PromotionRow[]> => {
      if (DATA_MODE === 'live' && user?.id) {
        const rows = await sellerHubService.fetchSellerPromotions();
        return rows.map((promotion): PromotionRow => ({ kind: 'live', promotion }));
      }
      await tick(220);
      return sellerPromotions().map((promotion): PromotionRow => ({ kind: 'demo', promotion }));
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

/** Per-promotion stats — live mode only. Fixture mode resolves null and
 *  the UI renders its demo disclosure instead of zeroed fake metrics. */
export function usePromotionStats(promotionId: string | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'promotion-stats', promotionId, DATA_MODE, user?.id],
    queryFn: async (): Promise<sellerHubService.PromotionStats | null> => {
      if (DATA_MODE === 'live' && promotionId) {
        return sellerHubService.fetchPromotionStats(promotionId);
      }
      await tick(180);
      return null;
    },
    enabled: DATA_MODE === 'live' && Boolean(user?.id) && Boolean(promotionId),
  });
}

/** Pause / resume / end — live hits the real lifecycle endpoints; fixture
 *  mutates the session store (no spend either way in demo). */
export function usePromotionAction() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: {
      promotionId: string;
      action: 'pause' | 'resume' | 'end';
    }) => {
      if (DATA_MODE === 'live' && user?.id) {
        const fn =
          input.action === 'pause'
            ? sellerHubService.pauseListingPromotion
            : input.action === 'resume'
              ? sellerHubService.resumeListingPromotion
              : sellerHubService.endListingPromotion;
        return fn(input.promotionId);
      }
      await tick(200);
      return setSellerPromotionStatus(input.promotionId, input.action);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['seller', 'promotions'] });
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
    },
  });
}

/** Create a promotion — live POSTs /seller/promotions (fail-closed balance
 *  check + idempotent create); fixture adds a demo-flagged session row. */
export function useCreatePromotion() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: {
      listingId: string;
      dailyBudgetGbp: number;
      durationDays: 7 | 14 | 30;
    }) => {
      if (DATA_MODE === 'live' && user?.id) {
        return sellerHubService.createListingPromotion({
          listingId: input.listingId,
          dailyBudgetMinor: Math.round(input.dailyBudgetGbp * 100),
          durationDays: input.durationDays,
        });
      }
      await tick(280);
      const row = createSellerPromotion(input);
      if (!row) throw new Error('That listing cannot be promoted');
      return row;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['seller', 'promotions'] });
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
    },
  });
}

// ============================================================================
// PER-LISTING STATS + SELLER STANDARDS
// ============================================================================

/** Fixture-derived per-listing stats — real fixture counts (views/watchers
 *  from MY_LISTING_STATS, offers from OFFERS) plus computed conversion.
 *  `demo` marks the whole payload so the sheet discloses its source. */
export interface ListingStatsView {
  views: number;
  watchers: number;
  likes: number;
  offers: number;
  purchases: number;
  /** purchases/views % — null when the listing has no views. */
  conversionRate: number | null;
  timeOnMarketDays: number;
  status: string;
  /** Server intent signal — live mode only; fixture can't compute it. */
  intentSignal: sellerHubService.SellerListingAnalyticsApi['intentSignal'] | null;
  priceHistory: { previousPrice: number; newPrice: number; changedAt: string }[];
  demo: boolean;
}

export function useListingStats(listingId: string | null, period: SellerPeriod) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'listing-stats', listingId, period, DATA_MODE, user?.id],
    queryFn: async (): Promise<ListingStatsView | null> => {
      if (!listingId) return null;
      if (DATA_MODE === 'live' && user?.id) {
        const a = await sellerHubService.fetchSellerListingAnalytics(user.id, listingId, period);
        return {
          views: a.views,
          watchers: a.saves,
          likes: a.likes,
          offers: a.offers,
          purchases: a.purchases,
          conversionRate: a.conversionRate,
          timeOnMarketDays: a.timeOnMarketDays,
          status: a.listing.status,
          intentSignal: a.intentSignal,
          priceHistory: a.priceHistory,
          demo: false,
        };
      }
      await tick(200);
      const listing = MY_LISTINGS.find((l) => l.id === listingId);
      if (!listing) return null;
      const authored = MY_LISTING_STATS[listingId];
      const views = authored?.views ?? listing.views ?? 0;
      const watchers = authored?.watchers ?? 0;
      const offers = OFFERS.filter(
        (o) => o.sellerId === 'me' && o.listingId === listingId,
      ).length;
      const purchases = listing.isSold || listing.status === 'sold' ? 1 : 0;
      return {
        views,
        watchers,
        likes: listing.likes,
        offers,
        purchases,
        conversionRate: views > 0 ? round2((purchases / views) * 100) : null,
        timeOnMarketDays: listing.createdAt
          ? Math.max(
              0,
              Math.floor((Date.now() - Date.parse(listing.createdAt)) / 86_400_000),
            )
          : 0,
        status: listing.status ?? 'active',
        intentSignal: null,
        priceHistory: [],
        demo: true,
      };
    },
    enabled: Boolean(listingId) && (DATA_MODE !== 'live' || Boolean(user?.id)),
  });
}

/** Seller standards — live mode returns the recomputed program metrics,
 *  tier and defects verbatim; fixture mode computes ship time and shipped
 *  count from the real queue rows and honestly leaves tier/returns out. */
export function useSellerStandards() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'standards', DATA_MODE, user?.id],
    queryFn: async (): Promise<
      | { kind: 'live'; standards: sellerHubService.SellerStandards }
      | { kind: 'demo'; standards: SellerStandardsFixture }
    > => {
      if (DATA_MODE === 'live' && user?.id) {
        const standards = await sellerHubService.fetchSellerStandards(user.id);
        return { kind: 'live', standards };
      }
      await tick(200);
      return { kind: 'demo', standards: sellerStandardsFixture() };
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

// ============================================================================
// BULK LISTING ACTIONS — POST /seller-hub/batch-command / fixture parity
// ============================================================================

export type BulkCommand = 'pause' | 'resume' | 'delete';

export interface BulkActionReceipt {
  listingId: string;
  state: 'applied' | 'rejected' | 'conflict';
  reason?: string;
  newStatus?: string;
}

export interface BulkActionResult {
  /** 'complete' when every item applied; 'partial' is a truthful outcome —
   *  the UI lists per-item receipts instead of rolling back or hiding it. */
  state: 'complete' | 'partial';
  results: BulkActionReceipt[];
}

/**
 * Multi-select bulk mutation. Live mode posts the real durable batch
 * command (per-item receipts, idempotency key); fixture mode runs the
 * equivalent per-item mutators so the same receipt vocabulary comes back
 * either way.
 */
export function useListingBatchCommand() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: {
      command: BulkCommand;
      listingIds: string[];
    }): Promise<BulkActionResult> => {
      if (DATA_MODE === 'live' && user?.id) {
        const res = await sellerHubService.submitSellerHubBatchCommand(
          input.command,
          input.listingIds.map((listingId) => ({ listingId })),
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        );
        return {
          state: res.state,
          results: res.results.map((r) => ({
            listingId: r.listingId,
            state: r.state,
            reason: r.reason,
            newStatus: r.newStatus,
          })),
        };
      }
      await tick(320);
      const run =
        input.command === 'pause'
          ? pauseFixtureListing
          : input.command === 'resume'
            ? resumeFixtureListing
            : deleteFixtureListing;
      const results = input.listingIds.map(run);
      return {
        state: results.every((r) => r.state === 'applied') ? 'complete' : 'partial',
        results,
      };
    },
    onSettled: () => {
      // Fixture mutations are in-place — push a fresh array reference so
      // structural sharing doesn't hide the change from readers.
      qc.setQueryData(['my-listings'], [...MY_LISTINGS]);
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
      void qc.invalidateQueries({ queryKey: ['seller'] });
    },
  });
}

/**
 * Bulk edit — the 'edit' batch command (mobile BulkEditSheet parity).
 * Each item carries its own patch: percent-style price edits resolve to
 * absolute priceGbp per row before submission, so the service contract
 * never has to express relative math.
 */
export function useListingBatchEdit() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: {
      items: { listingId: string; patch: sellerHubService.SellerHubListingEditPatch }[];
    }): Promise<BulkActionResult> => {
      if (DATA_MODE === 'live' && user?.id) {
        const res = await sellerHubService.submitSellerHubBatchCommand(
          'edit',
          input.items,
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        );
        return {
          state: res.state,
          results: res.results.map((r) => ({
            listingId: r.listingId,
            state: r.state,
            reason: r.reason,
            newStatus: r.newStatus,
          })),
        };
      }
      await tick(320);
      const results = input.items.map((item) =>
        applyFixtureListingEdit(item.listingId, item.patch),
      );
      return {
        state: results.every((r) => r.state === 'applied') ? 'complete' : 'partial',
        results,
      };
    },
    onSettled: () => {
      qc.setQueryData(['my-listings'], [...MY_LISTINGS]);
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
      void qc.invalidateQueries({ queryKey: ['seller'] });
    },
  });
}

// ============================================================================
// SINGLE-LISTING STATUS — mark sold / relist (mobile patchListingOnApi parity)
// ============================================================================

/**
 * Pause/resume/delete run through the batch command above; 'sold' is a
 * lifecycle transition the batch vocabulary doesn't carry, so it goes
 * through PATCH /listings/:id (live) or the fixture overlay (demo).
 */
export function useListingStatusPatch() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: {
      listingId: string;
      status: 'active' | 'sold';
    }): Promise<void> => {
      if (DATA_MODE === 'live' && user?.id) {
        await listingsService.patchListing(input.listingId, { status: input.status });
        return;
      }
      await tick(280);
      const updated = setListingStatus(input.listingId, input.status);
      if (!updated) throw new Error('listing_not_found');
    },
    onSettled: () => {
      qc.setQueryData(['my-listings'], [...MY_LISTINGS]);
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
      void qc.invalidateQueries({ queryKey: ['seller'] });
      void qc.invalidateQueries({ queryKey: ['listing'] });
    },
  });
}

// ============================================================================
// OFFER TO LIKERS — POST /listings/:id/offers-to-likers
// ============================================================================

export interface OfferToLikersInput {
  listingId: string;
  listingTitle: string;
  offerPriceGbp: number;
  discountPct: number | null;
  likerCount: number;
  includeFreeShipping: boolean;
  expiryHours: number;
}

export interface OfferToLikersOutcome {
  likerCount: number;
  created: number;
  skipped: number;
  /** Fixture sends are session-local records — disclosed wherever shown. */
  demo: boolean;
  batch: LikerOfferBatch | null;
}

/** Last liker-offer batch for a listing (fixture-mode session record). */
export function useLikerOfferHistory(listingId: string | null) {
  return useQuery({
    queryKey: ['seller', 'liker-offer', listingId],
    queryFn: async (): Promise<LikerOfferBatch | null> => {
      await tick(120);
      return listingId ? latestLikerOffer(listingId) : null;
    },
    enabled: Boolean(listingId) && DATA_MODE !== 'live',
  });
}

export function useSendOfferToLikers() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: OfferToLikersInput): Promise<OfferToLikersOutcome> => {
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `likers-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      if (DATA_MODE === 'live' && user?.id) {
        const res = await commerceService.sendOfferToLikers({
          listingId: input.listingId,
          offerPriceGbp: input.offerPriceGbp,
          discountPercent: input.discountPct ?? undefined,
          expiryHours: input.expiryHours,
          includeFreeShipping: input.includeFreeShipping,
          idempotencyKey,
        });
        return {
          likerCount: res.likerCount,
          created: res.created,
          skipped: res.skipped,
          demo: false,
          batch: null,
        };
      }
      await tick(360);
      // Fixture likers have no identity rows — the batch is recorded as a
      // session-local send receipt so the manage surface can show when an
      // offer was last pushed, marked demo wherever it renders.
      const batch = recordLikerOffer({
        listingId: input.listingId,
        offerPriceGbp: input.offerPriceGbp,
        discountPct: input.discountPct,
        likerCount: input.likerCount,
        includeFreeShipping: input.includeFreeShipping,
        expiryHours: input.expiryHours,
        batchKey: idempotencyKey,
      });
      return {
        likerCount: input.likerCount,
        created: input.likerCount,
        skipped: 0,
        demo: true,
        batch,
      };
    },
    onSettled: (_r, _e, input) => {
      void qc.invalidateQueries({ queryKey: ['seller', 'liker-offer', input?.listingId] });
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

// ============================================================================
// ANALYTICS — the /seller-hub/analytics aggregate view-model
// ============================================================================

/** An inclusive ISO (YYYY-MM-DD) range — presets resolve to this too. */
export interface SellerAnalyticsRange {
  from: string;
  to: string;
}

export interface SellerAnalyticsView {
  range: SellerAnalyticsRange;
  /** True when the requested range reached back beyond available history. */
  clamped: boolean;
  series: SellerDailyPoint[];
  revenueTotal: number;
  revenuePrev: number | null;
  revenueDelta: number | null;
  ordersTotal: number;
  viewsTotal: number;
  likesTotal: number;
  offersReceived: number | null;
  aov: number | null;
  conversionPct: number | null;
  /** Category mix over real inventory — live contract has no equivalent. */
  categoryMix: SellerCategorySlice[] | null;
  /** Cohort-style returning-buyer read — fixture-derived; live null. */
  repeatBuyers: RepeatBuyerStats | null;
  demo: boolean;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function buildFixtureAnalytics(range: SellerAnalyticsRange): SellerAnalyticsView {
  const bounds = fixtureSeriesBounds();
  const from = range.from < bounds.first ? bounds.first : range.from;
  const to = range.to > bounds.last ? bounds.last : range.to;
  const clamped = from !== range.from || to !== range.to;
  const series = sellerSeriesRange(from, to);

  const sum = (key: 'revenue' | 'orders' | 'views' | 'likes') =>
    series.reduce((s, p) => s + p[key], 0);
  const revenueTotal = round2(sum('revenue'));
  const ordersTotal = sum('orders');
  const viewsTotal = sum('views');
  const likesTotal = sum('likes');

  // The preceding equal-length window — the honest "vs previous" figure;
  // null when history doesn't reach back far enough to fill it.
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
  const prevTo = isoDay(new Date(Date.parse(from) - 86_400_000));
  const prevFrom = isoDay(new Date(Date.parse(from) - days * 86_400_000));
  const prevSeries =
    prevFrom >= bounds.first
      ? sellerSeriesRange(prevFrom, prevTo)
      : [];
  const revenuePrev =
    prevSeries.length > 0 ? round2(prevSeries.reduce((s, p) => s + p.revenue, 0)) : null;

  return {
    range: { from, to },
    clamped,
    series,
    revenueTotal,
    revenuePrev,
    revenueDelta:
      revenuePrev != null ? pctDelta(revenueTotal, revenuePrev) : null,
    ordersTotal,
    viewsTotal,
    likesTotal,
    // Exact-range offer count — the range picker's own window, not the
    // nearest preset (a 30d rollup masquerading as a 14d answer would
    // overstate the funnel).
    offersReceived: OFFERS.filter(
      (o) =>
        o.sellerId === 'me' &&
        Date.parse(o.createdAt) >= Date.parse(from) &&
        Date.parse(o.createdAt) <= Date.parse(to) + 86_400_000,
    ).length,
    aov: ordersTotal > 0 ? round2(revenueTotal / ordersTotal) : null,
    conversionPct: viewsTotal > 0 ? round2((ordersTotal / viewsTotal) * 100) : null,
    categoryMix: sellerCategoryMix(),
    repeatBuyers: sellerRepeatBuyerStats(),
    demo: true,
  };
}

/**
 * Live: the service contract only exposes preset periods — the widest
 * window (90d daily) is fetched and sliced to the requested range, so a
 * custom range is a real subset of server data, never an interpolation.
 * Category mix and repeat-buyer cohorts have no live contract — they stay
 * null and the UI renders an honest unavailable state.
 */
function buildLiveAnalytics(
  range: SellerAnalyticsRange,
  analytics: sellerHubService.SellerAnalyticsApi,
  daily: sellerHubService.SellerDailyApi[],
  offersReceived: number | null,
): SellerAnalyticsView {
  const revenueByDate = new Map(analytics.trend.current.map((p) => [p.date, p.value]));
  const all: SellerDailyPoint[] = daily.map((d) => ({
    date: d.date,
    revenue: round2((revenueByDate.get(d.date) ?? 0) / 100),
    orders: d.sales,
    views: d.views,
    likes: d.likes,
  }));
  const first = all[0]?.date ?? range.to;
  const last = all[all.length - 1]?.date ?? range.to;
  const from = range.from < first ? first : range.from;
  const to = range.to > last ? last : range.to;
  const series = all.filter((p) => p.date >= from && p.date <= to);

  const sum = (key: 'revenue' | 'orders' | 'views' | 'likes') =>
    series.reduce((s, p) => s + p[key], 0);
  const revenueTotal = round2(sum('revenue'));
  const ordersTotal = sum('orders');
  const viewsTotal = sum('views');
  const likesTotal = sum('likes');

  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
  const prevTo = isoDay(new Date(Date.parse(from) - 86_400_000));
  const prevFrom = isoDay(new Date(Date.parse(from) - days * 86_400_000));
  const prevSeries =
    prevFrom >= first ? all.filter((p) => p.date >= prevFrom && p.date <= prevTo) : [];
  const revenuePrev =
    prevSeries.length > 0 ? round2(prevSeries.reduce((s, p) => s + p.revenue, 0)) : null;

  return {
    range: { from, to },
    clamped: from !== range.from || to !== range.to,
    series,
    revenueTotal,
    revenuePrev,
    revenueDelta: revenuePrev != null ? pctDelta(revenueTotal, revenuePrev) : null,
    ordersTotal,
    viewsTotal,
    likesTotal,
    offersReceived,
    aov: ordersTotal > 0 ? round2(revenueTotal / ordersTotal) : null,
    conversionPct: viewsTotal > 0 ? round2((ordersTotal / viewsTotal) * 100) : null,
    categoryMix: null,
    repeatBuyers: null,
    demo: false,
  };
}

export function useSellerAnalytics(range: SellerAnalyticsRange | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'analytics', range?.from, range?.to, DATA_MODE, user?.id],
    queryFn: async (): Promise<SellerAnalyticsView> => {
      if (!range) throw new Error('range_required');
      if (DATA_MODE === 'live' && user?.id) {
        const [analytics, daily, offers] = await Promise.all([
          sellerHubService.fetchSellerAnalytics(user.id, '90d'),
          sellerHubService.fetchSellerAnalyticsDaily(user.id, '90d'),
          commerceService
            .fetchOffers()
            .then((rows) =>
              rows.filter(
                (o) =>
                  o.sellerId === user.id &&
                  Date.parse(o.createdAt) >= Date.parse(range.from) &&
                  Date.parse(o.createdAt) <= Date.parse(range.to) + 86_400_000,
              ).length,
            )
            .catch(() => null),
        ]);
        return buildLiveAnalytics(range, analytics, daily, offers);
      }
      await tick(300);
      return buildFixtureAnalytics(range);
    },
    enabled: Boolean(range) && (DATA_MODE !== 'live' || Boolean(user?.id)),
  });
}
