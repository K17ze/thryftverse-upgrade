/**
 * Seller fixtures — owned by the seller-hub department.
 *
 * Analytics depth for /seller-hub: a 90-day daily series (revenue, orders,
 * views, saves) that the 7/30/90-day periods slice, per-listing performance
 * rows, the fulfilment queue and the payout ledger. Derived from the shared
 * fixtures (MY_LISTINGS, USERS, OFFERS) so the seller's closet stays one
 * truth; the archive sales and queue live here, not in fixtures.ts.
 *
 * Series dates are generated relative to "now" at first read so period
 * deltas, dispatch deadlines and clearance countdowns behave like live data.
 * A seeded PRNG keeps every read of a session identical.
 */

import { MY_LISTINGS, USERS, WALLET_BALANCE } from '@/lib/data/fixtures';
import { OFFERS, protectionFeeFor } from '@/lib/data/fixtures-commerce';
import type { Listing } from '@/lib/contracts/domain';

const img = (id: string, w = 400) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// ============================================================================
// TYPES
// ============================================================================

export type SellerPeriod = '7d' | '30d' | '90d';

export interface SellerDailyPoint {
  /** ISO date (UTC midnight). */
  date: string;
  /** Net proceeds received that day, after buyer-protection deduction. */
  revenue: number;
  orders: number;
  views: number;
  /** New watchers/saves that day. */
  likes: number;
}

export interface SellerMetric {
  key: 'views' | 'watchers' | 'conversion' | 'aov' | 'sellThrough';
  label: string;
  value: string;
  /** % change vs the previous window of the same length. */
  delta: number | null;
}

export interface ListingPerformanceRow {
  listing: Listing;
  views: number;
  likes: number;
  watchers: number;
  /** Lifetime views→sale conversion, %. */
  conversion: number;
  ageDays: number;
}

export type FulfilmentStage = 'to-post' | 'posted' | 'delivered';

export interface FulfilmentJob {
  id: string;
  listingId: string;
  title: string;
  thumb: string;
  buyer: { name: string; avatar: string };
  /** Item price the buyer paid (excl. protection + postage). */
  paid: number;
  service: string;
  stage: FulfilmentStage;
  orderedAt: string;
  /** Dispatch deadline — server truth in live mode; fixture-authored here. */
  shipBy: string;
  postedAt?: string;
  trackingNumber?: string;
  deliveredAt?: string;
}

export interface PayoutEntry {
  id: string;
  orderId: string;
  title: string;
  soldAt: string;
  itemPrice: number;
  /** Buyer-protection deduction — 5% + £0.70 via the shared commerce helper. */
  protectionFee: number;
  net: number;
  releaseAt: string;
}

export interface PayoutSchedule {
  nextDate: string;
  nextAmount: number;
  method: string;
  pendingTotal: number;
  lifetimeSales: number;
  /** Wallet available balance — mirrors the shared WALLET_BALANCE fixture. */
  available: number;
}

export interface MonthlyTotal {
  label: string;
  revenue: number;
  orders: number;
}

export interface SellerTodo {
  id: string;
  kind: 'dispatch' | 'offers' | 'inventory';
  title: string;
  meta: string;
  href: string;
  count: number;
  tone: 'danger' | 'warning' | 'neutral';
}

// ============================================================================
// TIME HELPERS
// ============================================================================

const DAY_MS = 86_400_000;

const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgoIso = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();
const daysFromNowIso = (d: number) => new Date(Date.now() + d * DAY_MS).toISOString();

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
export { round2 };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 90-DAY DAILY SERIES
// ============================================================================

const SERIES_DAYS = 90;

function buildDailySeries(): SellerDailyPoint[] {
  const rand = mulberry32(20260926);
  const points: SellerDailyPoint[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY_MS);
    const dow = date.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const trend = 1 + ((SERIES_DAYS - i) / SERIES_DAYS) * 0.55;
    const spike = i === 61 || i === 22 ? 2.4 : 1;
    const views = Math.round((150 + rand() * 110) * (weekend ? 1.3 : 1) * trend * spike);
    const orders = spike > 1 ? 3 : rand() > (weekend ? 0.68 : 0.78) ? 1 : 0;
    const revenue = round2(orders * (24 + rand() * 42));
    const likes = Math.max(0, Math.round(orders * 2.4 + rand() * 3));
    points.push({ date: date.toISOString().slice(0, 10), revenue, orders, views, likes });
  }
  return points;
}

