'use client';

/**
 * Seller query hooks — the only path from seller-hub screens to data.
 * Fixture-backed with simulated latency, mirroring lib/hooks/queries.ts
 * posture; live mode will target /api/seller/* when that surface lands.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
  proposeJobExtension,
  recordPendingExtension,
  pendingExtensionFor,
  dropPendingExtension,
  assertJobHandoff,
  handoffAssertedFor,
  recordHandoffAssertion,
  pauseFixtureListing,
  resumeFixtureListing,
  deleteFixtureListing,
  applyAwayStateToFixtures,
  loadSellerAwayState,
  saveSellerAwayState,
  loadSellerStorefront,
  saveSellerStorefront,
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
import { ApiRequestError, isRecord } from '@/lib/api/http';
import * as sellerHubService from '@/lib/api/services/sellerHub';
import * as commerceService from '@/lib/api/services/commerce';
import * as sellersService from '@/lib/api/services/sellers';
import * as listingsService from '@/lib/api/services/listings';
import { MY_LISTINGS } from '@/lib/data/fixtures';
import { MY_LISTING_STATS, OFFERS, setListingStatus } from '@/lib/data/fixtures-commerce';
import { getListingCoverUri } from '@/lib/utils/media';
import { useSession } from '@/lib/session/SessionProvider';
import * as storefrontService from '@/lib/api/services/storefront';
import { PROFILE_AGGREGATE_ROOT } from '@/lib/hooks/profile-queries';
import {
  MAX_FEATURED,
  featuredIdsFor,
  useShopRailPins,
} from '@/components/profile/shopRailData';
import { useHydrated } from '@/lib/store/useStore';
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
  /** Near-winners — active listings with real 30-day view volume and no
   *  30-day sale (the overview's opportunities projection). Null when the
   *  source is unavailable; empty when none qualify — both render nothing. */
  opportunities: SellerOpportunity[] | null;
}

/** The web view-model for the overview's near-winner rows. */
export interface SellerOpportunity {
  listingId: string;
  title: string;
  imageUrl: string | null;
  priceGbp: number | null;
  views30d: number;
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
    // Verbatim from the overview aggregate — null stays null (source
    // unavailable → the rail renders nothing, not an empty state).
    opportunities: overview.opportunities ?? null,
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
    // Fixture parity with the server's near-winner rule — active fixture
    // listings with view volume and no sale, highest views first, max 4.
    opportunities: sellerPerformanceRows('30d')
      .filter((r) => !r.listing.isSold && r.listing.status !== 'sold' && r.views >= 10)
      .sort((a, b) => b.views - a.views)
      .slice(0, 4)
      .map((r) => ({
        listingId: r.listing.id,
        title: r.listing.title,
        imageUrl: getListingCoverUri(r.listing.images) || null,
        priceGbp: r.listing.price,
        views30d: r.views,
      })),
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
          // 'delivered' must ride the query — excluding it left the
          // Delivered tab permanently empty (a dispatched order vanished
          // on delivery instead of landing in its tab).
          status: 'paid,shipped,in transit,out for delivery,delivered',
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
          .map((j) => {
            // The list wire projects only accepted extensions (folded into
            // shipByDate). A pending one survives here only via the
            // session overlay of server-confirmed proposals — and only
            // while 'paid', the status the server gates it on.
            if (j.stage !== 'to-post') {
              dropPendingExtension(j.id);
              return j;
            }
            const pending = pendingExtensionFor(j.id);
            const handoffAt = handoffAssertedFor(j.id);
            return pending || handoffAt
              ? {
                  ...j,
                  pendingExtension: pending ?? j.pendingExtension,
                  // Session-scoped truth: the list wire never projects
                  // handoff_asserted events; the order's parcel trail is
                  // the durable surface for the claim.
                  handoffAssertedAt: handoffAt ?? j.handoffAssertedAt,
                }
              : j;
          })
          .sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
      }
      await tick();
      return [...FULFILMENT_QUEUE].sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

/** The dispatch input — tracking is seller-collected (DispatchSheet) or
 *  already on the job (carrier-label path minted it). `carrier` is the
 *  issuer the sheet recorded, falling back to the job's booked service. */
