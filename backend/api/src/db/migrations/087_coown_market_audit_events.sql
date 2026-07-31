-- 087_coown_market_audit_events.sql
-- Market-level audit events for Co-Own.
--
-- WS1 created coown_asset_audit_events for trust-profile changes
-- (SPV, custody, appraisal refresh). This table is the market-level
-- audit trail: price marks, supply changes, listing tier transitions,
-- rights publications. It's the SEC Rule 17Ad-7 pattern applied to
-- the marketplace itself.
--
-- Closes research gap #6 (audit trail) and #5 (stale mark visibility):
-- the frontend can show when the last market event occurred and flag
-- stale pricing when no events have been logged recently.

CREATE TABLE IF NOT EXISTS coown_market_audit_events (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'price_mark', 'supply_change', 'listing_tier_transition',
    'rights_published', 'trade_settled', 'trade_failed',
    'appraisal_refreshed', 'verification_tier_changed'
  )),
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 'public' events are visible to all users; 'internal' events are
  -- issuer/admin-only (e.g. corporate actions not yet disclosed).
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS coown_market_audit_events_asset_idx
  ON coown_market_audit_events (asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coown_market_audit_events_visibility_idx
  ON coown_market_audit_events (asset_id, visibility, created_at DESC)
  WHERE visibility = 'public';
