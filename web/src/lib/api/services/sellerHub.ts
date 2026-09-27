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

// ── Per-listing analytics (mobile commerceApi.listingAnalytics) ─────────────
// GET /sellers/:sellerId/analytics/listing/:listingId — self-scoped; every
// field is server-computed (views/saves/offers/purchases, conversion, save
// rate, intent signal, time on market, price history, sold comparables).

export interface SellerListingAnalyticsApi {
  listing: {
    id: string;
    title: string;
    priceGbpMinor: number;
    status: string;
    imageUrl: string | null;
    category: string | null;
    brand: string | null;
    condition: string | null;
    createdAt: string;
    soldAt: string | null;
  };
  views: number;
  saves: number;
  offers: number;
  likes: number;
  purchases: number;
  /** purchases/views % — null when the listing has no views in the window. */
  conversionRate: number | null;
  /** saves/views % — null when views are zero. */
  saveRate: number | null;
  intentSignal:
    | 'high_intent_price_friction'
    | 'low_affinity_photo_needed'
    | 'healthy_velocity'
    | 'stale_reach'
    | null;
  timeOnMarketDays: number;
  priceHistory: Array<{ previousPrice: number; newPrice: number; changedAt: string }>;
  comparables: {
    sampleSize: number;
    minPrice: number | null;
    medianPrice: number | null;
    maxPrice: number | null;
    dateFrom: string | null;
    dateTo: string | null;
  } | null;
}

export async function fetchSellerListingAnalytics(
  sellerId: string,
  listingId: string,
  period: '7d' | '30d' | '90d',
  signal?: AbortSignal,
): Promise<SellerListingAnalyticsApi> {
  const res = await fetchJson<{ ok: boolean; analytics: SellerListingAnalyticsApi }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics/listing/${encodeURIComponent(listingId)}?period=${period}`,
    undefined,
    { signal },
  );
  return res.analytics;
}

// ── Seller standards (mobile sellerStandardsApi.ts) ─────────────────────────
// GET /sellers/:sellerId/standards — recomputed operational metrics, program
// tier and per-criterion defects. Verbatim projection, never recomputed here.

export type SellerStandardsTier = 'standard' | 'performer' | 'top_performer';

export interface SellerStandardsMetrics {
  ordersShipped: number;
  salesVolume: number;
  averageShipTimeDays: number;
  cancellationRate: number;
  returnCaseRate: number;
}

export interface SellerStandardsDefect {
  metric: string;
  threshold: number;
  actual: number;
  gap: number;
}

export interface SellerStandards {
  metrics: SellerStandardsMetrics | null;
  tier: SellerStandardsTier;
  defects: SellerStandardsDefect[];
  appealsAvailable: boolean;
}

export async function fetchSellerStandards(
  sellerId: string,
  signal?: AbortSignal,
): Promise<SellerStandards> {
  const res = await fetchJson<{
    ok: boolean;
    metrics: SellerStandardsMetrics | null;
    tier: SellerStandardsTier;
    defects: SellerStandardsDefect[];
    appealsAvailable: boolean;
  }>(`/sellers/${encodeURIComponent(sellerId)}/standards`, undefined, { signal });
  return {
    metrics: res.metrics,
    tier: res.tier,
    defects: res.defects,
    appealsAvailable: res.appealsAvailable,
  };
}

// ── Batch command (mobile sellerHubApi.submitSellerHubBatchCommand) ─────────
// POST /seller-hub/batch-command — durable per-item receipts; a partial batch
// is a truthful result, never rolled back on the client.

export type SellerHubBatchCommand = 'pause' | 'resume' | 'delete' | 'edit';

export interface SellerHubListingEditPatch {
  title?: string;
  description?: string;
  priceGbp?: number;
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  originalPriceGbp?: number;
  shippingMethod?: string;
  shippingPayer?: string;
}

export interface SellerHubBatchItem {
  listingId: string;
  expectedVersion?: number;
  patch?: SellerHubListingEditPatch;
}

export interface SellerHubBatchResult {
  listingId: string;
  state: 'applied' | 'rejected' | 'conflict';
  newStatus?: string;
  reason?: string;
  currentStatus?: string;
  appliedFields?: string[];
}

export interface SellerHubBatchResponse {
  ok: boolean;
  batchId: string;
  idempotencyKey: string;
  state: 'complete' | 'partial';
  results: SellerHubBatchResult[];
  appliedCount: number;
  rejectedCount: number;
  conflictCount: number;
}

export async function submitSellerHubBatchCommand(
  command: SellerHubBatchCommand,
  items: SellerHubBatchItem[],
  idempotencyKey: string,
): Promise<SellerHubBatchResponse> {
  return fetchJson<SellerHubBatchResponse>('/seller-hub/batch-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ command, items, idempotencyKey }),
  });
}

// ── Promotions (mobile promotionsApi.ts — flat-fee "Sponsored" placement) ────
// The seller pays a fixed GBP/day fee debited from the payable balance once
// per active UTC day; the listing occupies labelled Sponsored slots. Stats are
// real posted spend + deduped impression/click events — never estimates.

export type PromotionStatus = 'active' | 'paused' | 'exhausted' | 'ended';
export type PromotionDurationDays = 7 | 14 | 30;

export const PROMOTION_MIN_DAILY_BUDGET_MINOR = 100;
export const PROMOTION_MAX_DAILY_BUDGET_MINOR = 50_000;
export const PROMOTION_DURATIONS_DAYS: readonly PromotionDurationDays[] = [7, 14, 30];

export interface SellerPromotion {
  id: string;
  listingId: string;
  status: PromotionStatus;
  dailyBudgetMinor: number;
  dailyBudgetGbp: number;
  spendDay: string | null;
  chargedTodayMinor: number;
  pausedReason?: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  listingTitle?: string | null;
  listingImageUrl?: string | null;
  totalSpendMinor?: number;
  totalSpendGbp?: number;
}

export interface PromotionStats {
  promotionId: string;
  status: PromotionStatus;
  totalSpendMinor: number;
  totalSpendGbp: number;
  chargedDays: number;
  lastChargeDay: string | null;
  chargedTodayMinor: number;
  impressions: number;
  clicks: number;
}

export interface CreatePromotionResult {
  ok: boolean;
  promotion: SellerPromotion;
  charge?: {
    outcome: 'charged' | 'already_charged' | 'insufficient_balance' | 'not_active';
    amountMinor: number;
  };
  replayed?: boolean;
  /** Failure payloads carry these — surfaced verbatim, never swallowed. */
  code?: string;
  error?: string;
}

export async function createListingPromotion(input: {
  listingId: string;
  dailyBudgetMinor: number;
  durationDays: PromotionDurationDays;
  idempotencyKey?: string;
}): Promise<CreatePromotionResult> {
  return fetchJson<CreatePromotionResult>('/seller/promotions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: input.listingId,
      dailyBudgetMinor: input.dailyBudgetMinor,
      durationDays: input.durationDays,
      idempotencyKey:
        input.idempotencyKey ??
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `promo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    }),
  });
}