export interface MarkPostedInput {
  jobId: string;
  trackingNumber?: string;
  carrier?: string;
}

/** Optimistic dispatch — the row moves to Posted before the "network" answers.
 *  Live mode posts /orders/:id/ship — which rejects a bare call
 *  (TRACKING_REQUIRED, 422) — so a job with no reference anywhere throws
 *  before the wire rather than firing a doomed write; the caller collects
 *  tracking first. Fixture mode mutates the queue overlay. */
export function useMarkPosted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkPostedInput) => {
      const { jobId } = input;
      if (DATA_MODE === 'live') {
        const job = qc
          .getQueriesData<FulfilmentJob[]>({ queryKey: ['seller', 'fulfilment'] })
          .flatMap(([, rows]) => rows ?? [])
          .find((j) => j.id === jobId);
        const trackingNumber = input.trackingNumber ?? job?.trackingNumber;
        if (!trackingNumber) {
          // Never fire shipOrder without a reference — the server can
          // only 422 it and the optimistic write would flash a lie.
          throw new Error('TRACKING_REQUIRED');
        }
        await commerceService.shipOrder(jobId, {
          trackingNumber,
          shippingProvider: input.carrier ?? (job?.service || undefined),
        });
        return null;
      }
      await tick(420);
      return markJobPosted(jobId, input.trackingNumber);
    },
    onMutate: async (input) => {
      const { jobId } = input;
      await qc.cancelQueries({ queryKey: ['seller', 'fulfilment'] });
      const previous = qc.getQueryData<FulfilmentJob[]>(['seller', 'fulfilment']);
      qc.setQueryData<FulfilmentJob[]>(['seller', 'fulfilment'], (old) =>
        (old ?? []).map((j) =>
          j.id === jobId
            ? {
                ...j,
                stage: 'posted' as const,
                postedAt: new Date().toISOString(),
                // A seller-entered reference is the seller's own truth —
                // echo it optimistically; a minted one is never invented
                // here (the settled refetch brings the server's value).
                trackingNumber: input.trackingNumber ?? j.trackingNumber,
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

/** The extension proposal input — days + the optional buyer-facing note. */
export interface ProposeExtensionInput {
  jobId: string;
  days: number;
  /** Optional reason (≤500 chars) — the contract's `note`. */
  note?: string;
}

/**
 * POST /orders/:id/dispatch-extension — the seller proposes extra days;
 * the buyer must accept before the new ship-by applies. Never optimistic:
 * the pending state lands only on a server-confirmed proposal, or on a
 * 409 EXTENSION_PENDING that proves one already exists (a stale row can
 * still offer the affordance — the list wire doesn't project pending
 * extensions, so the conflict response is the freshest truth available).
 */
export function useProposeDispatchExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProposeExtensionInput) => {
      if (DATA_MODE === 'live') {
        try {
          const ext = await commerceService.proposeDispatchExtension(
            input.jobId,
            input.days,
            input.note,
          );
          recordPendingExtension(input.jobId, {
            days: ext.days,
            proposedShipBy: ext.proposedShipBy,
          });
          return ext;
        } catch (error) {
          if (isExtensionPendingConflict(error)) {
            // Server-confirmed pending — pin it so the row stops offering
            // the affordance. The 409 carries no proposedShipBy, so the
            // date stays unknown rather than invented.
            recordPendingExtension(input.jobId, {
              days: input.days,
              proposedShipBy: null,
            });
          }
          throw error;
        }
      }
      await tick(420);
      const job = proposeJobExtension(input.jobId, input.days);
      if (!job?.pendingExtension) throw new Error('EXTENSION_UNAVAILABLE');
      return job.pendingExtension;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['seller', 'fulfilment'] });
      // The order detail carries the pending extension for both roles.
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** True when the server rejected a proposal because one is already
 *  awaiting the buyer (409 + code EXTENSION_PENDING). */
function isExtensionPendingConflict(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    isRecord(error.details) &&
    error.details.code === 'EXTENSION_PENDING'
  );
}

/** The handoff claim input — tracking/carrier/label the seller already
 *  holds; every field is optional on the wire. */
export interface AssertHandoffInput {
  /** The queue job id IS the order id — same pairing markJobPosted uses. */
  jobId: string;
  trackingNumber?: string;
  carrier?: string;
  labelUrl?: string;
}

/**
 * POST /orders/:id/fulfilment/handoff-assertion — the seller reports the
 * parcel is already with the carrier and the scan hasn't landed yet.
 * NOT optimistic and NOT a dispatch: the route never mutates orders.status
 * (it 409s unless 'paid'), so success records the claim as evidence and
 * leaves the row 'to-post' awaiting the first carrier scan. Live mode
 * pins the confirmed claim into the session overlay so the row stops
 * offering the affordance; the durable surface is the order's parcel
 * events read.
 */
export function useAssertHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssertHandoffInput) => {
      if (DATA_MODE === 'live') {
        const result = await commerceService.assertOrderHandoff(input.jobId, {
          trackingNumber: input.trackingNumber,
          shippingProvider: input.carrier,
          labelUrl: input.labelUrl,
        });
        recordHandoffAssertion(input.jobId, result.handoffClaimedAt);
        return result;
      }
      await tick(320);
      const job = assertJobHandoff(input.jobId);
      if (!job?.handoffAssertedAt) throw new Error('HANDOFF_UNAVAILABLE');
      return { orderId: input.jobId, handoffClaimedAt: job.handoffAssertedAt, status: 'paid' };
    },
    onSettled: (_r, _e, input) => {
      void qc.invalidateQueries({ queryKey: ['seller', 'fulfilment'] });
      if (input?.jobId) {
        // The claim lands on the order's parcel trail — refresh the
        // detail reads so the buyer-side surface shows the same event.
        void qc.invalidateQueries({ queryKey: ['order', input.jobId] });
      }
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/**
 * POST /sellers/:id/listings/:listingId/price-adjust — the dedicated
 * repricing write (durable price event, outbox, alert evaluation, search
 * sync — none of which a generic listing patch performs). Never
 * optimistic: the listing only re-renders at the new price once the
 * server confirms it. Fixture mode applies the same field edit the
 * listing tools use, rejecting sold/unchanged like the route does.
 */
export function useAdjustListingPrice() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: { listingId: string; newPriceGbp: number }) => {
      if (DATA_MODE === 'live' && user?.id) {
        return sellersService.adjustListingPrice(user.id, input.listingId, input.newPriceGbp);
      }
      await tick(320);
      const current = MY_LISTINGS.find((l) => l.id === input.listingId);
      if (!current) throw new Error('Listing not found');
      if (Math.abs(current.price - input.newPriceGbp) < 0.005) {
        throw new Error('New price must differ from current price');
      }
      const receipt = applyFixtureListingEdit(input.listingId, { priceGbp: input.newPriceGbp });
      if (receipt.state === 'rejected') throw new Error(receipt.reason ?? 'Listing cannot be repriced');
      return {
        listingId: input.listingId,
        previousPriceGbp: current.price,
        newPriceGbp: input.newPriceGbp,
        changedAt: new Date().toISOString(),
      };
    },
    onSettled: (_r, _e, input) => {
      if (input?.listingId) {
        void qc.invalidateQueries({ queryKey: ['listing', input.listingId] });
        void qc.invalidateQueries({ queryKey: ['seller', 'listing', input.listingId] });
      }
      // The manage surface itself reads the my-listings projection.
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
      void qc.invalidateQueries({ queryKey: ['seller', 'listings'] });
      void qc.invalidateQueries({ queryKey: ['seller', 'performance'] });
      void qc.invalidateQueries({ queryKey: ['seller', 'overview'] });
    },
  });
}

