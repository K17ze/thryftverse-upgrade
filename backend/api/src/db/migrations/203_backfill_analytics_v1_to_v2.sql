-- Backfill v1 analytics events into v2 schema.
--
-- v1 events (creator_analytics_events) are copied into v2
-- (creator_analytics_events_v2) with:
--  * metric_version = 'creator-analytics-2'
--  * schema_version = 1 (original v1 schema)
--  * source = 'client' (v1 events were all client-sourced)
--  * viewer_kind = 'authenticated' (v1 didn't distinguish)
--  * consent_region = NULL (v1 didn't record it)
--  * occurred_at = created_at (v1 didn't separate occurred/received)
--  * received_at = created_at
--
-- The event_id is synthesized from the v1 id to ensure idempotency:
-- running this migration multiple times is safe (ON CONFLICT DO NOTHING).
--
-- After backfill, the v1 tables can be retained for audit but are no
-- longer read by the API. The v2 tables are the authoritative source.

INSERT INTO creator_analytics_events_v2 (
  event_id, creator_id, content_type, content_id, event_type,
  viewer_id, viewer_kind, metadata, schema_version, metric_version,
  occurred_at, received_at, source
)
SELECT
  'v1_' || e.id::text,                           -- synthesized event_id
  e.creator_id,
  e.content_type,
  e.content_id,
  e.event_type,
  e.viewer_id,
  'authenticated',                                -- v1 didn't distinguish
  e.metadata,
  1,                                              -- v1 schema version
  'creator-analytics-2',
  e.created_at,                                   -- v1 used created_at as occurred_at
  e.created_at,
  'client'
FROM creator_analytics_events e
WHERE NOT EXISTS (
  SELECT 1 FROM creator_analytics_events_v2 v2
  WHERE v2.event_id = 'v1_' || e.id::text
)
ON CONFLICT (event_id) DO NOTHING;

-- Backfill v1 daily aggregates into v2.
-- v1 daily aggregates have content_type and content_id dimensions that
-- v2 daily_v2 doesn't have (v2 daily is per-creator per-day only). We
-- aggregate the v1 daily data to per-creator per-day and insert into v2.
INSERT INTO creator_analytics_daily_v2 (
  creator_id, date, metric_version,
  views, qualified_views, likes, saves, comments, shares,
  product_clicks, profile_visits, unique_viewers, engagement_rate,
  completeness, updated_at
)
SELECT
  d.creator_id,
  d.date,
  'creator-analytics-2',
  SUM(d.views),
  0,                                              -- v1 didn't have qualified_views
  SUM(d.likes),
  SUM(d.saves),
  SUM(d.comments),
  SUM(d.shares),
  SUM(d.product_clicks),
  SUM(d.profile_visits),
  0,                                              -- v1 didn't compute unique_viewers
  CASE
    WHEN SUM(d.views) > 0 THEN
      LEAST(9.99999, ROUND(
        (SUM(d.likes) + SUM(d.saves) + SUM(d.comments) + SUM(d.shares) + SUM(d.product_clicks))::numeric
        / SUM(d.views), 5
      ))
    ELSE 0
  END,
  'complete',                                     -- v1 data is historical, always complete
  NOW()
FROM creator_analytics_daily d
WHERE NOT EXISTS (
  SELECT 1 FROM creator_analytics_daily_v2 v2
  WHERE v2.creator_id = d.creator_id
    AND v2.date = d.date
    AND v2.metric_version = 'creator-analytics-2'
)
GROUP BY d.creator_id, d.date
ON CONFLICT (creator_id, date, metric_version) DO NOTHING;
