-- Listing offers — server-authoritative offer lifecycle with expiry.
-- Previously offers were sent as free-text chat messages with client-computed
-- expiry. This table makes the offer status, expiry, and counter chain
-- server-authoritative so expiry sweeps and accept/decline transitions are
-- trustworthy across devices.

CREATE TABLE IF NOT EXISTS listing_offers (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_price_gbp NUMERIC(12, 2) NOT NULL CHECK (offer_price_gbp >= 0),
  original_price_gbp NUMERIC(12, 2) NOT NULL CHECK (original_price_gbp >= 0),
  counter_round INTEGER NOT NULL DEFAULT 0 CHECK (counter_round >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled', 'countered')),
  -- Server-authoritative expiry. The frontend may suggest an expiryHours but
  -- the server computes expires_at so clients cannot fake a longer window.
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  -- Optional chat conversation link so offer state changes can be mirrored
  -- into the conversation thread by the realtime bridge.
  conversation_id TEXT,
  parent_offer_id TEXT REFERENCES listing_offers(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_offers_listing_idx
  ON listing_offers (listing_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_offers_buyer_idx
  ON listing_offers (buyer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_offers_seller_idx
  ON listing_offers (seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_offers_expiry_idx
  ON listing_offers (expires_at)
  WHERE status = 'pending';

-- Trigger: update updated_at on listing_offers
CREATE OR REPLACE FUNCTION update_listing_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS listing_offers_updated_at_trigger ON listing_offers;
CREATE TRIGGER listing_offers_updated_at_trigger
  BEFORE UPDATE ON listing_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_listing_offers_updated_at();