/** Statuses whose proceeds are still inside the clearance window. */
const CLEARING_STATUSES = new Set([
  'paid', 'processing', 'preparing', 'shipped', 'in transit', 'out for delivery',
]);
const SETTLED_STATUSES = new Set(['delivered', 'completed']);

/**
 * A clearance row on the earnings page. `releaseAt` and `soldAt` widen to
 * null vs the fixture PayoutEntry: the live wire doesn't always carry a
 * scheduled release (or the order join for a reserve-era row), and the
 * renderer must say "—" rather than print the sold date as if it were a
 * release date.
 */
export interface SellerEarningsEntry extends Omit<PayoutEntry, 'releaseAt' | 'soldAt'> {
  soldAt: string | null;
  releaseAt: string | null;
}

/**
 * Seller earnings — fixture mode reads the escrow ledger fixtures; live
 * mode derives the same view-model from real server data:
 *  - available/pending/reserve come from /seller-hub/overview money —
 *    "Pending clearance" is processingGbp only; heldGbp (rolling reserve)
 *    is its own figure because reserve holds have no order row to list,
 *  - clearance entries are the seller's in-flight orders, enriched with
 *    the ledger-backed releaseScheduledAt from /users/:id/wallet/balances,
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
      entries: SellerEarningsEntry[];
      monthly: MonthlyTotal[];
      /** Rolling reserve (heldGbp) — null when the money read was
       *  unavailable; the page renders '—', never a fabricated £0. */
      heldInReserve: number | null;
    }> => {
      if (DATA_MODE === 'live' && user?.id) {
        const [overview, orders, balances] = await Promise.all([
          sellerHubService.fetchSellerHubOverview(),
          commerceService.fetchOrders({ role: 'seller', limit: 50 }),
          // Ledger-backed balances — pendingBreakdown is the server's own
          // pending set (escrow unreleased, no release ledger entry) with
          // releaseScheduledAt per order, and its rows sum exactly to
          // pendingGbp. Soft-fail: without it the entries fall back to
          // status-derived order rows and release dates to '—'.
          commerceService.fetchWalletBalances(user.id).catch(() => null),
        ]);
        const orderById = new Map(orders.raw.map((o) => [o.id, o]));
        // Unknown release dates sort last — a row with no scheduled
        // release is never ordered as if it settles first.
        const byRelease = (a: SellerEarningsEntry, b: SellerEarningsEntry) => {
          const ta = a.releaseAt ? Date.parse(a.releaseAt) : Number.POSITIVE_INFINITY;
          const tb = b.releaseAt ? Date.parse(b.releaseAt) : Number.POSITIVE_INFINITY;
          return ta - tb;
        };
        const entries: SellerEarningsEntry[] = balances
          ? balances.pendingBreakdown
              .map((p) => {
                const o = orderById.get(p.orderId);
                return {
                  id: `po-${p.orderId}`,
                  orderId: p.orderId,
                  title: p.listingTitle ?? o?.listingTitle ?? 'Listing',
                  soldAt: o?.createdAt ?? null,
                  itemPrice: o?.subtotalGbp ?? p.amountGbp,
                  // The order row doesn't carry the fee split — null reads as
                  // "not broken out" rather than a fabricated zero deduction.
                  protectionFee: null,
                  net: null,
                  releaseAt: p.releaseScheduledAt ?? o?.estimatedReleaseAt ?? null,
                };
              })
              .sort(byRelease)
          : orders.raw
              .filter((o) => CLEARING_STATUSES.has(o.status.toLowerCase()))
              .map((o) => ({
                id: `po-${o.id}`,
                orderId: o.id,
                title: o.listingTitle ?? 'Listing',
                soldAt: o.createdAt,
                itemPrice: o.subtotalGbp,
                protectionFee: null,
                net: null,
                releaseAt: o.estimatedReleaseAt ?? null,
              }))
              .sort(byRelease);
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
            // When the ledger read landed, pendingGbp is the exact sum of
            // the breakdown rows above — the list reconciles to the penny.
            // Otherwise the overview's processing figure stands in.
            // heldGbp is rolling reserve, not per-order clearance; it gets
            // its own row so the breakdown still reconciles.
            pendingTotal: round2(balances?.pendingGbp ?? overview.money?.processingGbp ?? 0),
            lifetimeSales: overview.trust?.totalSales ?? null,
            available: round2(overview.money?.availableGbp ?? 0),
          },
          entries,
          monthly: [...monthBuckets.entries()].map(([label, b]) => ({
            label,
            revenue: round2(b.revenue),
            orders: b.orders,
          })),
          heldInReserve: balances
            ? round2(balances.heldInReserveGbp)
            : overview.money != null
              ? round2(overview.money.heldGbp ?? 0)
              : null,
        };
      }
      await tick(280);
      // Fixture money has no reserve-hold concept — 0 is the true figure.
      return {
        schedule: payoutSchedule(),
        entries: payoutEntries(),
        monthly: monthlyTotals(),
        heldInReserve: 0,
      };
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