let seriesCache: SellerDailyPoint[] | null = null;

/** The full 90-day series; generated once per session, stable afterwards. */
export function sellerDailySeries(): SellerDailyPoint[] {
  if (!seriesCache) seriesCache = buildDailySeries();
  return seriesCache;
}

/** Period slice, oldest → newest, plus the matching previous window. */
export function seriesForPeriod(period: SellerPeriod): {
  current: SellerDailyPoint[];
  previous: SellerDailyPoint[];
} {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const all = sellerDailySeries();
  return {
    current: all.slice(-days),
    previous: all.slice(-days * 2, -days),
  };
}

// ============================================================================
// LISTING PERFORMANCE
// ============================================================================

/**
 * The seller's sold archive — pieces that already cleared. These live here
 * rather than in fixtures.ts so the shared closet contract stays untouched.
 */
interface ArchiveSale {
  id: string;
  title: string;
  brand: string | null;
  size: string | null;
  price: number;
  image: string;
  likes: number;
  views: number;
  createdAt: string;
  soldAt: string;
}

const ARCHIVE_SALES: ArchiveSale[] = [
  {
    id: 'ml4',
    title: 'Cropped Wool Blazer',
    brand: 'Cos',
    size: 'UK10',
    price: 48,
    image: img('photo-1591047139829-d91aecb6caea'),
    likes: 31,
    views: 214,
    createdAt: '2026-08-02T10:00:00Z',
    soldAt: '2026-09-06T14:00:00Z',
  },
  {
    id: 'ml5',
    title: "501 '93 Straight Jeans",
    brand: "Levi's",
    size: 'W30 L32',
    price: 58,
    image: img('photo-1541099649105-f69ad21f3246'),
    likes: 44,
    views: 342,
    createdAt: '2026-07-18T10:00:00Z',
    soldAt: '2026-08-30T11:20:00Z',
  },
  {
    id: 'ml6',
    title: 'Silk Twill Scarf',
    brand: 'Burberry',
    size: null,
    price: 42,
    image: img('photo-1601924994987-69e26d50dc26'),
    likes: 19,
    views: 168,
    createdAt: '2026-08-12T10:00:00Z',
    soldAt: '2026-09-14T09:00:00Z',
  },
  {
    id: 'ml7',
    title: 'Chunky Knit Cardigan',
    brand: '& Other Stories',
    size: 'S',
    price: 26,
    image: img('photo-1576871337622-98d48d1cf531'),
    likes: 9,
    views: 121,
    createdAt: '2026-08-24T10:00:00Z',
    soldAt: '2026-09-19T17:30:00Z',
  },
];

const ageInDays = (iso: string | undefined) =>
  iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY_MS)) : 0;

/**
 * Performance rows for every listing the seller owns — the live closet from
 * the shared fixtures plus the sold archive, oldest listing first.
 * Views/likes scale with the selected period; conversion is lifetime.
 */
export function sellerPerformanceRows(period: SellerPeriod): ListingPerformanceRow[] {
  const scale = period === '7d' ? 0.24 : period === '90d' ? 2.6 : 1;
  const active: ListingPerformanceRow[] = MY_LISTINGS.filter(
    (l) => l.status !== 'sold' && !l.isSold,
  ).map((l) => {
    const lifetimeViews = l.views ?? Math.round(l.likes * 9.5 + 40);
    const views = Math.max(1, Math.round(lifetimeViews * scale));
    const watchers = Math.max(1, Math.round(l.likes * 0.4));
    return {
      listing: l,
      views,
      likes: Math.round(l.likes * scale),
      watchers,
      conversion: round1((watchers / views) * 100),
      ageDays: ageInDays(l.createdAt),
    };
  });
  const sold: ListingPerformanceRow[] = ARCHIVE_SALES.map((s) => ({
    listing: {
      id: s.id,
      title: s.title,
      brand: s.brand,
      size: s.size,
      condition: 'Good',
      price: s.price,
      images: [s.image],
      likes: s.likes,
      views: s.views,
      isSold: true,
      status: 'sold',
      sellerId: 'me',
      category: 'women',
      description: 'Sold piece from seller history.',
      createdAt: s.createdAt,
    } satisfies Listing,
    views: s.views,
    likes: s.likes,
    watchers: 0,
    conversion: round1((s.likes / Math.max(1, s.views)) * 100),
    ageDays: ageInDays(s.createdAt),
  }));
  return [...active, ...sold].sort((a, b) => b.ageDays - a.ageDays);
}

