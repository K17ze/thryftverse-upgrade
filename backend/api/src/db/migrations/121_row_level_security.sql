-- Row-Level Security (RLS) policies for user-owned tables.
--
-- Enables RLS on tables that contain user-private data so that a single
-- database role can serve multiple users safely: each query is filtered by
-- the authenticated user id stored in the session setting
-- `app.current_user_id`.
--
-- IMPORTANT — API wiring requirement:
--   The API MUST set the user id on every connection before running any
--   user-scoped query:
--
--     SET LOCAL app.current_user_id = '<uuid>';
--
--   This is typically done inside a transaction or via a per-request
--   connection wrapper. If the setting is NULL (anonymous/unauthenticated),
--   the USING clauses evaluate to false and no user-owned rows are visible.
--
-- Admin bypass:
--   Roles created with BYPASSRLS (or the superuser) skip RLS entirely.
--   FORCE ROW LEVEL SECURITY is applied so that even the table owner is
--   subject to the policies unless they hold BYPASSRLS.
--
-- Idempotent: uses IF NOT EXISTS / DROP ... IF EXISTS guards so re-running
-- the migration is safe.

-- ── listings ────────────────────────────────────────────────────────────────
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listings_select ON listings;
CREATE POLICY listings_select ON listings
  FOR SELECT USING (
    seller_id::text = current_setting('app.current_user_id', true)
    OR status = 'active'
  );

DROP POLICY IF EXISTS listings_insert ON listings;
CREATE POLICY listings_insert ON listings
  FOR INSERT WITH CHECK (
    seller_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS listings_update ON listings;
CREATE POLICY listings_update ON listings
  FOR UPDATE USING (
    seller_id::text = current_setting('app.current_user_id', true)
  ) WITH CHECK (
    seller_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS listings_delete ON listings;
CREATE POLICY listings_delete ON listings
  FOR DELETE USING (
    seller_id::text = current_setting('app.current_user_id', true)
  );

-- ── orders ──────────────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_select ON orders;
CREATE POLICY orders_select ON orders
  FOR SELECT USING (
    buyer_id::text = current_setting('app.current_user_id', true)
    OR seller_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS orders_insert ON orders;
CREATE POLICY orders_insert ON orders
  FOR INSERT WITH CHECK (
    buyer_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS orders_update ON orders;
CREATE POLICY orders_update ON orders
  FOR UPDATE USING (
    buyer_id::text = current_setting('app.current_user_id', true)
    OR seller_id::text = current_setting('app.current_user_id', true)
  ) WITH CHECK (
    buyer_id::text = current_setting('app.current_user_id', true)
    OR seller_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS orders_delete ON orders;
CREATE POLICY orders_delete ON orders
  FOR DELETE USING (
    buyer_id::text = current_setting('app.current_user_id', true)
  );

-- ── messages ────────────────────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    sender_id::text = current_setting('app.current_user_id', true)
    OR recipient_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS messages_insert ON messages;
CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (
    sender_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS messages_update ON messages;
CREATE POLICY messages_update ON messages
  FOR UPDATE USING (
    sender_id::text = current_setting('app.current_user_id', true)
  ) WITH CHECK (
    sender_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS messages_delete ON messages;
CREATE POLICY messages_delete ON messages
  FOR DELETE USING (
    sender_id::text = current_setting('app.current_user_id', true)
  );

-- ── user_profiles ───────────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_select ON user_profiles;
CREATE POLICY user_profiles_select ON user_profiles
  FOR SELECT USING (
    user_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS user_profiles_insert ON user_profiles;
CREATE POLICY user_profiles_insert ON user_profiles
  FOR INSERT WITH CHECK (
    user_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS user_profiles_update ON user_profiles;
CREATE POLICY user_profiles_update ON user_profiles
  FOR UPDATE USING (
    user_id::text = current_setting('app.current_user_id', true)
  ) WITH CHECK (
    user_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS user_profiles_delete ON user_profiles;
CREATE POLICY user_profiles_delete ON user_profiles
  FOR DELETE USING (
    user_id::text = current_setting('app.current_user_id', true)
  );

-- ── wishlist_items ──────────────────────────────────────────────────────────
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wishlist_items_select ON wishlist_items;
CREATE POLICY wishlist_items_select ON wishlist_items
  FOR SELECT USING (
    user_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS wishlist_items_insert ON wishlist_items;
CREATE POLICY wishlist_items_insert ON wishlist_items
  FOR INSERT WITH CHECK (
    user_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS wishlist_items_update ON wishlist_items;
CREATE POLICY wishlist_items_update ON wishlist_items
  FOR UPDATE USING (
    user_id::text = current_setting('app.current_user_id', true)
  ) WITH CHECK (
    user_id::text = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS wishlist_items_delete ON wishlist_items;
CREATE POLICY wishlist_items_delete ON wishlist_items
  FOR DELETE USING (
    user_id::text = current_setting('app.current_user_id', true)
  );
