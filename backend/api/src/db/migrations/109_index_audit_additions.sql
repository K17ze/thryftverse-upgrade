-- 109_index_audit_additions.sql
-- Missing indexes identified by the 2026 August database index audit.
-- These cover hot query paths on `listings` that were doing sequential scans.
--
-- NOTE: The migration runner (backend/api/src/db/migrate.ts) wraps every
-- migration in BEGIN/COMMIT, so CREATE INDEX CONCURRENTLY cannot be used here
-- (CONCURRENTLY is not allowed inside a transaction block). Plain
-- CREATE INDEX IF NOT EXISTS is used instead. These indexes are additive only
-- and safe to re-run.
--
-- Audit findings for the other hot-path tables mentioned in the audit brief:
--   * chat_messages        — chat_messages_conversation_created_idx (conversation_id, created_at DESC) already exists (migration 010)
--   * orders               — orders_buyer_idx (buyer_id, created_at DESC) and orders_seller_idx (seller_id, created_at DESC) already exist (migration 003)
--   * notification_events  — notification_events_unread_idx (user_id, read_at) WHERE read_at IS NULL already exists (migration 043)
--   * auction_bids         — auction_bids_auction_idx (auction_id, created_at DESC) already exists (migration 003)
-- Only `listings` was missing indexes for its two hottest query paths.

-- Feed: GET /listings always filters status = 'active' and sorts by created_at DESC, id DESC.
-- Equality-first, range-second: status (equality) then created_at (range/sort).
-- id DESC is included to support the keyset cursor (l.created_at, l.id) < (...).
CREATE INDEX IF NOT EXISTS idx_listings_status_created_at
  ON listings (status, created_at DESC, id DESC);

-- Seller dashboard: GET /users/:userId/listings filters by seller_id (+ optional status)
-- and sorts by created_at DESC. Also serves the active-listing count query and the
-- related-listings query (l.seller_id = $2 AND l.status = 'active').
-- Equality-first, range-second: seller_id (equality), status (equality), created_at (range/sort).
CREATE INDEX IF NOT EXISTS idx_listings_seller_status_created_at
  ON listings (seller_id, status, created_at DESC);
