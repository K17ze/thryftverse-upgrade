-- Reverts 305_listing_pause_provenance: restores the
-- reconcile_listing_checkout_from_order trigger function to its
-- 071_commerce_checkout_exclusivity definition (restores ANY paused listing)
-- and drops the pause provenance column.

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

ALTER TABLE listings
  DROP COLUMN IF EXISTS pause_source;

-- Restore the 131_payment_idempotency_unknown_states vocabulary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_intents_status_check'
      AND conrelid = 'payment_intents'::regclass
  ) THEN RETURN; END IF;

  ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_status_check;
  ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_status_check CHECK (
    status IN (
      'requires_payment_method',
      'requires_confirmation',
      'processing',
      'succeeded',
      'failed',
      'cancelled',
      'unknown',
      'reconciled'
    )
  );
END;
$$;
