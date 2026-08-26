/**
 * Analytics daily aggregation handler.
 *
 * Aggregates raw events from `creator_analytics_events_v2` into
 * `creator_analytics_daily_v2` and `creator_analytics_content_daily`.
 *
 * This makes the summary/timeline/content-ranking queries O(days) instead
 * of O(rows), and provides a replayable aggregate that can be reconciled
 * against the raw event log.
 *
 * Completeness rules:
 *  - Dates older than yesterday are marked 'complete' (late events are rare).
 *  - Yesterday is 'provisional' (late events may still arrive).
 *  - Today is 'delayed' (events are still accumulating).
 */
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { METRIC_VERSION } from '../../domain/creatorAnalyticsContracts.js';

export type AnalyticsAggregationHandlerDeps = {
  /** Uses shared db singleton. */
};

export async function aggregateAnalyticsDaily(): Promise<number> {
  // Find the latest date already aggregated.
  const latestResult = await db.query<{ max_date: string | null }>(
    `SELECT MAX(date)::text AS max_date FROM creator_analytics_daily_v2 WHERE metric_version = $1`,
    [METRIC_VERSION],
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Aggregate from the latest aggregated date (or 90 days ago if none).
  let startDate: Date;
  if (latestResult.rows[0]?.max_date) {
    startDate = new Date(latestResult.rows[0].max_date + 'T00:00:00Z');
    startDate.setUTCDate(startDate.getUTCDate() - 1); // re-aggregate yesterday for late events
  } else {
    startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - 90);
  }

  const endDate = new Date(today);
  endDate.setUTCDate(endDate.getUTCDate() + 1); // include today

  // Aggregate into creator_analytics_daily_v2.
  const dailyResult = await db.query(
    `INSERT INTO creator_analytics_daily_v2 (
        creator_id, date, metric_version,
        views, qualified_views, likes, saves, comments, shares,
        product_clicks, profile_visits, unique_viewers, engagement_rate, completeness, updated_at
      )
      SELECT
        creator_id,
        date_trunc('day', occurred_at AT TIME ZONE 'UTC')::date AS date,
        $3 AS metric_version,
        COUNT(*) FILTER (WHERE event_type = 'view')           AS views,
        COUNT(DISTINCT viewer_id) FILTER (WHERE event_type = 'view') AS unique_viewers,
        COUNT(*) FILTER (WHERE event_type = 'qualified_view') AS qualified_views,
        COUNT(*) FILTER (WHERE event_type = 'like')           AS likes,
        COUNT(*) FILTER (WHERE event_type = 'save')           AS saves,
        COUNT(*) FILTER (WHERE event_type = 'comment')        AS comments,
        COUNT(*) FILTER (WHERE event_type = 'share')          AS shares,
        COUNT(*) FILTER (WHERE event_type = 'product_click')  AS product_clicks,
        COUNT(*) FILTER (WHERE event_type = 'profile_visit')  AS profile_visits,
        0, -- engagement_rate computed below
        CASE
          WHEN date_trunc('day', occurred_at AT TIME ZONE 'UTC')::date < $1::date - INTERVAL '1 day' THEN 'complete'
          WHEN date_trunc('day', occurred_at AT TIME ZONE 'UTC')::date = $1::date - INTERVAL '1 day' THEN 'provisional'
          ELSE 'delayed'
        END,
        NOW()
      FROM creator_analytics_events_v2
      WHERE occurred_at >= $1
        AND occurred_at < $2
        AND metric_version = $3
      GROUP BY creator_id, date_trunc('day', occurred_at AT TIME ZONE 'UTC')::date
      ON CONFLICT (creator_id, date, metric_version)
      DO UPDATE SET
        views = EXCLUDED.views,
        qualified_views = EXCLUDED.qualified_views,
        likes = EXCLUDED.likes,
        saves = EXCLUDED.saves,
        comments = EXCLUDED.comments,
        shares = EXCLUDED.shares,
        product_clicks = EXCLUDED.product_clicks,
        profile_visits = EXCLUDED.profile_visits,
        unique_viewers = EXCLUDED.unique_viewers,
        completeness = EXCLUDED.completeness,
        updated_at = NOW()`,
    [startDate, endDate, METRIC_VERSION],
  );

  // Compute engagement_rate for the aggregated rows.
  await db.query(
    `UPDATE creator_analytics_daily_v2
     SET engagement_rate = CASE
       WHEN views > 0 THEN
         LEAST(9.99999, ROUND(
           (likes + saves + comments + shares + product_clicks)::numeric / views, 5
         ))
       ELSE 0
     END
     WHERE metric_version = $1 AND updated_at >= NOW() - INTERVAL '5 minutes'`,
    [METRIC_VERSION],
  );

  // Aggregate into creator_analytics_content_daily.
  await db.query(
    `INSERT INTO creator_analytics_content_daily (
        creator_id, content_type, content_id, date, metric_version,
        views, likes, saves, comments, shares, product_clicks, engagement_rate
      )
      SELECT
        creator_id,
        content_type,
        content_id,
        date_trunc('day', occurred_at AT TIME ZONE 'UTC')::date AS date,
        $3 AS metric_version,
        COUNT(*) FILTER (WHERE event_type = 'view')          AS views,
        COUNT(*) FILTER (WHERE event_type = 'like')          AS likes,
        COUNT(*) FILTER (WHERE event_type = 'save')          AS saves,
        COUNT(*) FILTER (WHERE event_type = 'comment')       AS comments,
        COUNT(*) FILTER (WHERE event_type = 'share')         AS shares,
        COUNT(*) FILTER (WHERE event_type = 'product_click') AS product_clicks,
        0
      FROM creator_analytics_events_v2
      WHERE occurred_at >= $1
        AND occurred_at < $2
        AND metric_version = $3
      GROUP BY creator_id, content_type, content_id, date_trunc('day', occurred_at AT TIME ZONE 'UTC')::date
      ON CONFLICT (creator_id, content_type, content_id, date, metric_version)
      DO UPDATE SET
        views = EXCLUDED.views,
        likes = EXCLUDED.likes,
        saves = EXCLUDED.saves,
        comments = EXCLUDED.comments,
        shares = EXCLUDED.shares,
        product_clicks = EXCLUDED.product_clicks`,
    [startDate, endDate, METRIC_VERSION],
  );

  // Compute engagement_rate for content daily (only for rows touched in this run).
  await db.query(
    `UPDATE creator_analytics_content_daily
     SET engagement_rate = CASE
       WHEN views > 0 THEN
         LEAST(9.99999, ROUND(
           (likes + saves + comments + shares + product_clicks)::numeric / views, 5
         ))
       ELSE 0
     END
     WHERE metric_version = $1 AND date >= $2::date`,
    [METRIC_VERSION, startDate],
  );

  const aggregatedRows = dailyResult.rowCount ?? 0;
  logger.info(
    { aggregatedRows, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    'Analytics daily aggregation complete',
  );
  return aggregatedRows;
}
