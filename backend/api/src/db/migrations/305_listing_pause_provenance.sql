-- Listing pause provenance: a checkout reservation pauses the listing for the
-- buyer, but expiry/restore paths must never undo a pause the seller (or an
-- auction / co-own flow) made themselves. `pause_source` records WHO paused
-- the listing so automatic restoration only ever touches the pause it owns.
--
-- Vocabulary:
--   'seller'               — seller-initiated pause (PATCH /listings, upsert,
--                            listing command service, admin tools)
--   'checkout_reservation' — paused by an active listing_checkout_reservations
--                            row (direct buy, offer acceptance, live lot)
--   'auction'              — paused while an auction is running
--   'coown_asset'          — paused while co-own fractionalisation runs
--   NULL                   — listing is not paused by an automated flow
--
-- Invariants enforced by the application layer:
--   * every reservation-driven pause writes 'checkout_reservation';
--   * every seller-driven pause writes 'seller';
--   * automatic restores require pause_source = '<their own source>'.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS pause_source TEXT
    CHECK (pause_source IN (
      'seller', 'checkout_reservation', 'auction', 'coown_asset'
    ));

-- Backfill provenance for listings already paused at migration time.
-- A listing paused while a checkout reservation is still active was paused
-- by that reservation — restoring it on expiry remains correct.
UPDATE listings l
SET pause_source = 'checkout_reservation'
WHERE l.status = 'paused'
  AND l.pause_source IS NULL
  AND EXISTS (
    SELECT 1
    FROM listing_checkout_reservations r
    WHERE r.listing_id = l.id
      AND r.status = 'active'
  );

-- A listing paused while a non-terminal auction references it was paused by
-- the auction lifecycle.
UPDATE listings l
SET pause_source = 'auction'
WHERE l.status = 'paused'
  AND l.pause_source IS NULL
  AND EXISTS (
    SELECT 1
    FROM auctions a
    WHERE a.listing_id = l.id
      AND a.status IN ('upcoming', 'live', 'ended', 'awaiting_payment', 'second_chance_offered')
  );

-- Everything else still paused predates provenance; conservatively mark it
-- seller-owned so no automated path ever reactivates it silently.
UPDATE listings
SET pause_source = 'seller'
WHERE status = 'paused'
  AND pause_source IS NULL;

-- payment_intents.status: 'provider_submission_pending' has been a valid
-- application status since the P1 reconciler landed (see
-- 303_payment_reconcile_indexes.sql, which partial-indexes it), but the
-- CHECK constraint rebuilt by 131_payment_idempotency_unknown_states never
-- listed it — inserts/updates carrying the status are rejected on a fully
-- migrated database. Rebuild the constraint with the complete vocabulary
-- the money path relies on, including the in-flight guard added alongside
-- this migration.
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
      'provider_submission_pending',
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

-- Replaces the 071_commerce_checkout_exclusivity version: identical
-- reservation/order semantics, but the two listing writes now respect
-- pause provenance —
--   * 'paid'    → listing sold also clears pause_source;
--   * 'cancelled' → restore to 'active' ONLY when the pause came from a
--     checkout reservation; a seller/auction pause survives.
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

    UPDATE listings SET status = 'sold', pause_source = NULL, updated_at = NOW()
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

    -- Restore the listing only when THIS reservation system owns the pause.
    -- pause_source = 'seller'/'auction'/'coown_asset' (or any other value)
    -- means someone else paused it — expiry cleanup must not undo that.
    IF reservation_listing_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM listing_checkout_reservations
         WHERE listing_id = reservation_listing_id AND status = 'active'
       ) THEN
      UPDATE listings
      SET status = 'active', pause_source = NULL, updated_at = NOW()
      WHERE id = reservation_listing_id
        AND status = 'paused'
        AND pause_source = 'checkout_reservation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
