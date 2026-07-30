import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;

function boundedNumber(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const lookbackHours = Math.trunc(
  boundedNumber('RECOMMENDATION_HEALTH_LOOKBACK_HOURS', 24, 1, 24 * 30),
);
const maximumFallbackRate = boundedNumber(
  'RECOMMENDATION_MAX_FALLBACK_RATE',
  0.1,
  0,
  1,
);
const maximumEmptyRate = boundedNumber(
  'RECOMMENDATION_MAX_EMPTY_RATE',
  0.05,
  0,
  1,
);
const maximumP95LatencyMs = boundedNumber(
  'RECOMMENDATION_MAX_P95_LATENCY_MS',
  2_500,
  1,
  60_000,
);

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const serves = await pool.query(
    `SELECT
       COUNT(*)::int AS serve_count,
       COUNT(*) FILTER (WHERE source = 'fallback')::int AS fallback_count,
       COUNT(*) FILTER (WHERE result_count = 0)::int AS empty_count,
       COUNT(*) FILTER (WHERE cold_start)::int AS cold_start_count,
       COALESCE(AVG(latency_ms), 0)::float8 AS average_latency_ms,
       COALESCE(
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),
         0
       )::float8 AS p95_latency_ms
     FROM recommendation_serves
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')`,
    [lookbackHours],
  );
  const feedback = await pool.query(
    `SELECT
       COUNT(*)::int AS feedback_count,
       COUNT(*) FILTER (WHERE request_id IS NOT NULL)::int AS attributed_count
     FROM recommendation_feedback
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')`,
    [lookbackHours],
  );
  const concentration = await pool.query(
    `WITH seller_impressions AS (
       SELECT l.seller_id, COUNT(*)::float8 AS impressions
       FROM recommendation_impressions ri
       INNER JOIN recommendation_serves rs ON rs.request_id = ri.request_id
       INNER JOIN listings l ON l.id = ri.listing_id
       WHERE rs.created_at >= NOW() - ($1::int * INTERVAL '1 hour')
       GROUP BY l.seller_id
     )
     SELECT COALESCE(
       MAX(impressions) / NULLIF(SUM(impressions), 0),
       0
     )::float8 AS top_seller_share
     FROM seller_impressions`,
    [lookbackHours],
  );

  const row = serves.rows[0];
  const feedbackRow = feedback.rows[0];
  const serveCount = Number(row.serve_count);
  const feedbackCount = Number(feedbackRow.feedback_count);
  const metrics = {
    lookbackHours,
    serveCount,
    fallbackRate: serveCount ? Number(row.fallback_count) / serveCount : 0,
    emptyRate: serveCount ? Number(row.empty_count) / serveCount : 0,
    coldStartRate: serveCount ? Number(row.cold_start_count) / serveCount : 0,
    averageLatencyMs: Number(row.average_latency_ms),
    p95LatencyMs: Number(row.p95_latency_ms),
    feedbackCount,
    attributionRate: feedbackCount
      ? Number(feedbackRow.attributed_count) / feedbackCount
      : 1,
    topSellerShare: Number(concentration.rows[0].top_seller_share),
  };

  const failures = [];
  if (metrics.fallbackRate > maximumFallbackRate) {
    failures.push('fallback_rate');
  }
  if (metrics.emptyRate > maximumEmptyRate) {
    failures.push('empty_rate');
  }
  if (metrics.p95LatencyMs > maximumP95LatencyMs) {
    failures.push('p95_latency');
  }
  if (metrics.attributionRate < 1) {
    failures.push('unattributed_feedback');
  }

  console.log(JSON.stringify({
    ok: failures.length === 0,
    status: serveCount === 0 ? 'no_data' : failures.length ? 'degraded' : 'healthy',
    failures,
    thresholds: {
      maximumFallbackRate,
      maximumEmptyRate,
      maximumP95LatencyMs,
      minimumAttributionRate: 1,
    },
    metrics,
  }, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
} finally {
  await pool.end();
}
