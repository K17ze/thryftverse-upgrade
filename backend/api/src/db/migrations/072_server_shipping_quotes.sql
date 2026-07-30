-- Server-issued commerce shipping quotes. Checkout consumes the quote ID
-- instead of accepting a client-authored postage amount.

CREATE TABLE IF NOT EXISTS commerce_shipping_quotes (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  address_id BIGINT REFERENCES user_addresses(id) ON DELETE CASCADE,
  carrier_id TEXT NOT NULL,
  carrier_label TEXT NOT NULL,
  price_gbp NUMERIC(12, 2) NOT NULL CHECK (price_gbp >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP' CHECK (char_length(currency) = 3),
  source TEXT NOT NULL CHECK (source IN ('live', 'fallback')),
  quote_hash TEXT NOT NULL,
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  used_order_id TEXT UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commerce_shipping_quotes_buyer_idx
  ON commerce_shipping_quotes (buyer_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS commerce_shipping_quotes_expiry_idx
  ON commerce_shipping_quotes (expires_at)
  WHERE used_order_id IS NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_quote_id TEXT
    REFERENCES commerce_shipping_quotes(id) ON DELETE SET NULL;
