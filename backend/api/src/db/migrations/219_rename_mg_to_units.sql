-- Supplementary _mg -> _units rename for columns not covered by migration 217.
--
-- Migration 217 (oneze_neutral_unit_terminology) renamed all _mg columns on
-- active 1ZE tables (wallets, oneze_wallet_segments, oneze_balance_origin_events,
-- withdrawals, oneze_reconciliation_snapshots, jurisdiction_policies,
-- mint_operations, coown_order_reservations) and archived gold_reserve_lots
-- and gold_price_ticks.
--
-- This migration handles the remaining gold-era artefact: the reserve_movements
-- table, which still has a delta_mg column and a FK to the (now renamed)
-- gold_reserve_lots table. The table is archived rather than renamed because
-- it belongs to the decommissioned gold reserve system (migration 023 dropped
-- most gold artefacts; 217 archived the surviving tables).
--
-- All renames are idempotent — guarded by information_schema / to_regclass
-- checks so they are safe to re-run on any environment state.

DO $$
BEGIN
  -- reserve_movements.delta_mg -> delta_units
  -- (only if the table still exists under its original name and the column
  --  has not already been renamed)
  IF to_regclass('public.reserve_movements') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reserve_movements'
        AND column_name = 'delta_mg'
    ) THEN
      ALTER TABLE reserve_movements RENAME COLUMN delta_mg TO delta_units;
    END IF;
  END IF;

  -- gold_reserve_lots.weight_mg -> weight_units
  -- (only if the table still exists under its original name — 217 may have
  --  already renamed it to legacy_gold_reserve_lots)
  IF to_regclass('public.gold_reserve_lots') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'gold_reserve_lots'
        AND column_name = 'weight_mg'
    ) THEN
      ALTER TABLE gold_reserve_lots RENAME COLUMN weight_mg TO weight_units;
    END IF;
  END IF;
END $$;

-- Archive the reserve_movements table (gold reserve system artefact).
-- It has a FK to gold_reserve_lots which 217 may have already renamed to
-- legacy_gold_reserve_lots. Renaming the table preserves the FK while
-- removing it from the active schema namespace.
DO $$
BEGIN
  IF to_regclass('public.reserve_movements') IS NOT NULL THEN
    ALTER TABLE reserve_movements RENAME TO legacy_reserve_movements;
  END IF;
END $$;
