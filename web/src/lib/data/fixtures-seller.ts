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

import {
  CURRENT_USER,
  LISTINGS,
  MY_DRAFT_LISTINGS,
  MY_LISTINGS,
  USERS,
  WALLET_BALANCE,
} from '@/lib/data/fixtures';
import {
  OFFERS,
  allCommerceOrders,
  markOrderDispatched,
  proposeDispatchExtension as proposeOrderDispatchExtension,
  protectionFeeFor,
  recordOrderHandoff,
} from '@/lib/data/fixtures-commerce';
import { DISPATCH_SLA_DAYS } from '@/lib/commerce/dispatch';
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
  /** True when the number is a demo estimate rather than a measured count —
   *  the UI labels it instead of presenting it as live telemetry. */
  estimated?: boolean;
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
  /**
   * A dispatch extension the seller proposed that is still awaiting the
   * buyer. Only ever set from a server-confirmed proposal (live overlay)
   * or the fixture mutation — the orders-list wire doesn't project
   * pending extensions, so the queue never invents this state.
   * `proposedShipBy` is null when the proposal was confirmed only via a
   * 409 EXTENSION_PENDING (the server withholds the date on a conflict).
   */
  pendingExtension?: { days: number; proposedShipBy: string | null } | null;
  /**
   * Seller's drop-off claim instant — the handoff_asserted parcel event.
   * A claim, not carrier evidence: the job stays 'to-post' (and the order
   * stays 'paid') until a carrier scan or the dispatch write moves it.
   * Live mode surfaces it via the HANDOFF_ASSERTED overlay below — the
   * orders-list wire never projects it, so the row only knows what the
   * session confirmed.
   */
  handoffAssertedAt?: string;
}

export interface PayoutEntry {
  id: string;
  orderId: string;
  title: string;
  soldAt: string;
  itemPrice: number;
  /** Buyer-protection deduction — 5% + £0.70 via the shared commerce helper.
   *  Null when the live order contract doesn't expose the fee split —
   *  the renderer says so rather than printing an invented £0.00. */
  protectionFee: number | null;
  net: number | null;
  releaseAt: string;
}

export interface PayoutSchedule {
  /** Server-provided payout timing — null when no payout is scheduled. */
  nextDate: string | null;
  nextAmount: number | null;
  method: string | null;
  /** True when `method` is fixture-authored, not a real payout account —
   *  the UI must label it demo rather than present it as a real bank. */
  methodIsDemo?: boolean;
  pendingTotal: number;
  /** Lifetime sales — null when the live API does not expose it. */
  lifetimeSales: number | null;
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
  /** Closet category the sold piece belonged to — feeds the Listing row. */
  category: Listing['category'];
  likes: number;
  views: number;
  createdAt: string;
  soldAt: string;
}

