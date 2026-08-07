-- Commerce checkout closure: direct-buy and accepted-offer orders share one
-- reservation invariant, payment retries are payload-bound, and every order
-- transition has a durable timeline.

ALTER TABLE listing_checkout_reservations
  ALTER COLUMN offer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'offer'
    CHECK (source IN ('direct', 'offer', 'auction')),
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS checkout_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_version TEXT,
  ADD COLUMN IF NOT EXISTS quote_hash TEXT,
  ADD COLUMN IF NOT EXISTS quote_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS orders_buyer_idempotency_idx
  ON orders (buyer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_checkout_expiry_idx
  ON orders (checkout_expires_at)
  WHERE status = 'created';

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS request_hash TEXT;

ALTER TABLE payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_idempotency_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_user_idempotency_idx
  ON payment_intents (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  deduplication_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS order_events_deduplication_idx
  ON order_events (order_id, deduplication_key)
  WHERE deduplication_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_events_timeline_idx
  ON order_events (order_id, created_at ASC, id ASC);

CREATE OR REPLACE FUNCTION reconcile_listing_checkout_from_order()
RETURNS TRIGGER AS $$
DECLARE
  reservation_listing_id TEXT;
  reservation_status TEXT;
  reservation_expires_at TIMESTAMPTZ;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    SELECT listing_id, status, expires_at
    INTO reservation_listing_id, reservation_status, reservation_expires_at
    FROM listing_checkout_reservations
    WHERE order_id = NEW.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'LISTING_CHECKOUT_RESERVATION_MISSING'
        USING ERRCODE = 'P0001';
    END IF;

    -- Starting a payment after expiry is rejected by the API. Once a provider
    -- attempt has begun, an otherwise-active exclusive reservation may still
    -- settle after its display TTL without creating a captured-but-unowned
    -- payment.
    IF reservation_status <> 'active' THEN
      RAISE EXCEPTION 'LISTING_CHECKOUT_RESERVATION_EXPIRED'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE listing_checkout_reservations
    SET status = 'converted', converted_at = NOW(), updated_at = NOW()
    WHERE order_id = NEW.id AND status = 'active'
    RETURNING listing_id INTO reservation_listing_id;

    UPDATE listing_offers
    SET metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object('checkoutStatus', 'converted_to_order'),
        updated_at = NOW()
    WHERE order_id = NEW.id;

    UPDATE listings SET status = 'sold', updated_at = NOW()
    WHERE id = reservation_listing_id;
  ELSIF NEW.status = 'cancelled' THEN
    UPDATE listing_checkout_reservations
    SET status = 'cancelled',
        cancelled_at = NOW(),
        failure_reason = COALESCE(
          failure_reason,
          CASE WHEN NEW.payment_failed_at IS NOT NULL THEN 'payment_failed' ELSE 'order_cancelled' END
        ),
        updated_at = NOW()
    WHERE order_id = NEW.id AND status = 'active'
    RETURNING listing_id INTO reservation_listing_id;

    UPDATE listing_offers
    SET status = CASE
          WHEN NEW.payment_failed_at IS NOT NULL THEN 'expired'
          ELSE 'cancelled'
        END,
        expired_at = CASE
          WHEN NEW.payment_failed_at IS NOT NULL THEN COALESCE(expired_at, NOW())
          ELSE expired_at
        END,
        cancelled_at = CASE
          WHEN NEW.payment_failed_at IS NULL THEN COALESCE(cancelled_at, NOW())
          ELSE cancelled_at
        END,
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'checkoutStatus',
            CASE WHEN NEW.payment_failed_at IS NOT NULL THEN 'payment_failed' ELSE 'cancelled' END
          ),
        updated_at = NOW()
    WHERE order_id = NEW.id
      AND status = 'accepted';

    IF reservation_listing_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM listing_checkout_reservations
         WHERE listing_id = reservation_listing_id AND status = 'active'
       ) THEN
      UPDATE listings SET status = 'active', updated_at = NOW()
      WHERE id = reservation_listing_id AND status = 'paused';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