// ============================================================================
// FULFILMENT QUEUE
// ============================================================================

const coverFor = (listingId: string) =>
  MY_LISTINGS.find((l) => l.id === listingId)?.images[0] ?? '';

/**
 * The dispatch queue. ml1/ml2 carry open orders — the listing stays live
 * until posted, which is how the marketplace behaves. fq-1 is deliberately
 * past its deadline so the hub has a truthful overdue accent.
 */
export const FULFILMENT_QUEUE: FulfilmentJob[] = [
  {
    id: 'fq-1',
    listingId: 'ml1',
    title: 'Oversized Denim Shirt',
    thumb: coverFor('ml1'),
    buyer: { name: 'lucygibson94', avatar: USERS[3]!.avatar },
    paid: 28,
    service: 'Tracked 48',
    stage: 'to-post',
    orderedAt: hoursAgoIso(30),
    shipBy: hoursAgoIso(20),
  },
  {
    id: 'fq-2',
    listingId: 'ml2',
    title: 'Pleated Trousers',
    thumb: coverFor('ml2'),
    buyer: { name: 'scott_art', avatar: USERS[1]!.avatar },
    paid: 35,
    service: 'Tracked 48',
    stage: 'to-post',
    orderedAt: hoursAgoIso(7),
    shipBy: daysFromNowIso(2),
  },
  {
    id: 'fq-3',
    listingId: 'ml4',
    title: 'Cropped Wool Blazer',
    thumb: coverFor('ml4'),
    buyer: { name: 'archive.thread', avatar: USERS[4]!.avatar },
    paid: 48,
    service: 'Tracked 48',
    stage: 'posted',
    orderedAt: hoursAgoIso(70),
    shipBy: daysFromNowIso(1),
    postedAt: hoursAgoIso(26),
    trackingNumber: 'RM487712903GB',
  },
  {
    id: 'fq-4',
    listingId: 'ml6',
    title: 'Silk Twill Scarf',
    thumb: coverFor('ml6'),
    buyer: { name: 'mariefullery', avatar: USERS[0]!.avatar },
    paid: 42,
    service: 'Tracked 48',
    stage: 'delivered',
    orderedAt: daysAgoIso(9),
    shipBy: daysAgoIso(7),
    postedAt: daysAgoIso(8),
    trackingNumber: 'RM487604415GB',
    deliveredAt: daysAgoIso(5),
  },
  {
    id: 'fq-5',
    listingId: 'ml3',
    // Mirrors ord-1021 in the shared ORDERS fixture — one truth per order.
    title: 'Graphic Print Tee',
    thumb: coverFor('ml3'),
    buyer: { name: 'lucygibson94', avatar: USERS[3]!.avatar },
    paid: 32,
    service: 'Evri Standard',
    stage: 'delivered',
    orderedAt: '2026-08-28T09:00:00Z',
    shipBy: '2026-08-30T09:00:00Z',
    postedAt: '2026-08-29T10:00:00Z',
    trackingNumber: 'EVR220814926GB',
    deliveredAt: '2026-09-01T16:40:00Z',
  },
];

/** Fixture-mode dispatch — flips a job to posted with a generated tracking
 *  number, the same session-local truth pattern as recordOrder(). */
export function markJobPosted(jobId: string): FulfilmentJob | null {
  const job = FULFILMENT_QUEUE.find((j) => j.id === jobId);
  if (!job || job.stage !== 'to-post') return null;
  job.stage = 'posted';
  job.postedAt = new Date().toISOString();
  job.trackingNumber = `RM48${Math.floor(100_000_000 + Math.random() * 899_999_999)}GB`;
  return job;
}

// ============================================================================
// PAYOUTS
// ============================================================================

const CLEARANCE_DAYS = 2;

const priceOf = (listingId: string) =>
  MY_LISTINGS.find((l) => l.id === listingId)?.price ?? 0;

const feeFor = (listingId: string) => {
  const listing = MY_LISTINGS.find((l) => l.id === listingId);
  return listing ? protectionFeeFor(listing) : 0;
};

/**
 * Escrow ledger for proceeds not yet paid out — one row per open or
 * recently-delivered order, net of the buyer-protection deduction.
 */
