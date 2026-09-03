// Creator analytics v2 wire contracts.
//
// This is the single source of truth for the creator analytics API shape.
// The frontend mirrors these types by hand in creatorAnalyticsApi.ts —
// keep them in sync. Every response carries metricVersion, timezone,
// watermark and completeness so the UI can honestly label data freshness.

import { z } from 'zod';

export const METRIC_VERSION = 'creator-analytics-2';
export const DEFAULT_TIMEZONE = 'Europe/London';

// ── Enums ──────────────────────────────────────────────────────────────

export const AnalyticsContentTypeSchema = z.enum(['look', 'poster', 'story']);
export type AnalyticsContentType = z.infer<typeof AnalyticsContentTypeSchema>;

// Client-facing event types. `qualified_view` is intentionally excluded — it
// is only ever issued server-side by the aggregation/qualification processor,
// never accepted from a client POST. This prevents clients from forging
// qualified views to inflate engagement metrics.
export const AnalyticsEventTypeSchema = z.enum([
  'view',
  'like',
  'save',
  'comment',
  'share',
  'product_click',
  'profile_visit',
]);
export type AnalyticsEventType = z.infer<typeof AnalyticsEventTypeSchema>;

// Full server-side event type set, including `qualified_view` which is only
// created by the aggregation/qualification processor.
export const ServerAnalyticsEventTypeSchema = z.enum([
  'view',
  'qualified_view',
  'like',
  'save',
  'comment',
  'share',
  'product_click',
  'profile_visit',
]);
export type ServerAnalyticsEventType = z.infer<typeof ServerAnalyticsEventTypeSchema>;

export const AnalyticsPeriodSchema = z.enum(['7d', '30d', '90d']);
export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriodSchema>;

export const PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const CompletenessSchema = z.enum(['complete', 'provisional', 'delayed', 'unavailable']);
export type Completeness = z.infer<typeof CompletenessSchema>;

// ── Shared shapes ──────────────────────────────────────────────────────

export const MetricValueSchema = z.object({
  value: z.number(),
  comparison: z.number(),
  changeRatio: z.number().nullable(),
});

export const DateRangeSchema = z.object({
  start: z.string().datetime(),
  endExclusive: z.string().datetime(),
});

export const SuppressedDimensionSchema = z.object({
  dimension: z.string(),
  reason: z.string(),
});

export const AnalyticsMetaSchema = z.object({
  metricVersion: z.string(),
  timezone: z.string(),
  generatedAt: z.string().datetime(),
  watermark: z.string().datetime(),
  completeness: CompletenessSchema,
  range: DateRangeSchema,
  comparisonRange: DateRangeSchema,
});

// ── POST /creator/analytics/events ─────────────────────────────────────

export const ViewerKindSchema = z.enum(['authenticated', 'anonymous', 'pseudonym']);
export type ViewerKind = z.infer<typeof ViewerKindSchema>;

export const AnalyticsEventBodySchema = z.object({
  event_id: z.string().min(8).max(200),
  content_type: AnalyticsContentTypeSchema,
  content_id: z.string().min(1).max(200),
  event_type: AnalyticsEventTypeSchema,
  viewer_kind: ViewerKindSchema.default('authenticated'),
  // Anonymous/pseudonym viewers use a pseudonymous key instead of a user ID.
  // The server validates that authenticated viewers cannot set this field.
  viewer_pseudonym: z.string().max(100).optional(),
  session_id: z.string().max(200).optional(),
  impression_id: z.string().max(200).optional(),
  surface: z.string().max(100).optional(),
  position: z.number().int().min(0).optional(),
  occurred_at: z.string().datetime().optional(),
  // Consent region for GDPR/CCPA compliance. The server resolves this from
  // the request IP if not provided, so clients in regulated regions always
  // have their consent state recorded.
  consent_region: z.string().max(10).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AnalyticsEventBody = z.infer<typeof AnalyticsEventBodySchema>;

export const AnalyticsEventResponseSchema = z.object({
  ok: z.literal(true),
  eventId: z.string(),
  deduplicated: z.boolean(),
});
export type AnalyticsEventResponse = z.infer<typeof AnalyticsEventResponseSchema>;

// ── GET /creator/analytics/summary ─────────────────────────────────────

export const AnalyticsSummaryResponseSchema = AnalyticsMetaSchema.extend({
  summary: z.object({
    views: MetricValueSchema,
    qualifiedViews: MetricValueSchema,
    likes: MetricValueSchema,
    saves: MetricValueSchema,
    comments: MetricValueSchema,
    shares: MetricValueSchema,
    productClicks: MetricValueSchema,
    profileVisits: MetricValueSchema,
    engagementRate: MetricValueSchema,
  }),
  suppressedDimensions: z.array(SuppressedDimensionSchema),
});
export type AnalyticsSummaryResponse = z.infer<typeof AnalyticsSummaryResponseSchema>;

// ── GET /creator/analytics/timeline ────────────────────────────────────

export const AnalyticsTimelinePointSchema = z.object({
  date: z.string(),  // YYYY-MM-DD
  views: z.number(),
  qualifiedViews: z.number(),
  likes: z.number(),
  saves: z.number(),
  comments: z.number(),
  shares: z.number(),
  productClicks: z.number(),
  profileVisits: z.number(),
  engagementRate: z.number(),  // ratio [0, 1]
});

export const AnalyticsTimelineResponseSchema = AnalyticsMetaSchema.extend({
  points: z.array(AnalyticsTimelinePointSchema),
});
export type AnalyticsTimelineResponse = z.infer<typeof AnalyticsTimelineResponseSchema>;
export type AnalyticsTimelinePoint = z.infer<typeof AnalyticsTimelinePointSchema>;

// ── GET /creator/analytics/content-ranking ─────────────────────────────

export const ContentRankingItemSchema = z.object({
  contentId: z.string(),
  contentType: AnalyticsContentTypeSchema,
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  views: z.number(),
  likes: z.number(),
  saves: z.number(),
  comments: z.number(),
  shares: z.number(),
  productClicks: z.number(),
  engagementRate: z.number(),
  publishedAt: z.string().nullable(),
});

export const ContentRankingResponseSchema = z.object({
  metricVersion: z.string(),
  generatedAt: z.string().datetime(),
  watermark: z.string().datetime(),
  completeness: CompletenessSchema,
  range: DateRangeSchema,
  comparisonRange: DateRangeSchema,
  items: z.array(ContentRankingItemSchema),
});
export type ContentRankingResponse = z.infer<typeof ContentRankingResponseSchema>;
export type ContentRankingItem = z.infer<typeof ContentRankingItemSchema>;

// ── GET /creator/analytics/earnings ────────────────────────────────────

export const EarningsBucketSchema = z.object({
  amountMinor: z.number(),
  entryCount: z.number(),
});

export const EarningsEntrySchema = z.object({
  id: z.string(),
  entryType: z.string(),
  amountMinor: z.number(),
  currency: z.string(),
  status: z.string(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
  availableAt: z.string().datetime().nullable(),
});

export const EarningsSummaryResponseSchema = z.object({
  currency: z.string(),
  estimated: EarningsBucketSchema,
  available: EarningsBucketSchema,
  finalized: EarningsBucketSchema,
  held: EarningsBucketSchema,
  paid: EarningsBucketSchema,
  asOf: z.string().datetime(),
  recentEntries: z.array(EarningsEntrySchema),
  metricVersion: z.string(),
  watermark: z.string().datetime(),
  completeness: CompletenessSchema,
});
export type EarningsSummaryResponse = z.infer<typeof EarningsSummaryResponseSchema>;
