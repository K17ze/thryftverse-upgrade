-- 299_listing_promotions_down.sql
-- Rollback for flat-fee promoted listings.

DROP TABLE IF EXISTS promotion_impressions;
DROP TABLE IF EXISTS promotion_charges;
DROP TABLE IF EXISTS listing_promotions;

-- Restore the ledger_entries source_type CHECK to its migration-024 shape.
ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_source_type_check CHECK (
    source_type IN (
      'order_payment',
      'order_delivery',
      'payout',
      'refund',
      'adjustment',
      'mint',
      'burn',
      'coOwn_trade',
      'buyout',
      'reserve_reconcile',
      'transfer'
    )
  );
