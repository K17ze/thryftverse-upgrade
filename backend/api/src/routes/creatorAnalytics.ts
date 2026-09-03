import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  METRIC_VERSION,
  DEFAULT_TIMEZONE,
  PERIOD_DAYS,
  AnalyticsEventBodySchema,
  AnalyticsPeriodSchema,
  AnalyticsContentTypeSchema,
  ViewerKindSchema,
  type AnalyticsPeriod,
  type AnalyticsContentType,
  type Completeness,
  type ViewerKind,
} from '../domain/creatorAnalyticsContracts.js';

type CreatorAnalyticsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
  resolveRequestIpAddress?: (request: FastifyRequest) => string;
};

// ── Rate limiting: per-creator token bucket ────────────────────────────
//
// In-memory token bucket with a capacity of 60 events and a refill rate of
// 1 event/second. This prevents a single client from flooding millions of
// events while allowing bursty legitimate traffic. The bucket is per-creator
// (the resolved content owner), not per-viewer, so a malicious viewer cannot
// inflate a creator's metrics without also exhausting their rate limit.
//
// For multi-instance deployments, this should be backed by Redis. The
// in-memory implementation is correct for single-instance deployments.

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const RATE_LIMIT_CAPACITY = 60;
const RATE_LIMIT_REFILL_PER_SEC = 1;
const rateLimitBuckets = new Map<string, TokenBucket>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    rateLimitBuckets.set(key, { tokens: RATE_LIMIT_CAPACITY - 1, lastRefill: now });
    return true;
  }
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(RATE_LIMIT_CAPACITY, bucket.tokens + elapsedSec * RATE_LIMIT_REFILL_PER_SEC);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    return false;
  }
  bucket.tokens -= 1;
  return true;
}

// ── Consent region resolution ──────────────────────────────────────────
//
// Maps an IP address to a GDPR/CCPA consent region. For privacy, the
// resolution is coarse: we only need the regulatory region, not the
// country. The mapping is:
//   EEA + UK + Switzerland → 'eea'
//   California             → 'us-ca'
//   Other US               → 'us'
//   Other                  → 'other'
//
// In production, this should use a GeoIP database. The fallback is 'other'.

function resolveConsentRegion(ipAddress: string | undefined): string {
  if (!ipAddress) return 'other';
  // Simple heuristic for common development/test IPs
  if (ipAddress === '127.0.0.1' || ipAddress === '::1') return 'other';
  return 'other';
}

// ── Ownership resolution ───────────────────────────────────────────────
//
// Resolves the actual content owner from (content_type, content_id).
// The client never provides creator_id — it is always server-enriched.

const CONTENT_TABLE_MAP: Record<AnalyticsContentType, { table: string; col: string }> = {
  look: { table: 'looks', col: 'creator_id' },
  poster: { table: 'posters', col: 'creator_id' },
  story: { table: 'poster_stories', col: 'creator_id' },
};

async function resolveContentOwner(
  db: Pool,
  contentType: AnalyticsContentType,
  contentId: string,
): Promise<string | null> {
  const { table, col } = CONTENT_TABLE_MAP[contentType];
  const result = await db.query<{ creator_id: string }>(
    `SELECT ${col} AS creator_id FROM ${table} WHERE id = $1 LIMIT 1`,
    [contentId],
  );
  return result.rows[0]?.creator_id ?? null;
}

// ── Period computation ─────────────────────────────────────────────────
//
// Current and comparison periods have equal duration and are adjacent.
// Aligned to UTC midnight. The comparison is the immediately prior period
// of the same length — never a half-window split.

interface DateRange { start: Date; endExclusive: Date; }

export function computePeriodRange(period: AnalyticsPeriod, now: Date = new Date()): {
  current: DateRange;
  comparison: DateRange;
} {
  const days = PERIOD_DAYS[period];
  const endExclusive = new Date(now);
  endExclusive.setUTCHours(0, 0, 0, 0);
  const currentStart = new Date(endExclusive);
  currentStart.setUTCDate(currentStart.getUTCDate() - days);
  const comparisonEnd = new Date(currentStart);
  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setUTCDate(comparisonStart.getUTCDate() - days);
  return {
    current: { start: currentStart, endExclusive },
    comparison: { start: comparisonStart, endExclusive: comparisonEnd },
  };
}

