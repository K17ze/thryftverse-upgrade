import { fetchJson } from '../lib/apiClient';

// ── Creator Analytics v2 API ──────────────────────────────────────────
//
// Mirrors the backend wire contract defined in
// backend/api/src/domain/creatorAnalyticsContracts.ts.
//
// Key differences from v1:
//  * snake_case request bodies (matching server zod schemas)
//  * engagementRate is a ratio [0, 1] — the UI formats it as a percent
//  * timeline returns { points } with per-point engagementRate
//  * summary carries current + comparison periods with changeRatio
//  * every response includes metricVersion, timezone, watermark, completeness
//  * content-ranking endpoint returns real thumbnails from content tables
//  * earnings endpoint returns the immutable ledger projection

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

export async function fetchAnalyticsSummary(options?: {
  period?: AnalyticsPeriod;
  contentType?: AnalyticsContentType;
  contentId?: string;
}): Promise<AnalyticsSummary> {
  const params = new URLSearchParams();
  if (options?.period) params.set('period', options.period);
  if (options?.contentType) params.set('content_type', options.contentType);
  if (options?.contentId) params.set('content_id', options.contentId);
  const qs = params.toString();
  return fetchJson<AnalyticsSummary>(
    `/creator/analytics/summary${qs ? `?${qs}` : ''}`,
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

export async function fetchAnalyticsTimeline(options?: {
  period?: AnalyticsPeriod;
  contentType?: AnalyticsContentType;
  contentId?: string;
}): Promise<AnalyticsTimeline> {
  const params = new URLSearchParams();
  if (options?.period) params.set('period', options.period);
  if (options?.contentType) params.set('content_type', options.contentType);
  if (options?.contentId) params.set('content_id', options.contentId);
  const qs = params.toString();
  return fetchJson<AnalyticsTimeline>(
    `/creator/analytics/timeline${qs ? `?${qs}` : ''}`,
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

export async function fetchContentRanking(options?: {
  period?: AnalyticsPeriod;
  limit?: number;
}): Promise<ContentRankingResponse> {
  const params = new URLSearchParams();
  if (options?.period) params.set('period', options.period);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return fetchJson<ContentRankingResponse>(
    `/creator/analytics/content-ranking${qs ? `?${qs}` : ''}`,
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

export async function fetchEarningsSummary(): Promise<EarningsSummary> {
  return fetchJson<EarningsSummary>('/creator/analytics/earnings');
}

// ── POST /creator/analytics/earnings/payout ────────────────────────────

export interface PayoutResponse {
  ok: true;
  payoutId: string;
  amountMinor: number;
  currency: string;
  entryCount: number;
  destination: 'wallet' | 'bank_account';
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
