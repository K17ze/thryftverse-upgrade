-- 313: orders.status gains 'delivery_failed' and 'returned'.
--
-- Carrier webhooks already persist delivery_failed / returned parcel events,
-- but applyOrderParcelEvent could never advance orders.status past
-- 'shipped' — a failed or returned parcel left the order stuck at 'shipped'
-- with escrow held and no truthful buyer-facing state. The client already
-- understands both statuses (normaliseOrderStatus maps the underscore forms,
-- humaniseStatus/getStatusTone/isTerminalStatus cover them).
--
-- 'delivery_failed' — carrier attempted/lost the parcel; may still recover
--   (a later out_for_delivery/delivered event re-advances it).
-- 'returned' — carrier return-to-sender; terminal for the shipment. Escrow
--   never releases: the sweep only pays out on status='delivered', and the
--   refund/return-case flow owns the money from here.

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'created',
      'paid',
      'shipped',
      'delivered',
      'completed',
      'cancelled',
      'refunded',
      'refunding',
      'delivery_failed',
      'returned'
    )
  );