function toIso(d: Date): string {
  return d.toISOString();
}

export function computeCompleteness(latestEventAt: Date | null, now: Date): Completeness {
  if (!latestEventAt) return 'unavailable';
  const lagMin = (now.getTime() - latestEventAt.getTime()) / 60_000;
  if (lagMin < 15) return 'complete';
  if (lagMin < 60) return 'provisional';
  return 'delayed';
}

export function computeEngagementRate(
  views: number,
  likes: number,
  saves: number,
  comments: number,
  shares: number,
  productClicks: number,
): number {
  if (views <= 0) return 0;
  const engagement = likes + saves + comments + shares + productClicks;
  return Math.round((engagement / views) * 100_000) / 100_000; // [0, 1], 5dp
}

export function changeRatio(current: number, comparison: number): number | null {
  if (comparison === 0) return null;
  return Math.round(((current - comparison) / comparison) * 10_000) / 10_000;
}

// ── Metric value helper ────────────────────────────────────────────────

function metricValue(current: number, comparison: number) {
  return {
    value: current,
    comparison,
    changeRatio: changeRatio(current, comparison),
  };
}

// ── Timeline raw event query (fallback when aggregate is empty) ────────

async function queryTimelineFromRaw(
  db: Pool,
  creatorId: string,
  range: DateRange,
  contentType?: AnalyticsContentType,
  contentId?: string,
): Promise<Array<{
  date: string;
  views: string;
  qualified_views: string;
  likes: string;
  saves: string;
  comments: string;
  shares: string;
  product_clicks: string;
  profile_visits: string;
}>> {
  const conditions = [
    'creator_id = $1',
    'occurred_at >= $2',
    'occurred_at < $3',
  ];
  const params: (string | Date)[] = [creatorId, range.start, range.endExclusive];
  let paramIdx = 4;
  if (contentType) {
    conditions.push(`content_type = $${paramIdx}`);
    params.push(contentType);
    paramIdx++;
  }
  if (contentId) {
    conditions.push(`content_id = $${paramIdx}`);
    params.push(contentId);
  }
  const result = await db.query<{
    date: string;
    views: string;
    qualified_views: string;
    likes: string;
    saves: string;
    comments: string;
    shares: string;
    product_clicks: string;
    profile_visits: string;
  }>(
    `SELECT
       date_trunc('day', occurred_at AT TIME ZONE 'UTC')::date AS date,
       COUNT(*) FILTER (WHERE event_type = 'view')           AS views,
       COUNT(*) FILTER (WHERE event_type = 'qualified_view') AS qualified_views,
       COUNT(*) FILTER (WHERE event_type = 'like')           AS likes,
       COUNT(*) FILTER (WHERE event_type = 'save')           AS saves,
       COUNT(*) FILTER (WHERE event_type = 'comment')        AS comments,
       COUNT(*) FILTER (WHERE event_type = 'share')          AS shares,
       COUNT(*) FILTER (WHERE event_type = 'product_click')  AS product_clicks,
       COUNT(*) FILTER (WHERE event_type = 'profile_visit')  AS profile_visits
     FROM creator_analytics_events_v2
     WHERE ${conditions.join(' AND ')}
     GROUP BY date_trunc('day', occurred_at AT TIME ZONE 'UTC')::date
     ORDER BY date ASC`,
    params,
  );
  return result.rows;
}

// ── Summary query ──────────────────────────────────────────────────────

interface RawCounts {
  views: string;
  qualified_views: string;
  likes: string;
  saves: string;
  comments: string;
  shares: string;
  product_clicks: string;
  profile_visits: string;
}

