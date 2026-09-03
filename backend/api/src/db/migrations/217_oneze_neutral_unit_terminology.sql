-- Rename mg (milligram) terminology to neutral unit terminology.
-- 1ZE is a platform currency, not tokenized gold. The "mg" suffix implied
-- a commodity peg that no longer exists and created regulatory risk.
-- All column names are renamed from *_mg to *_units to reflect that 1ZE
-- uses generic minor units (1 1ZE = 1000 minor units).
--
-- This migration is intentionally idempotent — each rename is guarded by
-- an information_schema check so it is safe to re-run.

DO $$
BEGIN
  -- wallets.oneze_balance_mg -> oneze_balance_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallets'
      AND column_name = 'oneze_balance_mg'
  ) THEN
    ALTER TABLE wallets RENAME COLUMN oneze_balance_mg TO oneze_balance_units;
  END IF;

  -- oneze_wallet_segments.purchased_balance_mg -> purchased_balance_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'oneze_wallet_segments'
      AND column_name = 'purchased_balance_mg'
  ) THEN
    ALTER TABLE oneze_wallet_segments RENAME COLUMN purchased_balance_mg TO purchased_balance_units;
  END IF;

  -- oneze_wallet_segments.earned_balance_mg -> earned_balance_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'oneze_wallet_segments'
      AND column_name = 'earned_balance_mg'
  ) THEN
    ALTER TABLE oneze_wallet_segments RENAME COLUMN earned_balance_mg TO earned_balance_units;
  END IF;

  -- oneze_balance_origin_events.amount_mg -> amount_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'oneze_balance_origin_events'
      AND column_name = 'amount_mg'
  ) THEN
    ALTER TABLE oneze_balance_origin_events RENAME COLUMN amount_mg TO amount_units;
  END IF;

  -- withdrawals.amount_mg -> amount_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawals'
      AND column_name = 'amount_mg'
  ) THEN
    ALTER TABLE withdrawals RENAME COLUMN amount_mg TO amount_units;
  END IF;

  -- oneze_reconciliation_snapshots.circulating_mg -> circulating_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'oneze_reconciliation_snapshots'
      AND column_name = 'circulating_mg'
  ) THEN
    ALTER TABLE oneze_reconciliation_snapshots RENAME COLUMN circulating_mg TO circulating_units;
  END IF;

  -- oneze_reconciliation_snapshots.reserve_active_mg -> reserve_active_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'oneze_reconciliation_snapshots'
      AND column_name = 'reserve_active_mg'
  ) THEN
    ALTER TABLE oneze_reconciliation_snapshots RENAME COLUMN reserve_active_mg TO reserve_active_units;
  END IF;

  -- jurisdiction_policies.p2p_daily_limit_mg -> p2p_daily_limit_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jurisdiction_policies'
      AND column_name = 'p2p_daily_limit_mg'
  ) THEN
    ALTER TABLE jurisdiction_policies RENAME COLUMN p2p_daily_limit_mg TO p2p_daily_limit_units;
  END IF;

  -- jurisdiction_policies.p2p_monthly_limit_mg -> p2p_monthly_limit_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jurisdiction_policies'
      AND column_name = 'p2p_monthly_limit_mg'
  ) THEN
    ALTER TABLE jurisdiction_policies RENAME COLUMN p2p_monthly_limit_mg TO p2p_monthly_limit_units;
  END IF;

  -- jurisdiction_policies.p2p_per_tx_limit_mg -> p2p_per_tx_limit_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jurisdiction_policies'
      AND column_name = 'p2p_per_tx_limit_mg'
  ) THEN
    ALTER TABLE jurisdiction_policies RENAME COLUMN p2p_per_tx_limit_mg TO p2p_per_tx_limit_units;
  END IF;

  -- mint_operations.ize_amount_mg -> ize_amount_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mint_operations'
      AND column_name = 'ize_amount_mg'
  ) THEN
    ALTER TABLE mint_operations RENAME COLUMN ize_amount_mg TO ize_amount_units;
  END IF;

  -- coown_order_reservations.reserved_1ze_mg -> reserved_1ze_units
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coown_order_reservations'
      AND column_name = 'reserved_1ze_mg'
  ) THEN
    ALTER TABLE coown_order_reservations RENAME COLUMN reserved_1ze_mg TO reserved_1ze_units;
  END IF;
END $$;

-- Archive legacy gold tables by renaming them if they still exist.
-- Migration 023 already dropped most gold artefacts; these renames are
-- a safety net for any environment where those tables survived.
DO $$
BEGIN
  IF to_regclass('public.gold_reserve_lots') IS NOT NULL THEN
    ALTER TABLE gold_reserve_lots RENAME TO legacy_gold_reserve_lots;
  END IF;

  IF to_regclass('public.gold_price_ticks') IS NOT NULL THEN
    ALTER TABLE gold_price_ticks RENAME TO legacy_gold_price_ticks;
  END IF;
END $$;