export function payoutEntries(): PayoutEntry[] {
  return FULFILMENT_QUEUE.filter((j) => j.stage !== 'delivered')
    .map((job) => {
      const itemPrice = priceOf(job.listingId);
      const fee = round2(protectionFeeFor({ price: itemPrice }));
      const anchor = job.postedAt ?? job.orderedAt;
      return {
        id: `po-${job.id}`,
        orderId: job.id,
        title: job.title,
        soldAt: anchor,
        itemPrice,
        protectionFee: fee,
        net: round2(itemPrice - fee),
        releaseAt: new Date(Date.parse(anchor) + CLEARANCE_DAYS * DAY_MS).toISOString(),
      };
    })
    .sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt));
}

/** Next payout: the first Tuesday on or after the earliest clearance date. */
export function payoutSchedule(): PayoutSchedule {
  const entries = payoutEntries();
  const earliest = entries.reduce<string | null>(
    (acc, e) => (!acc || Date.parse(e.releaseAt) < Date.parse(acc) ? e.releaseAt : acc),
    null,
  );
  const nextDate = earliest ?? daysFromNowIso(3);
  const nextAmount = round2(
    entries
      .filter((e) => Date.parse(e.releaseAt) <= Date.parse(nextDate))
      .reduce((s, e) => s + e.net, 0),
  );
  const lifetimeSales = round2(
    FULFILMENT_QUEUE.filter((j) => j.stage === 'delivered').reduce(
      (s, j) => s + priceOf(j.listingId) - feeFor(j.listingId),
      0,
    ),
  );
  return {
    nextDate,
    nextAmount,
    method: 'Bank account •••• 4521',
    pendingTotal: round2(entries.reduce((s, e) => s + e.net, 0)),
    lifetimeSales,
    available: WALLET_BALANCE.available,
  };
}

/** Rolling monthly totals from the daily series, oldest first. */
export function monthlyTotals(): MonthlyTotal[] {
  const buckets = new Map<string, { revenue: number; orders: number }>();
  for (const p of sellerDailySeries()) {
    const label = new Date(p.date + 'T00:00:00Z').toLocaleDateString('en-GB', {
      month: 'long',
      timeZone: 'UTC',
    });
    const bucket = buckets.get(label) ?? { revenue: 0, orders: 0 };
    bucket.revenue += p.revenue;
    bucket.orders += p.orders;
    buckets.set(label, bucket);
  }
  return [...buckets.entries()].map(([label, b]) => ({ label, ...b }));
}

// ============================================================================
// TO-DO RADAR
// ============================================================================

/**
 * One unified operational radar — dispatch deadlines, open offers and
 * inventory notes in a single list, counts derived from the fixtures above.
 */
export function sellerTodos(): SellerTodo[] {
  const toPost = FULFILMENT_QUEUE.filter((j) => j.stage === 'to-post');
  const overdue = toPost.filter((j) => Date.parse(j.shipBy) < Date.now()).length;
  const openOffers = OFFERS.filter((o) => o.sellerId === 'me' && o.status === 'pending');
  const slowMovers = sellerPerformanceRows('30d').filter(
    (r) => r.listing.status !== 'sold' && r.views < 30,
  );

  const radar: SellerTodo[] = [];
  if (toPost.length > 0) {
    radar.push({
      id: 'todo-dispatch',
      kind: 'dispatch',
      title:
        overdue > 0
          ? `${overdue} order${overdue === 1 ? '' : 's'} past dispatch deadline`
          : `${toPost.length} order${toPost.length === 1 ? '' : 's'} to post`,
      meta: 'Tracked 48 · post within 2 days of sale',
      href: '/seller-hub/fulfilment',
      count: toPost.length,
      tone: overdue > 0 ? 'danger' : 'warning',
    });
  }
  if (openOffers.length > 0) {
    radar.push({
      id: 'todo-offers',
      kind: 'offers',
      title: `${openOffers.length} offer${openOffers.length === 1 ? '' : 's'} waiting on you`,
      meta: 'Offers expire in 48h — respond to keep the buyer warm',
      href: '/offers',
      count: openOffers.length,
      tone: 'warning',
    });
  }
  if (slowMovers.length > 0) {
    radar.push({
      id: 'todo-inventory',
      kind: 'inventory',
      title: `${slowMovers.length} listing${slowMovers.length === 1 ? '' : 's'} getting few views`,
      meta: 'Refresh photos or adjust price to regain velocity',
      href: '/seller-hub#performance',
      count: slowMovers.length,
      tone: 'neutral',
    });
  }
  return radar;
}