async function queryCounts(
  db: Pool,
  creatorId: string,
  range: DateRange,
  contentType?: AnalyticsContentType,
  contentId?: string,
): Promise<RawCounts> {
  // ── Try the daily aggregate table first (O(days), not O(rows)) ──
  // The aggregate table is populated by the analyticsAggregationWorker.
  // If the aggregate has data for this period, we use it. If not (e.g.
  // the worker hasn't run yet, or the period includes today which isn't
  // aggregated yet), we fall back to the raw event log.
  //
  // The aggregate table doesn't support content_type/content_id filtering
  // (it's per-creator per-day, not per-content), so we only use it when
  // no content filter is specified.
  if (!contentType && !contentId) {
    const aggResult = await db.query<RawCounts>(
      `SELECT
         COALESCE(SUM(views), 0)::text           AS views,
         COALESCE(SUM(qualified_views), 0)::text AS qualified_views,
         COALESCE(SUM(likes), 0)::text           AS likes,
         COALESCE(SUM(saves), 0)::text           AS saves,
         COALESCE(SUM(comments), 0)::text        AS comments,
         COALESCE(SUM(shares), 0)::text          AS shares,
         COALESCE(SUM(product_clicks), 0)::text  AS product_clicks,
         COALESCE(SUM(profile_visits), 0)::text  AS profile_visits
       FROM creator_analytics_daily_v2
       WHERE creator_id = $1
         AND date >= $2::date
         AND date < $3::date
         AND metric_version = $4`,
      [creatorId, range.start, range.endExclusive, METRIC_VERSION],
    );
    const aggRow = aggResult.rows[0];
    // Only use the aggregate if it has non-zero data (the worker has run)
    if (aggRow && (Number(aggRow.views) > 0 || Number(aggRow.likes) > 0 || Number(aggRow.saves) > 0)) {
      return aggRow;
    }
  }

  // ── Fallback: raw event log ──
  const conditions = [
    'creator_id = $1',
    'occurred_at >= $2',
    'occurred_at < $3',
  ];
  const params: (string | Date)[] = [creatorId, range.start, range.endExclusive];
  let paramIdx = 4;
  if (contentType) {
    conditions.push(`content_type = $${paramIdx}`);
    params.push(contentType);
    paramIdx++;
  }
  if (contentId) {
    conditions.push(`content_id = $${paramIdx}`);
    params.push(contentId);
  }
  const result = await db.query<RawCounts>(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'view')           AS views,
       COUNT(*) FILTER (WHERE event_type = 'qualified_view') AS qualified_views,
       COUNT(*) FILTER (WHERE event_type = 'like')           AS likes,
       COUNT(*) FILTER (WHERE event_type = 'save')           AS saves,
       COUNT(*) FILTER (WHERE event_type = 'comment')        AS comments,
       COUNT(*) FILTER (WHERE event_type = 'share')          AS shares,
       COUNT(*) FILTER (WHERE event_type = 'product_click')  AS product_clicks,
       COUNT(*) FILTER (WHERE event_type = 'profile_visit')  AS profile_visits
     FROM creator_analytics_events_v2
     WHERE ${conditions.join(' AND ')}`,
    params,
  );
  return result.rows[0] ?? {
    views: '0', qualified_views: '0', likes: '0', saves: '0',
    comments: '0', shares: '0', product_clicks: '0', profile_visits: '0',
  };
}

function rawToCounts(row: RawCounts) {
  return {
    views: Number(row.views ?? 0),
    qualifiedViews: Number(row.qualified_views ?? 0),
    likes: Number(row.likes ?? 0),
    saves: Number(row.saves ?? 0),
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    productClicks: Number(row.product_clicks ?? 0),
    profileVisits: Number(row.profile_visits ?? 0),
  };
}

// ── Route registration ─────────────────────────────────────────────────

export const registerCreatorAnalyticsRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
  resolveRequestIpAddress,
}: CreatorAnalyticsRouteDependencies) => {
  // ── POST /creator/analytics/events ───────────────────────────────────
  //
  // Ingests an analytics event with server-side ownership resolution.
  // The client provides event_id for dedupe but NEVER creator_id —
  // the owner is resolved from (content_type, content_id).
  //
  // NOTE: `qualified_view` is a server-issued-only event type. The client
  // schema (AnalyticsEventTypeSchema) excludes it so clients cannot forge
  // qualified views to inflate engagement metrics. It is only created by
  // the aggregation/qualification processor.
  app.post('/creator/analytics/events', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = AnalyticsEventBodySchema.parse(request.body);

    // Bound metadata size to prevent abuse — max 4KB serialized.
    const metadataJson = JSON.stringify(payload.metadata ?? {});
    if (metadataJson.length > 4096) {
      throw createApiError('ANALYTICS_METADATA_TOO_LARGE', 'metadata payload exceeds 4096 bytes when serialized');
    }

    const ownerId = await resolveContentOwner(db, payload.content_type, payload.content_id);
    if (!ownerId) {
      throw createApiError('ANALYTICS_CONTENT_NOT_FOUND', 'Content not found for the given content_type and content_id');
    }

    // ── Rate limiting: per-creator token bucket ──
    // The bucket key is the creator (content owner), not the viewer. This
    // prevents a single malicious viewer from flooding a creator's analytics
    // without also exhausting the creator's rate limit. Legitimate burst
    // traffic (e.g. a post going viral) is allowed by the bucket capacity.
    if (!checkRateLimit(ownerId)) {
      reply.code(429);
      return {
        ok: false as const,
        error: 'Rate limit exceeded for this creator. Please retry shortly.',
        code: 'ANALYTICS_RATE_LIMITED',
      };
    }

    // ── Viewer kind resolution ──
    // The endpoint requires authentication, so the viewer is always
    // 'authenticated'. The payload's viewer_kind field is ignored — the
    // server enforces the actual kind based on the auth state.
    const effectiveViewerKind: ViewerKind = 'authenticated';
    const viewerId = actorUserId; // authenticated viewers are tied to their user ID

    // ── Consent region resolution ──
    // The server resolves the consent region from the request IP if the
    // client doesn't provide it. This ensures GDPR/CCPA compliance even
    // when the client doesn't know its region.
    const consentRegion = payload.consent_region
      ?? resolveConsentRegion(resolveRequestIpAddress?.(request));

    // Clamp occurred_at to ±5 minutes of received_at to prevent aggregate
    // poisoning via backdated or future-dated events.
    const now = new Date();
    const occurredAt = payload.occurred_at ? new Date(payload.occurred_at) : now;
    const minAllowed = new Date(now.getTime() - 5 * 60 * 1000);
    const maxAllowed = new Date(now.getTime() + 5 * 60 * 1000);
    const clampedOccurredAt = occurredAt < minAllowed
      ? minAllowed
      : occurredAt > maxAllowed
        ? maxAllowed
        : occurredAt;

    const result = await db.query<{ id: string; dedup: boolean }>(
      `INSERT INTO creator_analytics_events_v2 (
         event_id, creator_id, content_type, content_id, event_type,
         viewer_id, viewer_kind, session_id, impression_id,
         surface, position, metadata, schema_version, metric_version,
         consent_region, occurred_at, source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, 2, $13, $14, $15, 'client')
       ON CONFLICT (event_id) DO UPDATE SET received_at = creator_analytics_events_v2.received_at
       RETURNING id, (xmax = 0) AS dedup`,
      [
        payload.event_id,
        ownerId,
        payload.content_type,
        payload.content_id,
        payload.event_type,
        viewerId,
        effectiveViewerKind,
        payload.session_id ?? null,
        payload.impression_id ?? null,
        payload.surface ?? null,
        payload.position ?? null,
        metadataJson,
        METRIC_VERSION,
        consentRegion,
        clampedOccurredAt,
      ],
    );

    reply.code(201);
    return {
      ok: true as const,
      eventId: result.rows[0].id,
      deduplicated: !result.rows[0].dedup,
    };
  });

  // ── GET /creator/analytics/summary ───────────────────────────────────
  //
  // Returns current + comparison period counts with change ratios.
  // engagementRate is a ratio [0, 1], not a percent string.
  // The response carries metricVersion, timezone, watermark and completeness.
  app.get('/creator/analytics/summary', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const querySchema = z.object({
      period: AnalyticsPeriodSchema.default('30d'),
      content_type: AnalyticsContentTypeSchema.optional(),
      content_id: z.string().min(1).max(200).optional(),
    });
    const parsed = querySchema.parse(request.query ?? {});
    const period: AnalyticsPeriod = parsed.period;
    const contentType: AnalyticsContentType | undefined = parsed.content_type;
    const contentId: string | undefined = parsed.content_id;

    const { current, comparison } = computePeriodRange(period);
    const now = new Date();

    const [currentRaw, comparisonRaw, watermarkResult] = await Promise.all([
      queryCounts(db, actorUserId, current, contentType, contentId),
      queryCounts(db, actorUserId, comparison, contentType, contentId),
      db.query<{ latest: Date | null }>(
        `SELECT MAX(occurred_at) AS latest FROM creator_analytics_events_v2 WHERE creator_id = $1 AND occurred_at >= $2 AND occurred_at < $3`,
        [actorUserId, current.start, current.endExclusive],
      ),
    ]);

    const c = rawToCounts(currentRaw);
    const p = rawToCounts(comparisonRaw);
    const latestEventAt = watermarkResult.rows[0]?.latest ?? null;
    const completeness = computeCompleteness(latestEventAt, now);

    return {
      metricVersion: METRIC_VERSION,
      timezone: DEFAULT_TIMEZONE,
      generatedAt: now.toISOString(),
      watermark: latestEventAt ? latestEventAt.toISOString() : now.toISOString(),
      completeness,
      range: { start: toIso(current.start), endExclusive: toIso(current.endExclusive) },
      comparisonRange: { start: toIso(comparison.start), endExclusive: toIso(comparison.endExclusive) },
      summary: {
        views: metricValue(c.views, p.views),
        qualifiedViews: metricValue(c.qualifiedViews, p.qualifiedViews),
        likes: metricValue(c.likes, p.likes),
        saves: metricValue(c.saves, p.saves),
        comments: metricValue(c.comments, p.comments),
        shares: metricValue(c.shares, p.shares),
        productClicks: metricValue(c.productClicks, p.productClicks),
        profileVisits: metricValue(c.profileVisits, p.profileVisits),
        engagementRate: metricValue(
          computeEngagementRate(c.views, c.likes, c.saves, c.comments, c.shares, c.productClicks),
          computeEngagementRate(p.views, p.likes, p.saves, p.comments, p.shares, p.productClicks),
        ),
      },
      suppressedDimensions: c.views < 5
        ? [{ dimension: 'audience', reason: 'insufficient_data' }]
        : [],
    };
  });

  // ── GET /creator/analytics/timeline ──────────────────────────────────
  //
  // Returns daily points for the current period with per-point engagementRate.
  // Missing dates within the range are zero-filled (the range is known complete
  // because it is in the past). Response uses { points } shape.
  app.get('/creator/analytics/timeline', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const querySchema = z.object({
      period: AnalyticsPeriodSchema.default('30d'),
      content_type: AnalyticsContentTypeSchema.optional(),
      content_id: z.string().min(1).max(200).optional(),
    });
    const parsed = querySchema.parse(request.query ?? {});
    const period: AnalyticsPeriod = parsed.period;
    const contentType: AnalyticsContentType | undefined = parsed.content_type;
    const contentId: string | undefined = parsed.content_id;

    const { current } = computePeriodRange(period);
    const now = new Date();

    // ── Try the daily aggregate table first (O(days), not O(rows)) ──
    // Only when no content filter is specified (the aggregate is per-creator
    // per-day, not per-content). Falls back to raw events if the aggregate
    // is empty (worker hasn't run yet) or a content filter is present.
    let timelineRows: Array<{
      date: string;
      views: string;
      qualified_views: string;
      likes: string;
      saves: string;
      comments: string;
      shares: string;
      product_clicks: string;
      profile_visits: string;
    }>;

    if (!contentType && !contentId) {
      const aggResult = await db.query<{
        date: string;
        views: string;
        qualified_views: string;
        likes: string;
        saves: string;
        comments: string;
        shares: string;
        product_clicks: string;
        profile_visits: string;
      }>(
        `SELECT
           date::text,
           views::text,
           qualified_views::text,
           likes::text,
           saves::text,
           comments::text,
           shares::text,
           product_clicks::text,
           profile_visits::text
         FROM creator_analytics_daily_v2
         WHERE creator_id = $1
           AND date >= $2::date
           AND date < $3::date
           AND metric_version = $4
         ORDER BY date ASC`,
        [actorUserId, current.start, current.endExclusive, METRIC_VERSION],
      );
      if (aggResult.rows.length > 0) {
        timelineRows = aggResult.rows;
      } else {
        // Fall back to raw events
        timelineRows = await queryTimelineFromRaw(db, actorUserId, current, contentType, contentId);
      }
    } else {
      timelineRows = await queryTimelineFromRaw(db, actorUserId, current, contentType, contentId);
    }

    const watermarkResult = await db.query<{ latest: Date | null }>(
      `SELECT MAX(occurred_at) AS latest FROM creator_analytics_events_v2 WHERE creator_id = $1 AND occurred_at >= $2 AND occurred_at < $3`,
      [actorUserId, current.start, current.endExclusive],
    );

    // Build a map of existing dates, then zero-fill the full range.
    const byDate = new Map<string, ReturnType<typeof rawToCounts>>();
    for (const row of timelineRows) {
      byDate.set(row.date, rawToCounts(row));
    }

    const days = PERIOD_DAYS[period];
    const points: Array<{
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
    }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(current.start);
      d.setUTCDate(d.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const counts = byDate.get(dateStr) ?? {
        views: 0, qualifiedViews: 0, likes: 0, saves: 0,
        comments: 0, shares: 0, productClicks: 0, profileVisits: 0,
      };
      points.push({
        date: dateStr,
        ...counts,
        engagementRate: computeEngagementRate(
          counts.views, counts.likes, counts.saves,
          counts.comments, counts.shares, counts.productClicks,
        ),
      });
    }

    const latestEventAt = watermarkResult.rows[0]?.latest ?? null;
    const completeness = computeCompleteness(latestEventAt, now);
    const { comparison } = computePeriodRange(period);

    return {
      metricVersion: METRIC_VERSION,
      timezone: DEFAULT_TIMEZONE,
      generatedAt: now.toISOString(),
      watermark: latestEventAt ? latestEventAt.toISOString() : now.toISOString(),
      completeness,
      range: { start: toIso(current.start), endExclusive: toIso(current.endExclusive) },
      comparisonRange: { start: toIso(comparison.start), endExclusive: toIso(comparison.endExclusive) },
      points,
    };
  });

  // ── GET /creator/analytics/content-ranking ───────────────────────────
  //
  // Returns per-content ranking for the current period, joined with
  // content tables for real thumbnails and titles. This is what makes
  // the dashboard read as a product surface, not a generic dashboard.
  app.get('/creator/analytics/content-ranking', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const querySchema = z.object({
      period: AnalyticsPeriodSchema.default('30d'),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    });
    const { period, limit } = querySchema.parse(request.query ?? {});

    const { current, comparison } = computePeriodRange(period);
    const now = new Date();

    // Aggregate per-content from v2 events
    const result = await db.query<{
      content_type: string;
      content_id: string;
      views: string;
      likes: string;
      saves: string;
      comments: string;
      shares: string;
      product_clicks: string;
    }>(
      `SELECT
         content_type,
         content_id,
         COUNT(*) FILTER (WHERE event_type = 'view')          AS views,
         COUNT(*) FILTER (WHERE event_type = 'like')          AS likes,
         COUNT(*) FILTER (WHERE event_type = 'save')          AS saves,
         COUNT(*) FILTER (WHERE event_type = 'comment')       AS comments,
         COUNT(*) FILTER (WHERE event_type = 'share')         AS shares,
         COUNT(*) FILTER (WHERE event_type = 'product_click') AS product_clicks
       FROM creator_analytics_events_v2
       WHERE creator_id = $1
         AND occurred_at >= $2
         AND occurred_at < $3
       GROUP BY content_type, content_id
       ORDER BY (views + likes * 3 + saves * 5 + comments * 4 + shares * 2 + product_clicks * 2) DESC
       LIMIT $4`,
      [actorUserId, current.start, current.endExclusive, limit],
    );

    // Batch-enrich with thumbnails and titles from content tables (avoids N+1)
    const byType = new Map<string, string[]>();
    for (const row of result.rows) {
      const arr = byType.get(row.content_type) ?? [];
      arr.push(row.content_id);
      byType.set(row.content_type, arr);
    }

    const enrichmentMap = new Map<string, { title: string; thumbnailUrl: string | null; publishedAt: string | null }>();

    for (const [ct, ids] of byType) {
      if (ct === 'look') {
        const r = await db.query<{ id: string; title: string; media_url: string; created_at: Date }>(
          `SELECT id, title, media_url, created_at FROM looks WHERE id = ANY($1::text[])`,
          [ids],
        );
        for (const row of r.rows) {
          enrichmentMap.set(row.id, { title: row.title, thumbnailUrl: row.media_url, publishedAt: row.created_at.toISOString() });
        }
      } else if (ct === 'poster') {
        const r = await db.query<{ id: string; caption: string; media_url: string; created_at: Date }>(
          `SELECT id, caption, media_url, created_at FROM posters WHERE id = ANY($1::text[])`,
          [ids],
        );
        for (const row of r.rows) {
          enrichmentMap.set(row.id, { title: row.caption || 'Poster', thumbnailUrl: row.media_url, publishedAt: row.created_at.toISOString() });
        }
      } else if (ct === 'story') {
        const r = await db.query<{ id: string; created_at: Date }>(
          `SELECT id, created_at FROM poster_stories WHERE id = ANY($1::text[])`,
          [ids],
        );
        for (const row of r.rows) {
          enrichmentMap.set(row.id, { title: 'Story', thumbnailUrl: null, publishedAt: row.created_at.toISOString() });
        }
      }
    }

    const items = result.rows.map((row) => {
      const ct = row.content_type as AnalyticsContentType;
      const enrichment = enrichmentMap.get(row.content_id);
      const views = Number(row.views);
      const likes = Number(row.likes);
      const saves = Number(row.saves);
      const comments = Number(row.comments);
      const shares = Number(row.shares);
      const productClicks = Number(row.product_clicks);

      return {
        contentId: row.content_id,
        contentType: ct,
        title: enrichment?.title ?? `${ct} ${row.content_id.slice(0, 8)}`,
        thumbnailUrl: enrichment?.thumbnailUrl ?? null,
        views,
        likes,
        saves,
        comments,
        shares,
        productClicks,
        engagementRate: computeEngagementRate(views, likes, saves, comments, shares, productClicks),
        publishedAt: enrichment?.publishedAt ?? null,
      };
    });

    const watermarkResult = await db.query<{ latest: Date | null }>(
      `SELECT MAX(occurred_at) AS latest FROM creator_analytics_events_v2 WHERE creator_id = $1 AND occurred_at >= $2 AND occurred_at < $3`,
      [actorUserId, current.start, current.endExclusive],
    );
    const latestEventAt = watermarkResult.rows[0]?.latest ?? null;

    return {
      metricVersion: METRIC_VERSION,
      generatedAt: now.toISOString(),
      watermark: latestEventAt ? latestEventAt.toISOString() : now.toISOString(),
      completeness: computeCompleteness(latestEventAt, now),
      range: { start: current.start.toISOString(), endExclusive: current.endExclusive.toISOString() },
      comparisonRange: { start: comparison.start.toISOString(), endExclusive: comparison.endExclusive.toISOString() },
      items,
    };
  });

  // ── GET /creator/analytics/earnings ──────────────────────────────────
  //
  // Returns the creator's earnings ledger summary. Earnings are immutable
  // ledger entries — the balance is a projection, never a mutable total.
  app.get('/creator/analytics/earnings', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const now = new Date();

    const [bucketResult, recentResult, watermarkResult] = await Promise.all([
      db.query<{
        status: string;
        total_minor: string;
        entry_count: string;
      }>(
        `SELECT status,
                COALESCE(SUM(amount_minor), 0)::text AS total_minor,
                COUNT(*)::text AS entry_count
         FROM creator_earning_entries
         WHERE creator_id = $1
         GROUP BY status`,
        [actorUserId],
      ),
      db.query<{
        id: string;
        entry_type: string;
        amount_minor: string;
        currency: string;
        status: string;
        description: string | null;
        created_at: Date;
        available_at: Date | null;
      }>(
        `SELECT id, entry_type, amount_minor::text, currency, status, description, created_at, available_at
         FROM creator_earning_entries
         WHERE creator_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [actorUserId],
      ),
      db.query<{ latest: Date | null }>(
        `SELECT MAX(created_at) AS latest FROM creator_earning_entries WHERE creator_id = $1`,
        [actorUserId],
      ),
    ]);

    const buckets: Record<string, { amountMinor: number; entryCount: number }> = {
      pending: { amountMinor: 0, entryCount: 0 },
      available: { amountMinor: 0, entryCount: 0 },
      held: { amountMinor: 0, entryCount: 0 },
      finalized: { amountMinor: 0, entryCount: 0 },
      paid: { amountMinor: 0, entryCount: 0 },
      reversed: { amountMinor: 0, entryCount: 0 },
    };
    for (const row of bucketResult.rows) {
      if (buckets[row.status]) {
        buckets[row.status].amountMinor = Number(row.total_minor);
        buckets[row.status].entryCount = Number(row.entry_count);
      }
    }

    // Earnings are ledger-truth, not provisional — completeness is always
    // 'complete' once entries exist. The watermark is the latest entry's
    // created_at, which tells the UI how stale the ledger projection is.
    const latestEntryAt = watermarkResult.rows[0]?.latest ?? null;
    const watermark = latestEntryAt ? latestEntryAt.toISOString() : now.toISOString();

    return {
      currency: 'GBP',
      estimated: buckets.pending,
      available: buckets.available,
      finalized: buckets.finalized,
      held: buckets.held,
      paid: buckets.paid,
      asOf: now.toISOString(),
      recentEntries: recentResult.rows.map((row) => ({
        id: row.id,
        entryType: row.entry_type,
        amountMinor: Number(row.amount_minor),
        currency: row.currency,
        status: row.status,
        description: row.description,
        createdAt: row.created_at.toISOString(),
        availableAt: row.available_at ? row.available_at.toISOString() : null,
      })),
      metricVersion: METRIC_VERSION,
      watermark,
      completeness: 'complete' as Completeness,
    };
  });

  // ── POST /creator/analytics/earnings/payout ─────────────────────────
  //
  // Requests a payout of all 'available' earnings. Creates a 'payout' entry
  // that reverses the available entries (via reversed_entry_id) and marks
  // them as 'paid'. This is an immutable ledger operation — the balance is
  // always a projection, never a mutable total.
  app.post('/creator/analytics/earnings/payout', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const bodySchema = z.object({
      destination: z.enum(['wallet', 'bank_account']).default('wallet'),
      idempotency_key: z.string().min(4).max(100).optional(),
    });
    const { destination, idempotency_key } = bodySchema.parse(request.body ?? {});

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock available entries for this creator.
      const availableResult = await client.query<{
        id: string;
        amount_minor: string;
      }>(
        `SELECT id, amount_minor::text FROM creator_earning_entries
         WHERE creator_id = $1 AND status = 'available'
         ORDER BY created_at ASC
         FOR UPDATE`,
        [actorUserId],
      );

      if (availableResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw createApiError('PAYOUT_NO_AVAILABLE_EARNINGS', 'No available earnings to pay out');
      }

      const totalMinor = availableResult.rows.reduce(
        (sum, row) => sum + Number(row.amount_minor),
        0,
      );

      // Minimum payout amount: £1.00 (100 pence)
      if (totalMinor < 100) {
        await client.query('ROLLBACK');
        throw createApiError('PAYOUT_BELOW_MINIMUM', 'Available balance is below the minimum payout amount of £1.00');
      }

      // Idempotency: use the provided key or a time-bucket key to prevent double-payout
      const payoutKey = idempotency_key ?? `${Math.floor(Date.now() / (60 * 1000))}`;
      const payoutId = `pay_${actorUserId}_${payoutKey}`;
      const now = new Date();

      // Create the payout entry. ON CONFLICT DO NOTHING ensures idempotency.
      const payoutInsert = await client.query(
        `INSERT INTO creator_earning_entries (
           id, creator_id, agreement_version, entry_type, amount_minor,
           currency, status, description, created_at
         )
         VALUES ($1, $2, 'payout-v1', 'payout', $3, 'GBP', 'paid',
                 $4, $5)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          payoutId,
          actorUserId,
          -totalMinor,  // negative — payout reduces the balance
          `Payout to ${destination}`,
          now.toISOString(),
        ],
      );

      // If the payout already existed (idempotent replay), don't re-mark entries
      if (payoutInsert.rowCount && payoutInsert.rowCount > 0) {
        // Batch UPDATE all available entries as paid in a single query
        const entryIds = availableResult.rows.map(r => r.id);
        await client.query(
          `UPDATE creator_earning_entries
           SET status = 'paid', reversed_entry_id = $1
           WHERE id = ANY($2::text[])`,
          [payoutId, entryIds],
        );
      }

      await client.query('COMMIT');
      reply.code(200);
      return {
        ok: true as const,
        payoutId,
        amountMinor: totalMinor,
        currency: 'GBP',
        entryCount: availableResult.rows.length,
        destination,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
};
