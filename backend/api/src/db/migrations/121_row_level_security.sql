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
-- Idempotent: every table section is wrapped in a DO block that checks
-- to_regclass() so the migration is a no-op for tables that do not exist.
-- This prevents the migration from failing on nonexistent tables.

-- ── listings ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.listings') IS NULL THEN RETURN; END IF;

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
END;
$$;

-- ── orders ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN RETURN; END IF;

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
END;
$$;

-- ── chat_messages ───────────────────────────────────────────────────────────
-- Conversation-based messages: a user can see messages in conversations
-- they are a member of, or messages they sent. sender_user_id is the
-- column on chat_messages (not sender_id).
DO $$
BEGIN
  IF to_regclass('public.chat_messages') IS NULL THEN RETURN; END IF;

  ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
  CREATE POLICY chat_messages_select ON chat_messages
    FOR SELECT USING (
      sender_user_id::text = current_setting('app.current_user_id', true)
      OR EXISTS (
        SELECT 1 FROM chat_members cm
        WHERE cm.conversation_id = chat_messages.conversation_id
          AND cm.user_id::text = current_setting('app.current_user_id', true)
      )
    );

  DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
  CREATE POLICY chat_messages_insert ON chat_messages
    FOR INSERT WITH CHECK (
      sender_user_id::text = current_setting('app.current_user_id', true)
    );

  DROP POLICY IF EXISTS chat_messages_update ON chat_messages;
  CREATE POLICY chat_messages_update ON chat_messages
    FOR UPDATE USING (
      sender_user_id::text = current_setting('app.current_user_id', true)
    ) WITH CHECK (
      sender_user_id::text = current_setting('app.current_user_id', true)
    );

  DROP POLICY IF EXISTS chat_messages_delete ON chat_messages;
  CREATE POLICY chat_messages_delete ON chat_messages
    FOR DELETE USING (
      sender_user_id::text = current_setting('app.current_user_id', true)
    );
END;
$$;

-- ── user_secure_profiles ────────────────────────────────────────────────────
-- User-encrypted profile data: only the owning user can access their row.
DO $$
BEGIN
  IF to_regclass('public.user_secure_profiles') IS NULL THEN RETURN; END IF;

  ALTER TABLE user_secure_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE user_secure_profiles FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS user_secure_profiles_select ON user_secure_profiles;
  CREATE POLICY user_secure_profiles_select ON user_secure_profiles
    FOR SELECT USING (
      user_id::text = current_setting('app.current_user_id', true)
    );

  DROP POLICY IF EXISTS user_secure_profiles_insert ON user_secure_profiles;
  CREATE POLICY user_secure_profiles_insert ON user_secure_profiles
    FOR INSERT WITH CHECK (
      user_id::text = current_setting('app.current_user_id', true)
    );

  DROP POLICY IF EXISTS user_secure_profiles_update ON user_secure_profiles;
  CREATE POLICY user_secure_profiles_update ON user_secure_profiles
    FOR UPDATE USING (
      user_id::text = current_setting('app.current_user_id', true)
    ) WITH CHECK (
      user_id::text = current_setting('app.current_user_id', true)
    );

  DROP POLICY IF EXISTS user_secure_profiles_delete ON user_secure_profiles;
  CREATE POLICY user_secure_profiles_delete ON user_secure_profiles
    FOR DELETE USING (
      user_id::text = current_setting('app.current_user_id', true)
    );
END;
$$;