/**
 * actionRoute arrives as a native screen name (sellerHub.ts) — a bare
 * href would 404. Map each onto the web surface that owns the work;
 * unknown names degrade to the hub, never a broken link.
 */
const TODO_ROUTE_TO_WEB: Record<string, string> = {
  // The task is seller-side order work — the fulfilment queue is the
  // web surface for it (orders page is the buyer's list).
  MyOrders: '/seller-hub/fulfilment',
  Offers: '/offers',
  InventoryManagement: '/seller-hub/listings',
  Wallet: '/wallet',
  CatalogImportProgress: '/seller-hub/import',
  // Web's verification surface is /verification (demands live under it) —
  // there is no /seller-hub/verification route.
  SellerVerification: '/verification',
};

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
            href:
              (t.actionRoute ? TODO_ROUTE_TO_WEB[t.actionRoute] : undefined) ??
              '/seller-hub',
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

/**
 * Appeal a standards defect — POST /sellers/:id/standards/appeal (mobile
 * SellerStandardsModule parity). Server-only: the appeal affordance is
 * gated on the live payload's appealsAvailable, so demo mode never calls
 * this — reaching it outside live is a caller bug, not a silent no-op.
 * The backend dedupes open appeals per (seller, metric); `alreadyOpen`
 * rides the result so a double-submit reads as success, not a failure.
 */
