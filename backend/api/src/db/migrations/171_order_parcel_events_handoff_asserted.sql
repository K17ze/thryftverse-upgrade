-- 171: Allow 'handoff_asserted' as an order_parcel_events event_type.
--
-- The seller handoff-assertion route records evidence that the seller handed
-- the parcel to a carrier or collection point. This is evidence only and does
-- not change orders.status. The original CHECK (migration 019) did not include
-- this event type, so the insert would fail at runtime.
--
-- Idempotent: drops and re-adds the constraint.

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
      'handoff_asserted'
    )
  );
