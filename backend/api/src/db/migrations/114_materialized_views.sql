-- Migration 114: Materialized views for analytics dashboards
--
-- Pre-aggregates large-table scans into refreshable materialized views so
-- analytics endpoints read a single small view instead of scanning orders,
-- listings, auction_bids and order_reviews on every request.
--
-- Each view has a unique index so it can be refreshed with
--   REFRESH MATERIALIZED VIEW CONCURRENTLY
-- which avoids blocking readers during the refresh.

-- ─────────────────────────────────────────────────────────────────────────────
-- mv_seller_analytics — seller performance summary (refreshed daily)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_seller_analytics AS
SELECT
  l.seller_id                                                       AS seller_id,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('paid','shipped','delivered'))
                                                                    AS listings_sold,
  COALESCE(SUM(o.subtotal_gbp) FILTER (WHERE o.status IN ('paid','shipped','delivered')), 0)
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

-- ─────────────────────────────────────────────────────────────────────────────
-- mv_user_engagement — user engagement metrics (refreshed hourly)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_engagement AS
SELECT
  i.user_id                                                AS user_id,
  DATE_TRUNC('day', i.created_at)                          AS day,
  COUNT(DISTINCT i.id)                                     AS actions,
  COUNT(DISTINCT i.id) FILTER (WHERE i.action = 'view')    AS screen_views,
  COUNT(DISTINCT i.id) FILTER (WHERE i.action = 'purchase') AS purchases
FROM interactions i
GROUP BY i.user_id, DATE_TRUNC('day', i.created_at)
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_user_engagement_user_day_uidx
  ON mv_user_engagement (user_id, day);

CREATE INDEX IF NOT EXISTS mv_user_engagement_day_idx
  ON mv_user_engagement (day DESC);

CREATE INDEX IF NOT EXISTS mv_user_engagement_actions_idx
  ON mv_user_engagement (actions DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- mv_category_performance — category-level metrics (refreshed daily)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_category_performance AS
SELECT
  COALESCE(l.category, 'uncategorised')                     AS category,
  COUNT(DISTINCT l.id)                                      AS listings_count,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('paid','shipped','delivered'))
                                                            AS sold_count,
  CASE
    WHEN COUNT(DISTINCT l.id) FILTER (WHERE l.status IN ('active','sold')) = 0 THEN 0
    ELSE COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('paid','shipped','delivered'))::numeric
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

-- ─────────────────────────────────────────────────────────────────────────────
-- mv_auction_analytics — auction metrics (refreshed hourly)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_auction_analytics AS
SELECT
  a.id                                                       AS auction_id,
  a.listing_id                                               AS listing_id,
  a.seller_id                                                AS seller_id,
  COALESCE(COUNT(b.id), 0)                                   AS total_bids,
  COUNT(DISTINCT b.bidder_id)                                AS unique_bidders,
  COALESCE(MAX(b.amount_gbp), a.current_bid_gbp)             AS final_price_gbp,
  EXTRACT(EPOCH FROM (COALESCE(a.settled_at, NOW()) - a.starts_at))::bigint AS duration_seconds
FROM auctions a
LEFT JOIN auction_bids b ON b.auction_id = a.id
GROUP BY a.id, a.listing_id, a.seller_id, a.current_bid_gbp, a.starts_at, a.settled_at
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_auction_analytics_auction_uidx
  ON mv_auction_analytics (auction_id);

CREATE INDEX IF NOT EXISTS mv_auction_analytics_seller_idx
  ON mv_auction_analytics (seller_id);

CREATE INDEX IF NOT EXISTS mv_auction_analytics_bids_idx
  ON mv_auction_analytics (total_bids DESC);

CREATE INDEX IF NOT EXISTS mv_auction_analytics_price_idx
  ON mv_auction_analytics (final_price_gbp DESC);
