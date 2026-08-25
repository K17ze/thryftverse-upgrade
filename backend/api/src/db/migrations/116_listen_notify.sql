-- Migration 116: PostgreSQL LISTEN/NOTIFY for cache invalidation
--
-- Adds AFTER INSERT/UPDATE/DELETE triggers on listings, users and orders
-- that emit NOTIFY on dedicated channels. A separate long-lived pg
-- connection (see src/lib/listenNotify.ts) subscribes to these channels
-- and invalidates the corresponding Redis cache keys.
--
-- Channels:
--   listing_changed  — payload: row_to_json of the changed listing
--   user_changed     — payload: row_to_json of the changed user
--   order_changed    — payload: row_to_json of the changed order
--
-- Payloads for DELETE use OLD; for INSERT/UPDATE use NEW.

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger functions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_listing_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('listing_changed', json_build_object(
      'op', TG_OP,
      'old', row_to_json(OLD)
    )::text);
  ELSE
    PERFORM pg_notify('listing_changed', json_build_object(
      'op', TG_OP,
      'new', row_to_json(NEW)
    )::text);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_user_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('user_changed', json_build_object(
      'op', TG_OP,
      'old', row_to_json(OLD)
    )::text);
  ELSE
    PERFORM pg_notify('user_changed', json_build_object(
      'op', TG_OP,
      'new', row_to_json(NEW)
    )::text);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_order_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('order_changed', json_build_object(
      'op', TG_OP,
      'old', row_to_json(OLD)
    )::text);
  ELSE
    PERFORM pg_notify('order_changed', json_build_object(
      'op', TG_OP,
      'new', row_to_json(NEW)
    )::text);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS listings_notify_changed ON listings;
CREATE TRIGGER listings_notify_changed
  AFTER INSERT OR UPDATE OR DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION notify_listing_changed();

DROP TRIGGER IF EXISTS users_notify_changed ON users;
CREATE TRIGGER users_notify_changed
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION notify_user_changed();

DROP TRIGGER IF EXISTS orders_notify_changed ON orders;
CREATE TRIGGER orders_notify_changed
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_changed();