export async function fetchSellerPromotions(
  signal?: AbortSignal,
): Promise<SellerPromotion[]> {
  const payload = await fetchJson<{ ok: boolean; promotions: SellerPromotion[] }>(
    '/seller/promotions',
    undefined,
    { signal },
  );
  return payload.promotions ?? [];
}

export interface PromotionActionResult {
  ok: boolean;
  promotion: SellerPromotion;
  charge?: { outcome: string; amountMinor: number };
  code?: string;
  error?: string;
}

export function pauseListingPromotion(promotionId: string): Promise<PromotionActionResult> {
  return fetchJson<PromotionActionResult>(
    `/seller/promotions/${encodeURIComponent(promotionId)}/pause`,
    { method: 'POST' },
  );
}

export function resumeListingPromotion(promotionId: string): Promise<PromotionActionResult> {
  return fetchJson<PromotionActionResult>(
    `/seller/promotions/${encodeURIComponent(promotionId)}/resume`,
    { method: 'POST' },
  );
}

export function endListingPromotion(promotionId: string): Promise<PromotionActionResult> {
  return fetchJson<PromotionActionResult>(
    `/seller/promotions/${encodeURIComponent(promotionId)}/end`,
    { method: 'POST' },
  );
}

export async function fetchPromotionStats(
  promotionId: string,
  signal?: AbortSignal,
): Promise<PromotionStats> {
  const payload = await fetchJson<{ ok: boolean; stats: PromotionStats }>(
    `/seller/promotions/${encodeURIComponent(promotionId)}/stats`,
    undefined,
    { signal },
  );
  return payload.stats;
}

// ── Account preferences (mobile accountApi.ts) ───────────────────────────────
// GET/PATCH /users/me/preferences — the real user-settings endpoint. The
// seller-hub shop settings surface uses it for holiday/away mode; the backend
// rejects past return dates and clears stored away fields when holiday mode
// turns off.

export interface AccountPreferences {
  holidayMode: boolean;
  holidayModeUntil: string | null;
  /** Seller-authored note shown to buyers while away; null clears it. */
  awayMessage: string | null;
  privateProfile: boolean;
}

export interface UpdateAccountPreferencesInput {
  holidayMode?: boolean;
  /** ISO-8601 future instant, or null to clear. Ignored while holidayMode
   *  stays off — the store never keeps a stale "until". */
  holidayModeUntil?: string | null;
  awayMessage?: string | null;
}

export async function fetchAccountPreferences(
  signal?: AbortSignal,
): Promise<AccountPreferences> {
  const res = await fetchJson<{ ok: boolean; preferences: AccountPreferences }>(
    '/users/me/preferences',
    undefined,
    { signal },
  );
  return res.preferences;
}

export async function updateAccountPreferences(
  input: UpdateAccountPreferencesInput,
): Promise<AccountPreferences> {
  const res = await fetchJson<{ ok: boolean; preferences: AccountPreferences }>(
    '/users/me/preferences',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return res.preferences;
}