const ARCHIVE_SALES: ArchiveSale[] = [
  {
    id: 'ml4',
    title: 'Field Jacket',
    brand: 'Cos',
    size: 'M',
    price: 48,
    image: img('photo-1591047139829-d91aecb6caea'),
    category: 'men',
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
    category: 'men',
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
    category: 'women',
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
    category: 'women',
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
      category: s.category,
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

/**
 * Resolve a queue listing id against every seller-owned collection —
 * active rows live in MY_LISTINGS, sold/archived rows in ARCHIVE_SALES.
 * Joining only the live closet produced blank covers and £0 payout math
 * for the posted/delivered archive jobs.
 */
function saleRecordFor(
  listingId: string,
): { price: number; image: string; priceWithProtection?: number } | null {
  const active = MY_LISTINGS.find((l) => l.id === listingId);
  if (active) {
    return {
      price: active.price,
      image: active.images[0] ?? '',
      priceWithProtection: active.priceWithProtection,
    };
  }
  const sold = ARCHIVE_SALES.find((s) => s.id === listingId);
  if (sold) return { price: sold.price, image: sold.image };
  return null;
}

const coverFor = (listingId: string) => saleRecordFor(listingId)?.image ?? '';

/**
 * The dispatch queue. ml1/ml2 carry open orders — the listing stays live
 * until posted, which is how the marketplace behaves. fq-1 is deliberately
 * past its deadline so the hub has a truthful overdue accent.
 */
export const FULFILMENT_QUEUE: FulfilmentJob[] = [
  {
    id: 'fq-1',
    listingId: 'ml1',
    title: 'Oversized Cotton Shirt',
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
    title: 'Straight Leg Jeans',
    thumb: coverFor('ml2'),
    buyer: { name: 'scott_art', avatar: USERS[1]!.avatar },
    paid: 35,
    service: 'Tracked 48',
    stage: 'to-post',
    orderedAt: hoursAgoIso(7),
    shipBy: daysFromNowIso(DISPATCH_SLA_DAYS),
  },
  {
    id: 'fq-3',
    listingId: 'ml4',
    title: 'Field Jacket',
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
    title: 'Organic Cotton Tee — White',
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

/** Carrier-flavoured tracking numbers — Royal Mail for Tracked 48, Evri
 *  for the Evri service (the queue's only two carriers). */
function generateTrackingNumber(service: string): string {
  const digits = Math.floor(100_000_000 + Math.random() * 899_999_999);
  return service.toLowerCase().startsWith('evri')
    ? `EVR${digits}GB`
    : `RM48${digits}GB`;
}

export interface ShippingLabel {
  jobId: string;
  orderRef: string;
  service: string;
  trackingNumber: string;
  itemTitle: string;
  paid: number;
  buyerName: string;
  sellerName: string;
  shipBy: string;
}

/**
 * Fixture-mode label generation — the print surface reads this. Mints the
 * job's tracking number once (the same reference "Mark posted" keeps), so
 * the label, the queue and the posted row stay one truth.
 */
export function shippingLabelFor(jobId: string): ShippingLabel | null {
  const job = FULFILMENT_QUEUE.find((j) => j.id === jobId);
  if (!job) return null;
  if (!job.trackingNumber) job.trackingNumber = generateTrackingNumber(job.service);
  return {
    jobId: job.id,
    orderRef: job.id.toUpperCase(),
    service: job.service,
    trackingNumber: job.trackingNumber,
    itemTitle: job.title,
    paid: job.paid,
    buyerName: job.buyer.name,
    sellerName: CURRENT_USER.username,
    shipBy: job.shipBy,
  };
}

/** Fixture-mode dispatch — flips a job to posted with a generated tracking
 *  number, the same session-local truth pattern as recordOrder(). A
 *  seller-entered reference (DispatchSheet) or a number already minted by
 *  "Print label" is kept, not regenerated. */
export function markJobPosted(jobId: string, trackingNumber?: string): FulfilmentJob | null {
  const job = FULFILMENT_QUEUE.find((j) => j.id === jobId);
  if (!job || job.stage !== 'to-post') return null;
  job.stage = 'posted';
  job.postedAt = new Date().toISOString();
  job.trackingNumber = trackingNumber ?? job.trackingNumber ?? generateTrackingNumber(job.service);
  // Dispatch ends the SLA window — a pending extension is stale from here.
  job.pendingExtension = null;
  dropPendingExtension(jobId);
  // The fulfilment queue and the buyer-visible order are one truth — a paid
  // commerce order for the same listing flips to shipped with the same
  // tracking reference.
  const order = allCommerceOrders().find(
    (o) =>
      o.sellerId === 'me' &&
      o.listingId === job.listingId &&
      ['created', 'pending', 'paid'].includes(o.status),
  );
  if (order) markOrderDispatched(order.id, job.trackingNumber);
  return job;
}

// ── Dispatch extensions ───────────────────────────────────────────────────
//
// The orders-list wire doesn't project a pending extension (only the
// detail read carries `dispatchExtension`), so live mode keeps the
// proposals the server confirmed — a 201, or a 409 EXTENSION_PENDING that
// proved one already exists — in this session overlay. The queue merges it
// so the row shows the awaiting-buyer state instead of offering a second
// proposal that could only 409. Cleared when the job leaves 'to-post'
// (pending extensions are only legal while the order is paid); the order
// detail read stays authoritative for the seller's buyer-facing view.
const PENDING_EXTENSIONS = new Map<
  string,
  { days: number; proposedShipBy: string | null }
>();

/** Pin a server-confirmed pending extension onto a queue job (live mode). */
export function recordPendingExtension(
  orderId: string,
  ext: { days: number; proposedShipBy: string | null },
): void {
  PENDING_EXTENSIONS.set(orderId, ext);
}

export function pendingExtensionFor(
  orderId: string,
): { days: number; proposedShipBy: string | null } | null {
  return PENDING_EXTENSIONS.get(orderId) ?? null;
}

export function dropPendingExtension(orderId: string): void {
  PENDING_EXTENSIONS.delete(orderId);
}

/**
 * Fixture-mode extension proposal — mirrors the server gate (to-post only,
 * one pending at a time) and writes the job's pendingExtension. The paired
 * commerce order takes the same pending extension so the order detail
 * surface stays one truth, the same pairing markJobPosted uses.
 */
export function proposeJobExtension(jobId: string, days: number): FulfilmentJob | null {
  const job = FULFILMENT_QUEUE.find((j) => j.id === jobId);
  if (!job || job.stage !== 'to-post' || job.pendingExtension) return null;
  const base = Number.isNaN(Date.parse(job.shipBy)) ? Date.now() : Date.parse(job.shipBy);
  job.pendingExtension = {
    days,
    proposedShipBy: new Date(base + days * DAY_MS).toISOString(),
  };
  const order = allCommerceOrders().find(
    (o) => o.sellerId === 'me' && o.listingId === job.listingId && o.status === 'paid',
  );
  if (order) proposeOrderDispatchExtension(order.id, days);
  return job;
}

// ── Handoff assertions ────────────────────────────────────────────────────
//
// POST /orders/:id/fulfilment/handoff-assertion records the seller's
// drop-off claim as an `handoff_asserted` parcel event while no carrier
// scan has landed — it never advances orders.status. The orders-list wire
// doesn't project the event, so live mode keeps the confirmed claim in a
// session overlay (same pattern as PENDING_EXTENSIONS); the parcel-events
// read on the order detail is the durable surface it lands on.
const HANDOFF_ASSERTED = new Map<string, string>();

/** Pin a server-confirmed handoff claim onto a queue job (live mode). */
export function recordHandoffAssertion(orderId: string, claimedAt: string): void {
  HANDOFF_ASSERTED.set(orderId, claimedAt);
}

export function handoffAssertedFor(orderId: string): string | null {
  return HANDOFF_ASSERTED.get(orderId) ?? null;
}

/**
 * Fixture-mode handoff claim — mirrors the live gate (only while the job
 * still owes posting) and writes the stamp onto the row. The paired
 * commerce order gets the same 'Dropped off (seller reported)' event on
 * its tracking trail, the same one-truth pairing markJobPosted uses.
 */
export function assertJobHandoff(jobId: string): FulfilmentJob | null {
  const job = FULFILMENT_QUEUE.find((j) => j.id === jobId);
  if (!job || job.stage !== 'to-post' || job.handoffAssertedAt) return null;
  job.handoffAssertedAt = new Date().toISOString();
  const order = allCommerceOrders().find(
    (o) =>
      o.sellerId === 'me' &&
      o.listingId === job.listingId &&
      ['created', 'pending', 'paid'].includes(o.status),
  );
  if (order) recordOrderHandoff(order.id);
  return job;
}

// ============================================================================
// PAYOUTS
// ============================================================================

const CLEARANCE_DAYS = 2;

const priceOf = (listingId: string) => saleRecordFor(listingId)?.price ?? 0;

const feeFor = (listingId: string) => {
  const record = saleRecordFor(listingId);
  return record ? protectionFeeFor(record) : 0;
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

/**
 * Next payout: proceeds land the day their clearance window ends, so the
 * scheduled date is the earliest pending release. When nothing is in
 * clearance there is no payout to schedule — null, not an invented date,
 * so the page can render its honest "nothing scheduled" state.
 */
export function payoutSchedule(): PayoutSchedule {
  const entries = payoutEntries();
  const earliest = entries.reduce<string | null>(
    (acc, e) => (!acc || Date.parse(e.releaseAt) < Date.parse(acc) ? e.releaseAt : acc),
    null,
  );
  const nextDate = earliest;
  const nextAmount =
    nextDate === null
      ? null
      : round2(
          entries
            .filter((e) => Date.parse(e.releaseAt) <= Date.parse(nextDate))
            .reduce((s, e) => s + (e.net ?? 0), 0),
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
    // Fixture-authored destination — marked so every surface that prints
    // it also discloses it; no real payout account exists in demo mode.
    method: 'Bank account •••• 4521',
    methodIsDemo: true,
    pendingTotal: round2(entries.reduce((s, e) => s + (e.net ?? 0), 0)),
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
      meta: `Tracked 48 · post within ${DISPATCH_SLA_DAYS} days of sale`,
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

// ============================================================================
// SELLER DRAFTS — composer ↔ hub reconciliation
// ============================================================================

/**
 * MY_DRAFT_LISTINGS (fixtures.ts) is the hub's draft shelf — the
 * management table reads it and the sell composer hydrates from it via
 * /sell?draft=<id>. These are its only mutation paths, the same
 * session-local write pattern as updateListing() on MY_LISTINGS. The
 * composer upserts on every autosave and removes on publish/discard, so
 * a draft authored on either surface resumes on the other.
 */
export function sellerDraftById(id: string): Listing | undefined {
  return MY_DRAFT_LISTINGS.find((l) => l.id === id);
}

export function upsertSellerDraft(listing: Listing): void {
  const index = MY_DRAFT_LISTINGS.findIndex((l) => l.id === listing.id);
  if (index >= 0) MY_DRAFT_LISTINGS[index] = listing;
  else MY_DRAFT_LISTINGS.unshift(listing);
}

export function removeSellerDraft(id: string): void {
  const index = MY_DRAFT_LISTINGS.findIndex((l) => l.id === id);
  if (index >= 0) MY_DRAFT_LISTINGS.splice(index, 1);
}

// ============================================================================
// BULK LISTING MUTATIONS — fixture-side of POST /seller-hub/batch-command
// ============================================================================

/**
 * Per-item receipt — the same vocabulary the live batch-command endpoint
 * returns, so the UI reports fixture and live results identically.
 */
export interface BulkItemReceipt {
  listingId: string;
  state: 'applied' | 'rejected';
  reason?: string;
  newStatus?: string;
}

/**
 * Fixture-mode pause — 'paused' is a real Listing.status; a paused row
 * stays owned, stops being buyable (capabilities.ts) and resumes cleanly.
 * Only active listings can pause.
 */
export function pauseFixtureListing(id: string): BulkItemReceipt {
  const listing = MY_LISTINGS.find((l) => l.id === id);
  if (!listing) return { listingId: id, state: 'rejected', reason: 'not_found' };
  if (listing.status !== 'active' || listing.isSold)
    return {
      listingId: id,
      state: 'rejected',
      reason: listing.isSold || listing.status === 'sold' ? 'already_sold' : 'not_active',
    };
  listing.status = 'paused';
  return { listingId: id, state: 'applied', newStatus: 'paused' };
}

/** Fixture-mode resume — paused → active. */
export function resumeFixtureListing(id: string): BulkItemReceipt {
  const listing = MY_LISTINGS.find((l) => l.id === id);
  if (!listing) return { listingId: id, state: 'rejected', reason: 'not_found' };
  if (listing.status !== 'paused')
    return { listingId: id, state: 'rejected', reason: 'not_paused' };
  listing.status = 'active';
  return { listingId: id, state: 'applied', newStatus: 'active' };
}

/**
 * Fixture-mode delete — the row leaves MY_LISTINGS entirely (mirrors the
 * backend's 'deleted' end-state: gone from management and discovery).
 * Sold listings carry order history and stay — rejected, not removed.
 */
export function deleteFixtureListing(id: string): BulkItemReceipt {
  const listing = MY_LISTINGS.find((l) => l.id === id);
  if (!listing) return { listingId: id, state: 'rejected', reason: 'not_found' };
  if (listing.isSold || listing.status === 'sold')
    return { listingId: id, state: 'rejected', reason: 'sold_kept_for_order_history' };
  const index = MY_LISTINGS.findIndex((l) => l.id === id);
  MY_LISTINGS.splice(index, 1);
  return { listingId: id, state: 'applied', newStatus: 'deleted' };
}

// ============================================================================
// AWAY MODE — seller-declared shop pause
// ============================================================================

/**
 * The seller's away state. Mirrors the mobile accountPreferences slice and
 * the live `/users/me/preferences` contract: holidayMode + an optional
 * return date and buyer-facing note. Turning it off always clears the
 * stored date — a stale "until" can never resurrect an away state.
 */
export interface SellerAwayState {
  holidayMode: boolean;
  holidayModeUntil: string | null;
  awayMessage: string | null;
}

const AWAY_STORAGE_KEY = 'thryftverse.web.seller-away';

export function loadSellerAwayState(): SellerAwayState {
  const empty: SellerAwayState = { holidayMode: false, holidayModeUntil: null, awayMessage: null };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(AWAY_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SellerAwayState>;
    return {
      holidayMode: parsed.holidayMode === true,
      holidayModeUntil:
        typeof parsed.holidayModeUntil === 'string' ? parsed.holidayModeUntil : null,
      awayMessage: typeof parsed.awayMessage === 'string' ? parsed.awayMessage : null,
    };
  } catch {
    return empty;
  }
}

/**
 * Fixture-mode write — persists the away state on this device AND projects
 * it onto the fixture listings' seller record, so the buyer-side gate
 * (capabilities.ts → `seller.holidayMode`) reads the same truth and buy
 * buttons genuinely pause across the demo closet.
 */
export function saveSellerAwayState(next: SellerAwayState): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AWAY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — the in-memory projection still applies */
    }
  }
  applyAwayStateToFixtures(next);
}

/** Project the away flag onto every seller-owned fixture listing — the
 *  commerce capability gate reads `listing.seller?.holidayMode`. */
export function applyAwayStateToFixtures(state: SellerAwayState): void {
  const away = state.holidayMode === true;
  for (const l of [...LISTINGS, ...MY_LISTINGS, ...MY_DRAFT_LISTINGS]) {
    if (l.sellerId === 'me' && l.seller) {
      l.seller.holidayMode = away ? true : undefined;
    }
  }
}

// ============================================================================
// STOREFRONT — the seller-authored shop front (demo-local draft)
// ============================================================================

/**
 * The member's storefront editor state. Mirrors the live /storefronts/me
 * contract (status + announcement + the three-policy bag). Featured pins
 * are NOT stored here — they ride the shopRailPins overlay
 * (components/profile/shopRailData) so the editor and the profile rail
 * read the same truth. Persisted on-device only; the fixture profile
 * aggregate carries no storefront block, so demo edits never pretend to
 * be published anywhere else.
 */
export interface SellerStorefrontFixture {
  status: 'draft' | 'published' | 'paused';
  announcement: string | null;
  policies: {
    shipping: string | null;
    returns: string | null;
    additional: string | null;
  };
  /** Demo publication instant — shown in the editor's status line. */
  publishedAt: string | null;
}

const STOREFRONT_STORAGE_KEY = 'thryftverse.web.seller-storefront';

const EMPTY_STOREFRONT_FIXTURE: SellerStorefrontFixture = {
  status: 'draft',
  announcement: null,
  policies: { shipping: null, returns: null, additional: null },
  publishedAt: null,
};

export function loadSellerStorefront(): SellerStorefrontFixture {
  if (typeof window === 'undefined') return EMPTY_STOREFRONT_FIXTURE;
  try {
    const raw = window.localStorage.getItem(STOREFRONT_STORAGE_KEY);
    if (!raw) return EMPTY_STOREFRONT_FIXTURE;
    const parsed = JSON.parse(raw) as Partial<SellerStorefrontFixture>;
    const policies: Partial<SellerStorefrontFixture['policies']> =
      parsed.policies && typeof parsed.policies === 'object' ? parsed.policies : {};
    const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
    return {
      status:
        parsed.status === 'published' || parsed.status === 'paused'
          ? parsed.status
          : 'draft',
      announcement: pick(parsed.announcement),
      policies: {
        shipping: pick(policies.shipping),
        returns: pick(policies.returns),
        additional: pick(policies.additional),
      },
      publishedAt:
        typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
    };
  } catch {
    return EMPTY_STOREFRONT_FIXTURE;
  }
}

export function saveSellerStorefront(next: SellerStorefrontFixture): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STOREFRONT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the session copy still applies */
  }
}

// ============================================================================
// PROMOTIONS — session-local "Sponsored" management store
// ============================================================================

/**
 * Fixture-mode mirror of the live /seller/promotions surface (flat-fee
 * Sponsored placement). Rows created here are session-local: no spend is
 * debited, no placement is delivered — `demo` marks every row so the UI
 * discloses it, and impressions/clicks stay at their honest zero rather
 * than a manufactured engagement curve.
 */
export interface SellerPromotionFixture {
  id: string;
  listingId: string;
  status: 'active' | 'paused' | 'ended';
  dailyBudgetGbp: number;
  durationDays: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  /** Always true — the manage surface renders the demo disclosure. */
  demo: true;
}

const SELLER_PROMOTIONS: SellerPromotionFixture[] = [];

export function sellerPromotions(): SellerPromotionFixture[] {
  // Retire rows whose window has passed — same truth rule as the backend,
  // which ends a promotion at ends_at rather than leaving it 'active'.
  const now = Date.now();
  for (const p of SELLER_PROMOTIONS) {
    if (p.status !== 'ended' && Date.parse(p.endsAt) <= now) p.status = 'ended';
  }
  return [...SELLER_PROMOTIONS].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function createSellerPromotion(input: {
  listingId: string;
  dailyBudgetGbp: number;
  durationDays: 7 | 14 | 30;
}): SellerPromotionFixture | null {
  const listing = MY_LISTINGS.find((l) => l.id === input.listingId);
  if (!listing || listing.status !== 'active' || listing.isSold) return null;
  if (
    SELLER_PROMOTIONS.some(
      (p) => p.listingId === input.listingId && p.status !== 'ended',
    )
  )
    return null;
  const now = Date.now();
  const row: SellerPromotionFixture = {
    id: `promo-local-${now.toString(36)}`,
    listingId: input.listingId,
    status: 'active',
    dailyBudgetGbp: round2(input.dailyBudgetGbp),
    durationDays: input.durationDays,
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + input.durationDays * DAY_MS).toISOString(),
    createdAt: new Date(now).toISOString(),
    demo: true,
  };
  SELLER_PROMOTIONS.unshift(row);
  listing.promoted = true;
  return row;
}

export function setSellerPromotionStatus(
  id: string,
  action: 'pause' | 'resume' | 'end',
): SellerPromotionFixture | null {
  const row = SELLER_PROMOTIONS.find((p) => p.id === id);
  if (!row) return null;
  if (action === 'pause' && row.status === 'active') row.status = 'paused';
  if (action === 'resume' && row.status === 'paused') {
    // A resumable window is an honest one — ended promotions stay ended.
    if (Date.parse(row.endsAt) <= Date.now()) row.status = 'ended';
    else row.status = 'active';
  }
  if (action === 'end' && row.status !== 'ended') row.status = 'ended';
  const listing = MY_LISTINGS.find((l) => l.id === row.listingId);
  if (listing) {
    listing.promoted = SELLER_PROMOTIONS.some(
      (p) => p.listingId === row.listingId && p.status === 'active',
    );
  }
  return row;
}

// ============================================================================
// OFFERS FUNNEL + SELLER STANDARDS — derived from real fixture records
// ============================================================================

/** Received offers created inside the period window — the funnel's offers
 *  stage. Real OFFERS rows, not a synthetic ratio. */
export function sellerOffersReceived(period: SellerPeriod): number {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const cutoff = Date.now() - days * DAY_MS;
  return OFFERS.filter(
    (o) => o.sellerId === 'me' && Date.parse(o.createdAt) >= cutoff,
  ).length;
}

export interface SellerStandardsFixture {
  /** Computed from the queue's real postedAt−orderedAt deltas. */
  averageShipTimeDays: number | null;
  ordersShipped: number;
  /** No cancelled orders exist in the fixture queue — 0 is the true value. */
  cancellationRate: number;
  /** Returns aren't modelled in the fixtures — null, not an invented 0. */
  returnCaseRate: null;
}

/**
 * Seller standards from fixture facts — ship time is the mean
 * ordered→posted delta across posted/delivered jobs; null when nothing
 * has shipped yet. Program tier isn't evaluated in demo mode (the live
 * /sellers/:id/standards endpoint owns it), so callers render metrics only.
 */
export function sellerStandardsFixture(): SellerStandardsFixture {
  const shipped = FULFILMENT_QUEUE.filter((j) => j.postedAt);
  const avgDays = shipped.length
    ? round1(
        shipped.reduce(
          (s, j) => s + (Date.parse(j.postedAt!) - Date.parse(j.orderedAt)) / DAY_MS,
          0,
        ) / shipped.length,
      )
    : null;
  return {
    averageShipTimeDays: avgDays,
    ordersShipped: shipped.length,
    cancellationRate: 0,
    returnCaseRate: null,
  };
}
