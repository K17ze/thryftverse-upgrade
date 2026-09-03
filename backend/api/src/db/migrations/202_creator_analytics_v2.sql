-- Creator analytics v2: versioned event log, daily aggregates with
-- watermark/completeness, per-content ranking, and the earnings ledger.
--
-- Deploys alongside v1 tables (098_creator_analytics.sql). v1 is never
-- silently reinterpreted — v2 is the authoritative surface once backfilled.
--
-- Key differences from v1:
--  * event_id for dedupe (no duplicate canonical events)
--  * schema_version + metric_version on every row
--  * viewer_kind distinguishes authenticated / anonymous / pseudonym
--  * session_id, impression_id, surface, position for exposure qualification
--  * occurred_at (when it happened) vs received_at (when we got it)
--  * source: client | domain_outbox | server
--  * engagement_rate typed NUMERIC(6,5) — allows ratios > 1.0
--  * completeness enum on daily aggregate
--  * per-content daily aggregate for content ranking
--  * immutable earnings ledger (balance is a projection, never mutated)
--  * versioned commission agreements
--  * attribution touchpoints + decisions

-- ── Versioned event log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_analytics_events_v2 (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  viewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  viewer_kind TEXT NOT NULL DEFAULT 'authenticated'
    CHECK (viewer_kind IN ('authenticated', 'anonymous', 'pseudonym')),
  session_id TEXT,
  impression_id TEXT,
  surface TEXT,
  position INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INTEGER NOT NULL DEFAULT 1,
  metric_version TEXT NOT NULL DEFAULT 'creator-analytics-2',
  consent_region TEXT,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'client'
    CHECK (source IN ('client', 'domain_outbox', 'server')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cae_v2_event_type_chk CHECK (event_type IN (
    'view', 'qualified_view', 'like', 'save', 'comment',
    'share', 'product_click', 'profile_visit'
  )),
  CONSTRAINT cae_v2_content_type_chk CHECK (content_type IN (
    'look', 'poster', 'story'
  ))
);

CREATE INDEX IF NOT EXISTS cae_v2_creator_idx
  ON creator_analytics_events_v2 (creator_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS cae_v2_content_idx
  ON creator_analytics_events_v2 (content_type, content_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS cae_v2_received_idx
  ON creator_analytics_events_v2 (received_at DESC);

-- ── Daily aggregate with metric_version + completeness ─────────────────
CREATE TABLE IF NOT EXISTS creator_analytics_daily_v2 (
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  metric_version TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  qualified_views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  product_clicks INTEGER NOT NULL DEFAULT 0,
  profile_visits INTEGER NOT NULL DEFAULT 0,
  unique_viewers INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(6, 5) NOT NULL DEFAULT 0,
  completeness TEXT NOT NULL DEFAULT 'provisional'
    CHECK (completeness IN ('complete', 'provisional', 'delayed', 'unavailable')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (creator_id, date, metric_version)
);

-- ── Per-content daily aggregate for content ranking ────────────────────
CREATE TABLE IF NOT EXISTS creator_analytics_content_daily (
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  date DATE NOT NULL,
  metric_version TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  product_clicks INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(6, 5) NOT NULL DEFAULT 0,
  PRIMARY KEY (creator_id, content_type, content_id, date, metric_version)
);

CREATE INDEX IF NOT EXISTS cacd_creator_date_idx
  ON creator_analytics_content_daily (creator_id, date DESC, metric_version);

-- ── Earnings ledger — immutable entries, balance is a projection ───────
CREATE TABLE IF NOT EXISTS creator_earning_entries (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_item_id TEXT,
  attribution_decision_id TEXT,
  agreement_version TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'estimated', 'earned', 'held', 'adjustment',
    'refund_reversal', 'chargeback_reversal', 'payout'
  )),
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'held', 'finalized', 'paid', 'reversed')),
  available_at TIMESTAMPTZ,
  reversed_entry_id TEXT REFERENCES creator_earning_entries(id),
  related_order_id TEXT,
  related_refund_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cee_creator_idx
  ON creator_earning_entries (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cee_status_idx
  ON creator_earning_entries (creator_id, status, available_at);

-- ── Commission agreements — versioned ──────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_agreements (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1000,
  basis TEXT NOT NULL DEFAULT 'gross_sale'
    CHECK (basis IN ('gross_sale', 'net_sale', 'per_item', 'per_click')),
  version INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ca_creator_idx
  ON commission_agreements (creator_id, effective_from DESC);

-- ── Attribution touchpoints ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attribution_touchpoints (
  id TEXT PRIMARY KEY,
  viewer_key TEXT NOT NULL,
  session_id TEXT,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  listing_id TEXT,
  surface TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS at_viewer_idx
  ON attribution_touchpoints (viewer_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS at_creator_idx
  ON attribution_touchpoints (creator_id, occurred_at DESC);

-- ── Attribution decisions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attribution_decisions (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  touchpoint_id TEXT REFERENCES attribution_touchpoints(id),
  credit_ratio NUMERIC(5, 4) NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ad_order_idx
  ON attribution_decisions (order_item_id);
CREATE INDEX IF NOT EXISTS ad_creator_idx
  ON attribution_decisions (creator_id, decided_at DESC);