export function useSubmitStandardsAppeal() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (
      input: sellerHubService.SubmitStandardsAppealInput,
    ): Promise<{ appealId: string; alreadyOpen: boolean }> => {
      if (DATA_MODE !== 'live' || !user?.id) {
        throw new Error('appeals_unavailable');
      }
      return sellerHubService.submitStandardsAppeal(user.id, input);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['seller', 'standards'] });
    },
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

// ============================================================================
// STOREFRONT — the seller-authored shop front
// ============================================================================
// Web counterpart of the mobile storefront editor (EditProfileScreen's
// "Shop" fields + storefrontApi's publish/pause/rollback lifecycle). Live
// mode hits /storefronts/me verbatim; fixture mode keeps a device-local
// draft (loadSellerStorefront) with the featured pins riding the existing
// shopRailPins overlay so the editor and the profile rail share one truth.

/** The editor's working copy — the /storefronts/me fields the surface
 *  manages, flattened to the form's vocabulary. */
export interface StorefrontEditorState {
  status: storefrontService.StorefrontStatus;
  /** Optimistic-locking token — update and publish send it as If-Match. */
  revision: number;
  announcement: string | null;
  policies: storefrontService.StorefrontPolicies;
  /** Sections exist on the contract but this editor doesn't manage them —
   *  the count still gates publish (the backend's EMPTY_STOREFRONT rule
   *  requires a section or a featured listing). */
  sectionCount: number;
  publishedAt: string | null;
}

function editorStateFromApi(
  sf: storefrontService.StorefrontResponse,
): StorefrontEditorState {
  return {
    status: sf.status,
    revision: sf.revision,
    announcement: sf.announcement,
    policies: sf.policies,
    sectionCount: sf.sections.length,
    publishedAt: sf.publishedAt,
  };
}

function editorStateFromFixture(s: {
  status: 'draft' | 'published' | 'paused';
  announcement: string | null;
  policies: storefrontService.StorefrontPolicies;
  publishedAt: string | null;
}): StorefrontEditorState {
  return {
    status: s.status,
    revision: 0,
    announcement: s.announcement,
    policies: s.policies,
    sectionCount: 0,
    publishedAt: s.publishedAt,
  };
}

const storefrontKey = (userId: string | undefined) =>
  ['seller', 'storefront', DATA_MODE, userId] as const;

/** Invalidate every surface that renders storefront truth — the editor,
 *  the /u/[username] shop rail and the profile aggregate (announcement,
 *  policies and featured ids all ride the aggregate payload). */
