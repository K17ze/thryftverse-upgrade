-- Seed USD-based FX rates for the at-par model (1 1ZE = $1.00 USD).
-- The pricing engine resolves USD→local rates via resolveInternalFxRate.
-- These seeds cover all supported payout corridors. Operator can override
-- via setInternalFxRate at runtime.

INSERT INTO oneze_internal_fx_rates (base_currency, quote_currency, rate, source, metadata)
VALUES
  ('USD', 'GBP', 0.79000000, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('GBP', 'USD', 1.26582278, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('USD', 'EUR', 0.92000000, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('EUR', 'USD', 1.08695652, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('USD', 'INR', 83.30000000, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('INR', 'USD', 0.01200480, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('USD', 'NGN', 760.00000000, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('NGN', 'USD', 0.00131579, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('USD', 'JPY', 151.00000000, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('JPY', 'USD', 0.00662252, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('USD', 'CAD', 1.36000000, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('CAD', 'USD', 0.73529412, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('USD', 'AUD', 1.53000000, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('AUD', 'USD', 0.65359477, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('USD', 'AED', 3.67000000, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb),
  ('AED', 'USD', 0.27247956, 'seed', '{"seed":true,"atParAnchor":"USD"}'::jsonb)
ON CONFLICT (base_currency, quote_currency)
DO UPDATE
  SET
    rate = EXCLUDED.rate,
    source = EXCLUDED.source,
    metadata = oneze_internal_fx_rates.metadata || EXCLUDED.metadata,
    updated_at = NOW();
