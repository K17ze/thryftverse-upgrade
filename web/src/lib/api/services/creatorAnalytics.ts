/**
 * Web creator-analytics service — mirrors frontend/src/services/creatorAnalyticsApi.ts.
 * Verified against backend/api/src/routes/creatorAnalytics.ts (registered
 * unversioned in backend/api/src/index.ts, served under /api/v1 by the
 * version-normalization hook):
 *
 *   POST /creator/analytics/events                  → 201 { ok, eventId, deduplicated }
 *   GET  /creator/analytics/summary                 → payload directly (no { ok } envelope)
 *   GET  /creator/analytics/timeline                → { …meta, points }
 *   GET  /creator/analytics/content-ranking         → { …meta, items }
 *   GET  /creator/analytics/earnings                → ledger projection
 *   POST /creator/analytics/earnings/payout         → { ok, payoutId, amountMinor, … }
 *
 * All routes require the authenticated user (the global preHandler 401s
 * otherwise; ownership is always server-resolved from the session, never
 * a client-supplied id). engagementRate is a ratio [0,1] — the UI formats
 * it as a percent. Earnings amounts are minor units in `currency` (GBP).
 */

import { fetchJson } from '../http';

export type AnalyticsContentType = 'look' | 'poster' | 'story';

export type AnalyticsEventType =
  | 'view'
  | 'like'
  | 'save'
  | 'comment'
  | 'share'
  | 'product_click'
  | 'profile_visit';

export type AnalyticsPeriod = '7d' | '30d' | '90d';

export type Completeness = 'complete' | 'provisional' | 'delayed' | 'unavailable';

// ── Shared shapes ──────────────────────────────────────────────────────

export interface MetricValue {
  value: number;
  comparison: number;
  /** null when the comparison period was zero — never render a made-up delta. */
  changeRatio: number | null;
}

export interface DateRange {
  start: string;
  endExclusive: string;
}

export interface AnalyticsMeta {
  metricVersion: string;
  timezone: string;
  generatedAt: string;
  watermark: string;
  completeness: Completeness;
  range: DateRange;
  comparisonRange: DateRange;
}

export interface SuppressedDimension {
  dimension: string;
  reason: string;
}

// ── POST /creator/analytics/events ─────────────────────────────────────