function invalidateStorefrontReads(qc: QueryClient, ownerId?: string) {
  void qc.invalidateQueries({ queryKey: ['seller', 'storefront'] });
  void qc.invalidateQueries({ queryKey: ['shop-rail', ownerId] });
  void qc.invalidateQueries({ queryKey: [...PROFILE_AGGREGATE_ROOT] });
}

/** GET /storefronts/me (live) / the device-local draft (fixture). */
export function useMyStorefront() {
  const { user } = useSession();
  return useQuery({
    queryKey: storefrontKey(user?.id),
    queryFn: async (): Promise<StorefrontEditorState> => {
      if (DATA_MODE === 'live' && user?.id) {
        return editorStateFromApi(await storefrontService.fetchMyStorefront());
      }
      await tick(180);
      return editorStateFromFixture(loadSellerStorefront());
    },
    // Guests have no storefront — render the signed-out state, not a
    // fabricated draft.
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });
}

/**
 * The owner's effective featured-pin order. Live mode reads the published
 * rail (GET /storefronts/:id is the only contract that returns ids); the
 * owner's local pin overlay wins when present — the same edit-over-
 * published semantics useShopRail established. Draft/paused storefronts
 * 404 the public route, so the overlay (or empty) is the draft truth.
 */
export function useStorefrontFeatured(ownerId: string | null | undefined) {
  const override = useShopRailPins((s) => s.pinnedIds);
  const hydrated = useHydrated();
  return useQuery({
    queryKey: [
      'seller',
      'storefront',
      'featured',
      DATA_MODE,
      ownerId,
      hydrated ? (override?.join(',') ?? '') : 'pending',
    ],
    enabled: Boolean(ownerId),
    queryFn: async (): Promise<string[]> => {
      if (DATA_MODE === 'live' && ownerId) {
        const published = await storefrontService
          .fetchPublicStorefront(ownerId)
          .then((r) => r.featuredListings.map((f) => f.id))
          .catch(() => [] as string[]);
        return override ?? published;
      }
      await tick(160);
      return featuredIdsFor(ownerId ?? 'me', override);
    },
  });
}

export interface SaveStorefrontInput {
  announcement: string | null;
  policies: storefrontService.StorefrontPolicies;
  /** The full pinned order — the write replaces the rail wholesale. */
  featuredIds: string[];
}

/** Save announcement + policies + featured pins. Live mode issues the two
 *  real writes (PUT /storefronts/me with the loaded revision as If-Match,
 *  then PUT /storefronts/me/featured-listings); fixture mode persists the
 *  same state on-device. */
export function useSaveStorefront() {
  const qc = useQueryClient();
  const { user } = useSession();
  const setPinnedIds = useShopRailPins((s) => s.setPinnedIds);
  return useMutation({
    mutationFn: async (input: SaveStorefrontInput): Promise<StorefrontEditorState> => {
      const featured = input.featuredIds.slice(0, MAX_FEATURED);
      if (DATA_MODE === 'live' && user?.id) {
        const current = qc.getQueryData<StorefrontEditorState>(storefrontKey(user.id));
        const sf = await storefrontService.updateMyStorefront(
          { announcement: input.announcement, policies: input.policies },
          { ifMatchRevision: current?.revision },
        );
        const next = editorStateFromApi(sf);
        try {
          await storefrontService.setFeaturedListings(featured);
        } catch (err) {
          // The copy write already landed — park it so the error toast can
          // say exactly which half failed instead of implying a full loss.
          qc.setQueryData(storefrontKey(user.id), next);
          throw err;
        }
        setPinnedIds(featured);
        return next;
      }
      await tick(260);
      const s = loadSellerStorefront();
      const next = {
        ...s,
        announcement: input.announcement,
        policies: input.policies,
      };
      saveSellerStorefront(next);
      setPinnedIds(featured);
      return editorStateFromFixture(next);
    },
    onSuccess: (next) => {
      qc.setQueryData(storefrontKey(user?.id), next);
      invalidateStorefrontReads(qc, user?.id);
    },
  });
}

export type StorefrontStatusAction = 'publish' | 'pause' | 'rollback';

