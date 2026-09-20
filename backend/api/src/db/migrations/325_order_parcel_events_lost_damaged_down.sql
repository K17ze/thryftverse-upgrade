-- Rollback for 325_order_parcel_events_lost_damaged.sql.
--
-- Rows already recorded as 'lost'/'damaged' cannot be represented under
-- the old constraint — they are rewritten to 'delivery_failed' (the same
-- coarse carrier-failure bucket they mapped to before; the original
-- carrier report remains in the row's payload JSONB).

UPDATE order_parcel_events
   SET event_type = 'delivery_failed'
 WHERE event_type IN ('lost', 'damaged');

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
