-- 325: Allow 'lost' and 'damaged' as order_parcel_events event_types.
--
-- Carriers report lost/damaged parcels explicitly — they are discrete
-- carrier facts, not flavours of a failed delivery attempt. Until now the
-- webhook normaliser folded 'lost' into 'delivery_failed' and dropped
-- 'damaged' into the 'in_transit' default, so the timeline could never
-- show the carrier truth (audit R40).
--
-- The coarse orders.status enum has no dedicated lost/damaged state:
-- 'delivery_failed' (migration 313: "carrier attempted/lost the parcel;
-- may still recover") remains the honest order-level mapping, and the
-- discrete event_type here preserves the carrier truth on the timeline.
-- Escrow is unaffected — the release sweep only pays 'delivered' orders.
--
-- Idempotent: drops and re-adds the constraint (pattern: migration 171).

ALTER TABLE order_parcel_events
  DROP CONSTRAINT IF EXISTS order_parcel_events_event_type_check;

ALTER TABLE order_parcel_events
  ADD CONSTRAINT order_parcel_events_event_type_check CHECK (
    event_type IN (
      'picked_up',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'collection_confirmed',
      'delivery_failed',
      'returned',
      'handoff_asserted',
      'lost',
      'damaged'
    )
  );