/** Publish / pause / rollback — the lifecycle posts against
 *  /storefronts/me/*. Publish requires the loaded revision (If-Match) and
 *  at least one section or featured listing (422 EMPTY_STOREFRONT); pause
 *  and rollback only apply to a published storefront (409 NOT_PUBLISHED).
 *  Fixture mode runs the same gates against the local draft so the state
 *  machine stays honest in demo. */
export function useStorefrontStatusAction() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (action: StorefrontStatusAction): Promise<StorefrontEditorState> => {
      if (DATA_MODE === 'live' && user?.id) {
        const revision =
          qc.getQueryData<StorefrontEditorState>(storefrontKey(user.id))?.revision ?? 0;
        const sf =
          action === 'publish'
            ? await storefrontService.publishMyStorefront(revision)
            : action === 'pause'
              ? await storefrontService.pauseMyStorefront()
              : await storefrontService.rollbackMyStorefront();
        return editorStateFromApi(sf);
      }
      await tick(240);
      const s = loadSellerStorefront();
      if (action === 'publish') {
        const featured = featuredIdsFor('me', useShopRailPins.getState().pinnedIds);
        if (featured.length === 0) {
          throw new Error('EMPTY_STOREFRONT');
        }
        s.status = 'published';
        s.publishedAt = new Date().toISOString();
      } else if (action === 'pause') {
        if (s.status !== 'published') throw new Error('NOT_PUBLISHED');
        s.status = 'paused';
      } else {
        if (s.status !== 'published') throw new Error('NOT_PUBLISHED');
        s.status = 'draft';
        s.publishedAt = null;
      }
      saveSellerStorefront(s);
      return editorStateFromFixture(s);
    },
    onSuccess: (next) => {
      qc.setQueryData(storefrontKey(user?.id), next);
      invalidateStorefrontReads(qc, user?.id);
    },
  });
}

// ============================================================================
// LISTING ATTENTION — GET /sellers/:id/analytics/attention
// ============================================================================

/** The web view-model for the attention list — the server's under-reach
 *  verdict, verbatim (priority included; the client never re-derives it). */
export interface NeedsAttentionRow {
  listingId: string;
  title: string;
  imageUrl: string | null;
  views: number;
  likes: number;
  offers: number;
  priority: 'high' | 'medium';
}

/**
 * Listings needing attention — live mode reads
 * GET /sellers/:id/analytics/attention against the exact analytics range
 * (the endpoint takes startDate+endDate, so a custom range is a real
 * window, not the nearest preset). Fixture mode applies the same rule to
 * the demo closet: active listings under the view floor, lowest first.
 */
export function useNeedsAttention(range: SellerAnalyticsRange | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['seller', 'attention', range?.from, range?.to, DATA_MODE, user?.id],
    queryFn: async (): Promise<NeedsAttentionRow[]> => {
      if (!range) return [];
      if (DATA_MODE === 'live' && user?.id) {
        const items = await sellerHubService.fetchNeedsAttention(user.id, {
          limit: 5,
          startDate: range.from,
          endDate: range.to,
        });
        return items.map((i) => ({
          listingId: i.listingId,
          title: i.title,
          imageUrl: i.coverImageUrl,
          views: i.views,
          likes: i.likes,
          offers: i.offerCount,
          priority: i.priority,
        }));
      }
      await tick(240);
      const days = Math.max(
        1,
        Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1,
      );
      const period: SellerPeriod = days <= 7 ? '7d' : days <= 30 ? '30d' : '90d';
      return sellerPerformanceRows(period)
        .filter((r) => !r.listing.isSold && r.listing.status !== 'sold' && r.views < 10)
        .sort((a, b) => a.views - b.views)
        .slice(0, 5)
        .map((r) => ({
          listingId: r.listing.id,
          title: r.listing.title,
          imageUrl: getListingCoverUri(r.listing.images) || null,
          views: r.views,
          likes: r.likes,
          offers: OFFERS.filter(
            (o) => o.sellerId === 'me' && o.listingId === r.listing.id,
          ).length,
          priority: (r.views < 3 ? 'high' : 'medium') as NeedsAttentionRow['priority'],
        }));
    },
    enabled: Boolean(range) && (DATA_MODE !== 'live' || Boolean(user?.id)),
  });
}
