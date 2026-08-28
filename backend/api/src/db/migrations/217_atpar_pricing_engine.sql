-- At-par pricing engine refactor.
-- 1ZE is now USD-referenced at par (1 1ZE = 1.00 USD). The principal rate is
-- always 1:1 with no markup/markdown baked into the monetary principal. A small
-- transparent platform spread (FX fee) is applied as a separate line item on
-- load and withdraw. Old markup/markdown/PPP columns are retained for backward
-- compatibility but are no longer used by the pricing engine.

ALTER TABLE oneze_country_pricing_profiles
  ADD COLUMN IF NOT EXISTS fx_fee_bps INT NOT NULL DEFAULT 200
    CHECK (fx_fee_bps BETWEEN 100 AND 300);

ALTER TABLE oneze_country_pricing_profiles
  ADD COLUMN IF NOT EXISTS load_fee_bps INT NOT NULL DEFAULT 200
    CHECK (load_fee_bps BETWEEN 100 AND 300);

ALTER TABLE oneze_country_pricing_profiles
  ADD COLUMN IF NOT EXISTS withdraw_fee_bps INT NOT NULL DEFAULT 200
    CHECK (withdraw_fee_bps BETWEEN 100 AND 300);

-- Re-anchor to USD at par: 1 1ZE = 1.00 USD.
UPDATE oneze_anchor_config
  SET anchor_currency = 'USD',
      anchor_value = 1,
      notes = 'At-par USD reference anchor: 1 1ZE = 1.00 USD',
      updated_at = NOW()
  WHERE id = 1;

INSERT INTO oneze_anchor_config (id, anchor_currency, anchor_value, notes)
VALUES (1, 'USD', 1, 'At-par USD reference anchor: 1 1ZE = 1.00 USD')
ON CONFLICT (id) DO NOTHING;
