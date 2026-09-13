-- 281_matview_completed_status.sql
--
-- Migration 280 introduced 'completed' as the terminal order status (buyer
-- confirmation / escrow release sweep). The analytics materialized views
-- created in 114_materialized_views.sql still enumerate only
-- ('paid','shipped','delivered'), so completed orders silently dropped out
-- of seller revenue / sold-count / sell-through metrics.
--
-- Materialized views cannot have their query altered in place — drop and
-- recreate the two affected views with 'completed' added to the sales
-- status set, then repopulate them so dashboards stay correct until the
-- next scheduled refresh. Indexes are recreated identically to migration
-- 114 (the unique index is required for REFRESH ... CONCURRENTLY in
-- src/lib/materializedViews.ts).
--
-- mv_user_engagement and mv_auction_analytics do not filter on
-- orders.status and are unchanged.

DROP MATERIALIZED VIEW IF EXISTS mv_seller_analytics;

CREATE MATERIALIZED VIEW mv_seller_analytics AS
SELECT
  l.seller_id                                                       AS seller_id,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('paid','shipped','delivered','completed'))
                                                                    AS listings_sold,
  COALESCE(SUM(o.subtotal_gbp) FILTER (WHERE o.status IN ('paid','shipped','delivered','completed')), 0)
                                                                    AS revenue_gbp,
  COALESCE(AVG(r.rating) FILTER (WHERE r.rating IS NOT NULL), 0)    AS avg_rating,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active')           AS active_listings
FROM listings l
LEFT JOIN orders o        ON o.listing_id = l.id
LEFT JOIN order_reviews r ON r.order_id = o.id
GROUP BY l.seller_id
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_seller_analytics_seller_uidx
  ON mv_seller_analytics (seller_id);

CREATE INDEX IF NOT EXISTS mv_seller_analytics_revenue_idx
  ON mv_seller_analytics (revenue_gbp DESC);

CREATE INDEX IF NOT EXISTS mv_seller_analytics_sold_idx
  ON mv_seller_analytics (listings_sold DESC);

DROP MATERIALIZED VIEW IF EXISTS mv_category_performance;

CREATE MATERIALIZED VIEW mv_category_performance AS
SELECT
  COALESCE(l.category, 'uncategorised')                     AS category,
  COUNT(DISTINCT l.id)                                      AS listings_count,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('paid','shipped','delivered','completed'))
                                                            AS sold_count,
  CASE
    WHEN COUNT(DISTINCT l.id) FILTER (WHERE l.status IN ('active','sold')) = 0 THEN 0
    ELSE COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('paid','shipped','delivered','completed'))::numeric
       / COUNT(DISTINCT l.id) FILTER (WHERE l.status IN ('active','sold'))
  END                                                       AS sell_through_rate,
  COALESCE(AVG(l.price_gbp) FILTER (WHERE l.status = 'active'), 0) AS avg_price_gbp
FROM listings l
LEFT JOIN orders o ON o.listing_id = l.id
GROUP BY COALESCE(l.category, 'uncategorised')
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_category_performance_category_uidx
  ON mv_category_performance (category);

CREATE INDEX IF NOT EXISTS mv_category_performance_sold_idx
  ON mv_category_performance (sold_count DESC);

CREATE INDEX IF NOT EXISTS mv_category_performance_sellthrough_idx
  ON mv_category_performance (sell_through_rate DESC);

-- Populate immediately. A plain (non-concurrent) REFRESH is required the
-- first time because the views were created WITH NO DATA; the scheduled
-- refresher takes over with CONCURRENTLY afterwards.
REFRESH MATERIALIZED VIEW mv_seller_analytics;
REFRESH MATERIALIZED VIEW mv_category_performance;