export interface AnalyticsEventBody {
  event_id: string;
  content_type: AnalyticsContentType;
  content_id: string;
  event_type: AnalyticsEventType;
  session_id?: string;
  impression_id?: string;
  surface?: string;
  position?: number;
  occurred_at?: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsEventResponse {
  ok: true;
  eventId: string;
  deduplicated: boolean;
}

export async function logAnalyticsEvent(
  body: AnalyticsEventBody,
): Promise<AnalyticsEventResponse> {
  return fetchJson<AnalyticsEventResponse>('/creator/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── GET /creator/analytics/summary ─────────────────────────────────────

export interface AnalyticsSummary extends AnalyticsMeta {
  summary: {
    views: MetricValue;
    qualifiedViews: MetricValue;
    likes: MetricValue;
    saves: MetricValue;
    comments: MetricValue;
    shares: MetricValue;
    productClicks: MetricValue;
    profileVisits: MetricValue;
    engagementRate: MetricValue;
  };
  suppressedDimensions: SuppressedDimension[];
}

export async function fetchAnalyticsSummary(
  options?: {
    period?: AnalyticsPeriod;
    contentType?: AnalyticsContentType;
    contentId?: string;
  },
  signal?: AbortSignal,
): Promise<AnalyticsSummary> {
  const params = new URLSearchParams();
  if (options?.period) params.set('period', options.period);
  if (options?.contentType) params.set('content_type', options.contentType);
  if (options?.contentId) params.set('content_id', options.contentId);
  const qs = params.toString();
  return fetchJson<AnalyticsSummary>(
    `/creator/analytics/summary${qs ? `?${qs}` : ''}`,
    undefined,
    { signal },
  );
}

// ── GET /creator/analytics/timeline ────────────────────────────────────

export interface AnalyticsTimelinePoint {
  date: string;
  views: number;
  qualifiedViews: number;
  likes: number;
  saves: number;
  comments: number;
  shares: number;
  productClicks: number;
  profileVisits: number;
  engagementRate: number;
}

export interface AnalyticsTimeline extends AnalyticsMeta {
  points: AnalyticsTimelinePoint[];
}

export async function fetchAnalyticsTimeline(
  options?: {
    period?: AnalyticsPeriod;
    contentType?: AnalyticsContentType;
    contentId?: string;
  },
  signal?: AbortSignal,
): Promise<AnalyticsTimeline> {
  const params = new URLSearchParams();
  if (options?.period) params.set('period', options.period);
  if (options?.contentType) params.set('content_type', options.contentType);
  if (options?.contentId) params.set('content_id', options.contentId);
  const qs = params.toString();
  return fetchJson<AnalyticsTimeline>(
    `/creator/analytics/timeline${qs ? `?${qs}` : ''}`,
    undefined,
    { signal },
  );
}

// ── GET /creator/analytics/content-ranking ─────────────────────────────

export interface ContentRankingItem {
  contentId: string;
  contentType: AnalyticsContentType;
  title: string;
  thumbnailUrl: string | null;
  views: number;
  likes: number;
  saves: number;
  comments: number;
  shares: number;
  productClicks: number;
  engagementRate: number;
  publishedAt: string | null;
}

export interface ContentRankingResponse {
  metricVersion: string;
  generatedAt: string;
  watermark: string;
  completeness: Completeness;
  range: DateRange;
  comparisonRange: DateRange;
  items: ContentRankingItem[];
}

export async function fetchContentRanking(
  options?: {
    period?: AnalyticsPeriod;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<ContentRankingResponse> {
  const params = new URLSearchParams();
  if (options?.period) params.set('period', options.period);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return fetchJson<ContentRankingResponse>(
    `/creator/analytics/content-ranking${qs ? `?${qs}` : ''}`,
    undefined,
    { signal },
  );
}

// ── GET /creator/analytics/earnings ────────────────────────────────────

export interface EarningsBucket {
  amountMinor: number;
  entryCount: number;
}

export interface EarningsEntry {
  id: string;
  entryType: string;
  amountMinor: number;
  currency: string;
  status: string;
  description: string | null;
  createdAt: string;
  availableAt: string | null;
}

export interface EarningsSummary {
  currency: string;
  estimated: EarningsBucket;
  available: EarningsBucket;
  finalized: EarningsBucket;
  held: EarningsBucket;
  paid: EarningsBucket;
  asOf: string;
  recentEntries: EarningsEntry[];
  metricVersion: string;
  watermark: string;
  completeness: Completeness;
}

export async function fetchEarningsSummary(
  signal?: AbortSignal,
): Promise<EarningsSummary> {
  return fetchJson<EarningsSummary>(
    '/creator/analytics/earnings',
    undefined,
    { signal },
  );
}

// ── POST /creator/analytics/earnings/payout ────────────────────────────
// Moves every 'available' entry: wallet credits instantly (sources →
// 'paid'); bank_account creates a payout_requests row and holds the
// sources until the payout rail settles. Errors surface as coded
// ApiRequestError payloads — PAYOUT_NO_AVAILABLE_EARNINGS,
// PAYOUT_BELOW_MINIMUM, PAYOUT_ACCOUNT_REQUIRED (409).

export interface PayoutResponse {
  ok: true;
  payoutId: string;
  payoutRequestId?: string;
  amountMinor: number;
  currency: string;
  entryCount: number;
  destination: 'wallet' | 'bank_account';
  idempotent?: boolean;
}

export async function requestPayout(
  destination: 'wallet' | 'bank_account' = 'wallet',
  idempotencyKey?: string,
): Promise<PayoutResponse> {
  const body: Record<string, unknown> = { destination };
  if (idempotencyKey) body.idempotency_key = idempotencyKey;
  return fetchJson<PayoutResponse>('/creator/analytics/earnings/payout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
