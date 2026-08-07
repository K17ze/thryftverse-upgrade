-- Backend workflow closure: protected offer checkout, authoritative uploads,
-- concurrency-safe creator publishing, and executable price alerts.

CREATE TABLE IF NOT EXISTS listing_checkout_reservations (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL UNIQUE REFERENCES listing_offers(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'converted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  converted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS listing_checkout_one_active_listing_idx
  ON listing_checkout_reservations (listing_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS listing_checkout_expiry_idx
  ON listing_checkout_reservations (expires_at)
  WHERE status = 'active';

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

    IF FOUND AND (
      reservation_status <> 'active'
      OR reservation_expires_at <= NOW()
    ) THEN
      RAISE EXCEPTION 'LISTING_CHECKOUT_RESERVATION_EXPIRED'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE listing_checkout_reservations
    SET status = 'converted', converted_at = NOW(), updated_at = NOW()
    WHERE order_id = NEW.id AND status = 'active'
    RETURNING listing_id INTO reservation_listing_id;

    IF reservation_listing_id IS NOT NULL THEN
      UPDATE listings SET status = 'sold', updated_at = NOW()
      WHERE id = reservation_listing_id;
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    UPDATE listing_checkout_reservations
    SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
    WHERE order_id = NEW.id AND status = 'active'
    RETURNING listing_id INTO reservation_listing_id;

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

DROP TRIGGER IF EXISTS orders_listing_checkout_reconcile_trigger ON orders;
CREATE TRIGGER orders_listing_checkout_reconcile_trigger
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION reconcile_listing_checkout_from_order();

ALTER TABLE listing_offers
  ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_id TEXT REFERENCES listing_checkout_reservations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS listing_offers_order_idx
  ON listing_offers (order_id)
  WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS upload_intents (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  bucket TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  public_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS upload_intents_owner_idx
  ON upload_intents (owner_id, created_at DESC);

ALTER TABLE upload_finalizations
  ADD COLUMN IF NOT EXISTS upload_intent_id TEXT REFERENCES upload_intents(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS upload_finalizations_intent_idx
  ON upload_finalizations (upload_intent_id)
  WHERE upload_intent_id IS NOT NULL;

ALTER TABLE creator_documents
  ADD COLUMN IF NOT EXISTS next_revision_number INTEGER NOT NULL DEFAULT 1
    CHECK (next_revision_number > 0);

ALTER TABLE creator_document_revisions
  ADD COLUMN IF NOT EXISTS publish_key TEXT,
  ADD COLUMN IF NOT EXISTS document_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS creator_revision_publish_key_idx
  ON creator_document_revisions (document_id, publish_key)
  WHERE publish_key IS NOT NULL;

ALTER TABLE price_alerts
  ADD COLUMN IF NOT EXISTS last_observed_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS last_price_event_id BIGINT REFERENCES listing_price_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notification_event_id TEXT REFERENCES notification_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triggered_count INTEGER NOT NULL DEFAULT 0
    CHECK (triggered_count >= 0);

UPDATE price_alerts pa
SET last_observed_price = l.price_gbp
FROM listings l
WHERE pa.listing_id = l.id
  AND pa.last_observed_price IS NULL;
